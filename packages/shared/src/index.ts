export type AiModel = {
  id: string;
  providerAddress: string;
  name: string;
  description: string;
  endpoint: string;
  priceMicrounit: number;
  active: boolean;
  createdAt: string;
};

export type PaymentRequest = {
  modelId: string;
  callerAddress: string;
  amountMicrounit: number;
  paymentRef: string;
  paymentProof?: PaymentProof;
};

export type PaymentProof = {
  payerPublicKey: string;
  timestamp: number;
  signature: string;
};

export function buildPaymentProofMessage(input: {
  modelId: string;
  callerAddress: string;
  amountMicrounit: number;
  paymentRef: string;
  timestamp: number;
}): string {
  return [
    "AXON_PAY_V1",
    input.modelId,
    String(input.amountMicrounit),
    input.paymentRef,
    input.callerAddress,
    String(input.timestamp)
  ].join("|");
}

export type PaymentResult = {
  success: boolean;
  platformFeeMicrounit: number;
  providerAmountMicrounit: number;
  txHash: string;
  error?: string;
  createdAt?: string;
  updatedAt?: string;
  txStatus?: "submitted" | "confirmed" | "failed" | "local";
  txStatusUpdatedAt?: string;
};

export type InferenceRequest = {
  modelId: string;
  prompt: string;
  temperature?: number;
};

export type InferenceResult = {
  modelId: string;
  output: string;
  latencyMs: number;
  paid: boolean;
};
