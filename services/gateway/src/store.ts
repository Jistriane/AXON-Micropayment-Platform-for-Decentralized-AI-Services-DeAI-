import { PrismaClient } from "@prisma/client";
import type { AiModel, PaymentResult } from "@axon/shared";
import { config } from "./config.js";

const prisma = new PrismaClient();

const DEFAULT_MODEL_ID_MAP: Record<string, string> = {
  gemini: "gemini-default",
  openai: "openai-default",
  generic: "generic-default"
};

function createDefaultModel(): AiModel {
  const provider = config.inferenceProvider;
  const modelId = DEFAULT_MODEL_ID_MAP[provider];
  const modelName = config.inferenceUpstreamModel || {
    gemini: "gemini-2.0-flash",
    openai: "gpt-4o",
    generic: "default-model"
  }[provider];

  const providerLabel = provider.charAt(0).toUpperCase() + provider.slice(1);

  return {
    id: modelId,
    providerAddress: config.stellarPlatformAccount,
    name: `${providerLabel} ${modelName}`,
    description: `Default ${provider} upstream model`,
    endpoint: "/inference",
    priceMicrounit: 25_000,
    active: true,
    createdAt: new Date().toISOString()
  };
}

async function ensureDefaultModels() {
  const modelId = DEFAULT_MODEL_ID_MAP[config.inferenceProvider];
  const existing = await prisma.aiModel.findUnique({ where: { id: modelId } });
  if (existing) {
    return;
  }

  const defaultModel = createDefaultModel();
  await prisma.aiModel.create({
    data: {
      id: defaultModel.id,
      providerAddress: defaultModel.providerAddress,
      name: defaultModel.name,
      description: defaultModel.description,
      endpoint: defaultModel.endpoint,
      priceMicrounit: defaultModel.priceMicrounit,
      active: defaultModel.active,
      createdAt: new Date(defaultModel.createdAt)
    }
  });
}

/**
 * Initialize database resources
 */
export async function initializeDb() {
  await prisma.$queryRaw`SELECT 1`;
  await ensureDefaultModels();
}

export async function listModels(): Promise<AiModel[]> {
  await initializeDb();
  const models = await prisma.aiModel.findMany({
    orderBy: { createdAt: "desc" }
  });
  return models.map((m) => ({
    id: m.id,
    providerAddress: m.providerAddress,
    name: m.name,
    description: m.description,
    endpoint: m.endpoint,
    priceMicrounit: m.priceMicrounit,
    active: m.active,
    createdAt: m.createdAt.toISOString()
  }));
}

export async function listActiveModels(): Promise<AiModel[]> {
  await initializeDb();
  const models = await prisma.aiModel.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" }
  });
  return models.map((m) => ({
    id: m.id,
    providerAddress: m.providerAddress,
    name: m.name,
    description: m.description,
    endpoint: m.endpoint,
    priceMicrounit: m.priceMicrounit,
    active: m.active,
    createdAt: m.createdAt.toISOString()
  }));
}

export async function findModelById(modelId: string): Promise<AiModel | null> {
  await initializeDb();
  const model = await prisma.aiModel.findUnique({
    where: { id: modelId }
  });
  if (!model) return null;
  return {
    id: model.id,
    providerAddress: model.providerAddress,
    name: model.name,
    description: model.description,
    endpoint: model.endpoint,
    priceMicrounit: model.priceMicrounit,
    active: model.active,
    createdAt: model.createdAt.toISOString()
  };
}

export async function addModel(model: AiModel): Promise<AiModel> {
  const created = await prisma.aiModel.create({
    data: {
      id: model.id,
      providerAddress: model.providerAddress,
      name: model.name,
      description: model.description,
      endpoint: model.endpoint,
      priceMicrounit: model.priceMicrounit,
      active: model.active,
      createdAt: new Date(model.createdAt)
    }
  });
  return {
    id: created.id,
    providerAddress: created.providerAddress,
    name: created.name,
    description: created.description,
    endpoint: created.endpoint,
    priceMicrounit: created.priceMicrounit,
    active: created.active,
    createdAt: created.createdAt.toISOString()
  };
}

export async function listPayments(): Promise<PaymentResult[]> {
  const payments = await prisma.paymentRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 100 // Limit to last 100 for performance
  });
  return payments.map((p) => ({
    success: p.success,
    platformFeeMicrounit: p.platformFeeMicrounit,
    providerAmountMicrounit: p.providerAmountMicrounit,
    txHash: p.txHash,
    error: p.error || undefined,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    txStatus: p.txStatus as PaymentResult["txStatus"],
    txStatusUpdatedAt: p.txStatusUpdatedAt.toISOString()
  }));
}

export async function addPayment(payment: PaymentResult & { modelId: string; callerAddress: string; amountMicrounit: number; paymentRef: string }): Promise<PaymentResult> {
  const created = await prisma.paymentRecord.create({
    data: {
      modelId: payment.modelId,
      callerAddress: payment.callerAddress,
      amountMicrounit: payment.amountMicrounit,
      platformFeeMicrounit: payment.platformFeeMicrounit,
      providerAmountMicrounit: payment.providerAmountMicrounit,
      txHash: payment.txHash,
      paymentRef: payment.paymentRef,
      success: payment.success,
      error: payment.error || null,
      txStatus: payment.txStatus ?? "submitted",
      txStatusUpdatedAt: new Date(payment.txStatusUpdatedAt ?? new Date().toISOString())
    }
  });
  return {
    success: created.success,
    platformFeeMicrounit: created.platformFeeMicrounit,
    providerAmountMicrounit: created.providerAmountMicrounit,
    txHash: created.txHash,
    error: created.error || undefined,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
    txStatus: created.txStatus as PaymentResult["txStatus"],
    txStatusUpdatedAt: created.txStatusUpdatedAt.toISOString()
  };
}

export async function findPaymentByRef(paymentRef: string): Promise<PaymentResult | null> {
  const payment = await prisma.paymentRecord.findUnique({
    where: { paymentRef }
  });

  if (!payment) {
    return null;
  }

  return {
    success: payment.success,
    platformFeeMicrounit: payment.platformFeeMicrounit,
    providerAmountMicrounit: payment.providerAmountMicrounit,
    txHash: payment.txHash,
    error: payment.error || undefined,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    txStatus: payment.txStatus as PaymentResult["txStatus"],
    txStatusUpdatedAt: payment.txStatusUpdatedAt.toISOString()
  };
}

export async function updatePaymentTxStatus(txHash: string, txStatus: NonNullable<PaymentResult["txStatus"]>) {
  const updated = await prisma.paymentRecord.update({
    where: { txHash },
    data: {
      txStatus,
      txStatusUpdatedAt: new Date()
    }
  });

  return {
    txHash: updated.txHash,
    txStatus: updated.txStatus as PaymentResult["txStatus"],
    txStatusUpdatedAt: updated.txStatusUpdatedAt.toISOString()
  };
}

/**
 * Reset database (development only)
 */
export async function resetDb() {
  await prisma.paymentRecord.deleteMany();
  await prisma.aiModel.deleteMany();
}
