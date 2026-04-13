import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { buildPaymentProofHeader } from "./stellar.js";
import { buildGatewayApp } from "./app.js";
import { resetDb } from "./store.js";

function buildX402Header(): string {
  const payer = Keypair.random();
  return buildPaymentProofHeader({
    payerPublicKey: payer.publicKey(),
    recipientAccount: Keypair.random().publicKey(),
    amountMicrounit: 100_000,
    timestamp: Date.now(),
    signature: "test_signature"
  });
}

describe("gateway http", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("responds at root and favicon without 404", async () => {
    const app = await buildGatewayApp();

    const root = await app.inject({ method: "GET", url: "/" });
    expect(root.statusCode).toBe(200);
    expect(root.json()).toMatchObject({
      service: "axon-gateway",
      status: "ok"
    });

    const favicon = await app.inject({ method: "GET", url: "/favicon.ico" });
    expect(favicon.statusCode).toBe(204);

    await app.close();
  });

  it("responds health and seeds a default model on first access", async () => {
    const app = await buildGatewayApp();

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().status).toBe("ok");
    expect(health.json().payments).toMatchObject({
      settlementBackendAvailable: expect.any(Boolean)
    });

    const models = await app.inject({ method: "GET", url: "/models" });
    expect(models.statusCode).toBe(200);
    const modelsList = models.json() as Array<{ id: string; name: string; active: boolean }>;
    expect(modelsList.length).toBeGreaterThan(0);
    expect(modelsList[0]).toMatchObject({
      active: true,
      endpoint: "/inference"
    });

    const payments = await app.inject({ method: "GET", url: "/payments" });
    expect(payments.statusCode).toBe(200);
    expect(payments.json()).toHaveLength(0);

    await app.close();
  });

  it("exposes payment capabilities", async () => {
    const app = await buildGatewayApp();

    const capabilities = await app.inject({ method: "GET", url: "/payments/capabilities" });
    expect(capabilities.statusCode).toBe(200);
    expect(capabilities.json()).toMatchObject({
      settlementBackendAvailable: expect.any(Boolean),
      mode: expect.any(String),
      enableSorobanSettlement: expect.any(Boolean),
      enableFacilitatorSettlement: expect.any(Boolean),
      enableLocalSettlementSimulation: expect.any(Boolean),
      reason: expect.any(String)
    });

    await app.close();
  });

  it("seeds a default model when no models exist", async () => {
    // Test with default generic provider
    const app = await buildGatewayApp();

    const models = await app.inject({ method: "GET", url: "/models" });
    expect(models.statusCode).toBe(200);

    const payload = models.json() as Array<{ name: string; endpoint: string; active: boolean; id: string }>;
    expect(payload.length).toBeGreaterThan(0);
    expect(payload[0]).toMatchObject({
      endpoint: "/inference",
      active: true
    });
    expect(payload[0].name).toBeDefined();

    await app.close();
  });

  it("seeds Gemini model when INFERENCE_PROVIDER=gemini", async () => {
    vi.stubEnv("INFERENCE_PROVIDER", "gemini");
    vi.stubEnv("INFERENCE_UPSTREAM_URL", "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent");
    vi.resetModules();

    const [{ buildGatewayApp: buildGeminiGatewayApp }, { resetDb: resetGeminiDb }] = await Promise.all([
      import("./app.js"),
      import("./store.js")
    ]);

    await resetGeminiDb();

    const app = await buildGeminiGatewayApp();

    const models = await app.inject({ method: "GET", url: "/models" });
    expect(models.statusCode).toBe(200);

    const payload = models.json() as Array<{ name: string; endpoint: string; active: boolean }>;
    expect(payload).toHaveLength(1);
    expect(payload[0]).toMatchObject({
      name: expect.stringContaining("Gemini"),
      endpoint: "/inference",
      active: true
    });

    await app.close();
  });

  it("seeds Gemini default even with existing active models", async () => {
    vi.stubEnv("INFERENCE_PROVIDER", "generic");
    vi.resetModules();

    const [{ buildGatewayApp: buildGenericGatewayApp }, { resetDb: resetGenericDb }] = await Promise.all([
      import("./app.js"),
      import("./store.js")
    ]);

    await resetGenericDb();

    const genericApp = await buildGenericGatewayApp();
    const createCustom = await genericApp.inject({
      method: "POST",
      url: "/models",
      payload: {
        id: "custom-active",
        providerAddress: "GA26BRYN2IBH4OKJDEXIUMK53BPHYXYJUIMHXFPTPP5EBCLHRHUP2I4T",
        name: "Custom Active",
        description: "Custom model for regression scenario",
        endpoint: "/inference",
        priceMicrounit: 10_000
      }
    });
    expect(createCustom.statusCode).toBe(201);
    await genericApp.close();

    vi.stubEnv("INFERENCE_PROVIDER", "gemini");
    vi.stubEnv("INFERENCE_UPSTREAM_URL", "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent");
    vi.resetModules();

    const [{ buildGatewayApp: buildGeminiGatewayApp }] = await Promise.all([import("./app.js")]);
    const geminiApp = await buildGeminiGatewayApp();

    const models = await geminiApp.inject({ method: "GET", url: "/models" });
    expect(models.statusCode).toBe(200);

    const payload = models.json() as Array<{ id: string; name: string; active: boolean }>;
    expect(payload.length).toBeGreaterThanOrEqual(2);
    expect(payload.some((item) => item.id === "gemini-default")).toBe(true);
    expect(payload.some((item) => item.name === "Custom Active")).toBe(true);

    await geminiApp.close();
  });

  it("exposes operational metrics at /ops/metrics", async () => {
    const app = await buildGatewayApp();

    await app.inject({ method: "GET", url: "/health" });
    await app.inject({ method: "GET", url: "/models" });

    const metrics = await app.inject({ method: "GET", url: "/ops/metrics" });
    expect(metrics.statusCode).toBe(200);

    const payload = metrics.json() as {
      service: string;
      metrics: {
        requestsTotal: number;
        status2xx: number;
        routes: Record<string, { requests: number }>;
      };
    };

    expect(payload.service).toBe("axon-gateway");
    expect(payload.metrics.requestsTotal).toBeGreaterThanOrEqual(2);
    expect(payload.metrics.status2xx).toBeGreaterThanOrEqual(2);
    expect(payload.metrics.routes["/health"]?.requests ?? 0).toBeGreaterThanOrEqual(1);
    expect(payload.metrics.routes["/models"]?.requests ?? 0).toBeGreaterThanOrEqual(1);

    await app.close();
  });

  it("returns local status for non on-chain tx hash", async () => {
    const app = await buildGatewayApp();

    const txStatus = await app.inject({
      method: "GET",
      url: "/payments/tx/nonchain_123"
    });

    expect(txStatus.statusCode).toBe(200);
    expect(txStatus.json()).toMatchObject({
      txHash: "nonchain_123",
      status: "local",
      source: "local"
    });

    await app.close();
  });

  it("returns submitted status for on-chain tx hash when lookup is disabled", async () => {
    const app = await buildGatewayApp();

    const txStatus = await app.inject({
      method: "GET",
      url: "/payments/tx/b44e11fee2688d84f8494479ca0cc63a0c825e25732a22631aac028c71b2b457"
    });

    expect(txStatus.statusCode).toBe(200);
    expect(txStatus.json()).toMatchObject({
      status: "submitted",
      source: "horizon"
    });

    await app.close();
  });

  it("registers model and executes payment split", async () => {
    const app = await buildGatewayApp();

    const createModel = await app.inject({
      method: "POST",
      url: "/models",
      payload: {
        providerAddress: "GPROVIDER12345",
        name: "Test Model",
        description: "Test model description",
        endpoint: "/inference",
        priceMicrounit: 25_000
      }
    });

    expect(createModel.statusCode).toBe(201);
    const modelId = createModel.json().id as string;

    const payment = await app.inject({
      method: "POST",
      url: "/payments/authorize",
      payload: {
        modelId,
        callerAddress: "GUSER12345",
        amountMicrounit: 100_000,
        paymentRef: "pay_001"
      }
    });

    expect(payment.statusCode).toBe(402);
    expect(payment.json()).toMatchObject({
      success: false,
      error: "No settlement backend available"
    });

    await app.close();
  });

  it("returns 404 when authorizing payment for missing model", async () => {
    const app = await buildGatewayApp();

    const payment = await app.inject({
      method: "POST",
      url: "/payments/authorize",
      payload: {
        modelId: "missing-model",
        callerAddress: "GUSER12345",
        amountMicrounit: 100_000,
        paymentRef: "pay_missing"
      }
    });

    expect(payment.statusCode).toBe(404);
    expect(payment.json()).toMatchObject({ error: "Model not found" });

    await app.close();
  });

  it("replays existing payment when paymentRef is reused", async () => {
    const app = await buildGatewayApp();

    const createModel = await app.inject({
      method: "POST",
      url: "/models",
      payload: {
        providerAddress: "GPROVIDERIDEMPOTENT",
        name: "Idempotent Model",
        description: "Model for duplicate paymentRef replay",
        endpoint: "/inference",
        priceMicrounit: 30_000
      }
    });

    expect(createModel.statusCode).toBe(201);
    const modelId = createModel.json().id as string;

    const first = await app.inject({
      method: "POST",
      url: "/payments/authorize",
      payload: {
        modelId,
        callerAddress: "GUSERIDEMPOTENT",
        amountMicrounit: 100_000,
        paymentRef: "pay_replay_001"
      }
    });

    expect(first.statusCode).toBe(402);

    const replay = await app.inject({
      method: "POST",
      url: "/payments/authorize",
      payload: {
        modelId,
        callerAddress: "GUSERIDEMPOTENT",
        amountMicrounit: 100_000,
        paymentRef: "pay_replay_001"
      }
    });

    expect(replay.statusCode).toBe(402);
    expect(replay.json()).toMatchObject(first.json());

    await app.close();
  });

  it("supports multiple failed authorizations with different paymentRef", async () => {
    const app = await buildGatewayApp();

    const createModel = await app.inject({
      method: "POST",
      url: "/models",
      payload: {
        providerAddress: "GPROVIDERMULTI402",
        name: "Multi Failed Model",
        description: "Allows multiple failed local payment records",
        endpoint: "/inference",
        priceMicrounit: 22_000
      }
    });

    expect(createModel.statusCode).toBe(201);
    const modelId = createModel.json().id as string;

    const first = await app.inject({
      method: "POST",
      url: "/payments/authorize",
      payload: {
        modelId,
        callerAddress: "GUSERMULTI402",
        amountMicrounit: 100_000,
        paymentRef: "pay_multi_001"
      }
    });

    const second = await app.inject({
      method: "POST",
      url: "/payments/authorize",
      payload: {
        modelId,
        callerAddress: "GUSERMULTI402",
        amountMicrounit: 100_000,
        paymentRef: "pay_multi_002"
      }
    });

    expect(first.statusCode).toBe(402);
    expect(second.statusCode).toBe(402);

    const firstPayload = first.json() as { txHash?: string; txStatus?: string };
    const secondPayload = second.json() as { txHash?: string; txStatus?: string };

    expect(firstPayload.txHash).toBe("local_pay_multi_001");
    expect(secondPayload.txHash).toBe("local_pay_multi_002");
    expect(firstPayload.txStatus).toBe("local");
    expect(secondPayload.txStatus).toBe("local");

    await app.close();
  });

  it("returns 402 without X402 header and 404 for missing model with valid proof header", async () => {
    const app = await buildGatewayApp();

    const noToken = await app.inject({
      method: "POST",
      url: "/inference",
      payload: {
        modelId: "missing",
        prompt: "hello"
      }
    });

    expect(noToken.statusCode).toBe(402);

    const notFound = await app.inject({
      method: "POST",
      url: "/inference",
      headers: {
        "x-402-token": buildX402Header()
      },
      payload: {
        modelId: "missing",
        prompt: "hello"
      }
    });

    expect(notFound.statusCode).toBe(404);

    await app.close();
  });

  it("returns 503 when upstream is unavailable", async () => {
    vi.stubEnv("INFERENCE_UPSTREAM_URL", "");
    vi.resetModules();

    const { buildGatewayApp: buildStrictGatewayApp } = await import("./app.js");
    const app = await buildStrictGatewayApp();

    const createModel = await app.inject({
      method: "POST",
      url: "/models",
      payload: {
        providerAddress: "GPROVIDER54321",
        name: "Strict Model",
        description: "Strict model description",
        endpoint: "/inference",
        priceMicrounit: 33_000
      }
    });

    const modelId = createModel.json().id as string;

    const inference = await app.inject({
      method: "POST",
      url: "/inference",
      headers: {
        "x-402-token": buildX402Header()
      },
      payload: {
        modelId,
        prompt: "Strict upstream test"
      }
    });

    expect(inference.statusCode).toBe(503);
    expect(inference.json()).toMatchObject({
      error: {
        code: "INFERENCE_UNAVAILABLE"
      }
    });

    await app.close();
  });
});
