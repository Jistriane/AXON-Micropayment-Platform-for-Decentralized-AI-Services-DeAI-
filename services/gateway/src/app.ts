import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { InferenceRequest, PaymentRequest } from "@axon/shared";
import { config } from "./config.js";
import { addModel, addPayment, findModelById, findPaymentByRef, listActiveModels, listPayments, initializeDb, updatePaymentTxStatus } from "./store.js";
import { authorizeAndSettlePayment, validateX402Header } from "./payment.js";
import { runInference } from "./inference.js";
import { resolveTxStatus } from "./soroban.js";
import { verifyPaymentProofSignature } from "./stellar.js";

const STELLAR_PUBLIC_KEY_PATTERN = /^G[A-Z2-7]{55}$/;
const ONCHAIN_TX_HASH_PATTERN = /^[0-9a-f]{64}$/i;

function resolveSettlementCapability() {
  const facilitatorConfiguredForRequiredMode =
    config.enableFacilitatorSettlement &&
    Boolean(config.facilitatorUrl) &&
    Boolean(config.facilitatorApiKey) &&
    Boolean(config.facilitatorRelayerId) &&
    Boolean(config.facilitatorPolicyId) &&
    Boolean(config.facilitatorProviderContractId);

  const facilitatorConfiguredForOptionalMode =
    config.enableFacilitatorSettlement && Boolean(config.facilitatorUrl);

  const facilitatorAvailable =
    config.facilitatorMode === "required"
      ? facilitatorConfiguredForRequiredMode
      : facilitatorConfiguredForOptionalMode;

  const localSimulationOnly =
    config.enableLocalSettlementSimulation &&
    !config.enableSorobanSettlement &&
    !facilitatorAvailable;

  const settlementBackendAvailable =
    config.enableSorobanSettlement || facilitatorAvailable || config.enableLocalSettlementSimulation;

  const reason = settlementBackendAvailable
    ? localSimulationOnly
      ? "Local settlement simulation enabled (development mode)"
      : "configured"
    : "Enable Soroban settlement or configure facilitator settlement for payment authorization";

  return {
    settlementBackendAvailable,
    mode: config.facilitatorMode,
    enableSorobanSettlement: config.enableSorobanSettlement,
    enableFacilitatorSettlement: config.enableFacilitatorSettlement,
    enableLocalSettlementSimulation: config.enableLocalSettlementSimulation,
    reason
  };
}

export function validateStrictConsumerAuth(input: {
  enforceConsumerAuthOnChain: boolean;
  modelId: string;
  callerAddress: string;
  amountMicrounit: number;
  paymentRef: string;
  paymentProof?: {
    payerPublicKey: string;
    timestamp: number;
    signature: string;
  };
  nowMs?: number;
}): string | null {
  if (!input.enforceConsumerAuthOnChain) {
    return null;
  }

  if (!STELLAR_PUBLIC_KEY_PATTERN.test(input.callerAddress)) {
    return "invalid callerAddress for strict on-chain mode";
  }

  if (!input.paymentProof) {
    return "paymentProof required for strict on-chain mode";
  }

  if (input.paymentProof.payerPublicKey !== input.callerAddress) {
    return "paymentProof.payerPublicKey differs from callerAddress";
  }

  const now = input.nowMs ?? Date.now();
  if (Math.abs(now - input.paymentProof.timestamp) > 5 * 60 * 1000) {
    return "paymentProof expired";
  }

  const signatureOk = verifyPaymentProofSignature({
    modelId: input.modelId,
    callerAddress: input.callerAddress,
    amountMicrounit: input.amountMicrounit,
    paymentRef: input.paymentRef,
    paymentProof: input.paymentProof
  });

  if (!signatureOk) {
    return "paymentProof invalid signature";
  }

  return null;
}

type RouteMetrics = {
  requests: number;
  errors: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
};

type GatewayOperationalMetrics = {
  requestsTotal: number;
  errorsTotal: number;
  status2xx: number;
  status4xx: number;
  status5xx: number;
  routes: Record<string, RouteMetrics>;
};

export async function buildGatewayApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const metrics: GatewayOperationalMetrics = {
    requestsTotal: 0,
    errorsTotal: 0,
    status2xx: 0,
    status4xx: 0,
    status5xx: 0,
    routes: {}
  };

  app.addHook("onRequest", async (request) => {
    request.headers["x-request-start-ms"] = String(Date.now());
  });

  app.addHook("onResponse", async (request, reply) => {
    const routePath = request.routeOptions.url || request.url;
    const startedAt = Number(request.headers["x-request-start-ms"] ?? Date.now());
    const latencyMs = Math.max(0, Date.now() - startedAt);

    metrics.requestsTotal += 1;

    if (reply.statusCode >= 500) {
      metrics.status5xx += 1;
      metrics.errorsTotal += 1;
    } else if (reply.statusCode >= 400) {
      metrics.status4xx += 1;
      metrics.errorsTotal += 1;
    } else if (reply.statusCode >= 200) {
      metrics.status2xx += 1;
    }

    const currentRoute = metrics.routes[routePath] ?? {
      requests: 0,
      errors: 0,
      totalLatencyMs: 0,
      avgLatencyMs: 0
    };

    currentRoute.requests += 1;
    currentRoute.totalLatencyMs += latencyMs;
    if (reply.statusCode >= 400) {
      currentRoute.errors += 1;
    }
    currentRoute.avgLatencyMs = Number((currentRoute.totalLatencyMs / currentRoute.requests).toFixed(2));
    metrics.routes[routePath] = currentRoute;
  });

  await app.register(cors, { origin: true });

  // Initialize database on app startup
  await initializeDb();

  app.get("/", async () => ({
    service: "axon-gateway",
    status: "ok",
    docs: ["/health", "/models", "/payments", "/ops/metrics"]
  }));

  app.get("/favicon.ico", async (_request, reply) => {
    return reply.status(204).send();
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "axon-gateway",
    network: config.network,
    uptimeSec: process.uptime(),
    payments: resolveSettlementCapability()
  }));

  app.get("/payments/capabilities", async () => resolveSettlementCapability());

  app.get("/ops/metrics", async () => ({
    generatedAt: new Date().toISOString(),
    service: "axon-gateway",
    network: config.network,
    uptimeSec: process.uptime(),
    metrics
  }));

  app.get("/models", async () => await listActiveModels());

  app.get("/payments", async () => await listPayments());

  app.get("/payments/tx/:txHash", async (request, reply) => {
    const paramsSchema = z.object({
      txHash: z.string().min(1)
    });

    const parsed = paramsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid parameters", issues: parsed.error.issues });
    }

    const txStatus = await resolveTxStatus(parsed.data.txHash);
    if (txStatus === "confirmed" || txStatus === "failed") {
      await updatePaymentTxStatus(parsed.data.txHash, txStatus);
    }

    return reply.status(200).send({
      txHash: parsed.data.txHash,
      status: txStatus,
      source: txStatus === "local" ? "local" : "horizon"
    });
  });

  app.post("/models", async (request, reply) => {
    const schema = z.object({
      providerAddress: z.string().min(5),
      name: z.string().min(2),
      description: z.string().min(5),
      endpoint: z.string().min(2),
      priceMicrounit: z.number().int().positive()
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", issues: parsed.error.issues });
    }

    const model = {
      id: randomUUID(),
      ...parsed.data,
      active: true,
      createdAt: new Date().toISOString()
    };

    await addModel(model);
    return reply.status(201).send(model);
  });

  app.post("/payments/authorize", async (request, reply) => {
    const schema = z.object({
      modelId: z.string().min(1),
      callerAddress: z.string().min(5),
      amountMicrounit: z.number().int().positive(),
      paymentRef: z.string().min(3),
      paymentProof: z
        .object({
          payerPublicKey: z.string().min(5),
          timestamp: z.number().int().positive(),
          signature: z.string().min(8)
        })
        .optional()
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", issues: parsed.error.issues });
    }

    const model = await findModelById(parsed.data.modelId);
    if (!model || !model.active) {
      return reply.status(404).send({ error: "Model not found" });
    }

    const existingPayment = await findPaymentByRef(parsed.data.paymentRef);
    if (existingPayment) {
      return reply.status(existingPayment.success ? 200 : 402).send(existingPayment);
    }

    const strictAuthError = validateStrictConsumerAuth({
      enforceConsumerAuthOnChain: config.enforceConsumerAuthOnChain,
      modelId: parsed.data.modelId,
      callerAddress: parsed.data.callerAddress,
      amountMicrounit: parsed.data.amountMicrounit,
      paymentRef: parsed.data.paymentRef,
      paymentProof: parsed.data.paymentProof
    });

    if (strictAuthError) {
      return reply.status(400).send({
        error: strictAuthError
      });
    }

    const result = await authorizeAndSettlePayment(parsed.data as PaymentRequest, {
      providerAddress: model.providerAddress
    });
    const normalizedTxHash = result.txHash && result.txHash.trim().length > 0 ? result.txHash : `local_${parsed.data.paymentRef}`;
    const normalizedTxStatus = ONCHAIN_TX_HASH_PATTERN.test(normalizedTxHash)
      ? result.txStatus ?? "submitted"
      : "local";

    let storedPayment;
    try {
      storedPayment = await addPayment({
        ...result,
        txHash: normalizedTxHash,
        txStatus: normalizedTxStatus,
        modelId: parsed.data.modelId,
        callerAddress: parsed.data.callerAddress,
        amountMicrounit: parsed.data.amountMicrounit,
        paymentRef: parsed.data.paymentRef
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Unique constraint failed") && message.includes("paymentRef")) {
        const duplicatePayment = await findPaymentByRef(parsed.data.paymentRef);
        if (duplicatePayment) {
          return reply.status(duplicatePayment.success ? 200 : 402).send(duplicatePayment);
        }
      }
      throw error;
    }

    if (!storedPayment.success) {
      return reply.status(402).send(storedPayment);
    }

    return reply.status(200).send(storedPayment);
  });

  app.post("/inference", async (request, reply) => {
    const x402Header = request.headers["x-402-token"];
    if (!validateX402Header(x402Header)) {
      return reply.status(402).send({
        error: {
          code: "PAYMENT_REQUIRED",
          message: "X402 payment is required to consume inference"
        }
      });
    }

    const schema = z.object({
      modelId: z.string().min(1),
      prompt: z.string().min(1),
      temperature: z.number().min(0).max(2).optional()
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", issues: parsed.error.issues });
    }

    const input = parsed.data as InferenceRequest;
    const model = await findModelById(input.modelId);

    if (!model || !model.active) {
      return reply.status(404).send({ error: "Model not found" });
    }

    try {
      const result = await runInference(input);
      return reply.status(200).send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "inference_unavailable";
      if (message === "inference_upstream_required" || message === "inference_upstream_unavailable") {
        return reply.status(503).send({
          error: {
            code: "INFERENCE_UNAVAILABLE",
            message: "Inference service unavailable in production mode"
          }
        });
      }

      throw error;
    }
  });

  return app;
}