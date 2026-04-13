import type { PaymentRequest, PaymentResult } from "@axon/shared";
import { config } from "./config.js";
import {
  validatePaymentProof,
  parsePaymentProof,
  buildPaymentTransaction,
  submitStellarTransaction
} from "./stellar.js";
import { quoteSplitOnChain, settleOnChain } from "./soroban.js";
import { callFacilitatorSettlement } from "./facilitator.js";

export async function authorizeAndSettlePayment(
  payload: PaymentRequest,
  options?: { providerAddress?: string }
): Promise<PaymentResult> {
  if (payload.amountMicrounit <= 0) {
    return {
      success: false,
      platformFeeMicrounit: 0,
      providerAmountMicrounit: 0,
      txHash: "",
      error: "Invalid amount"
    };
  }

  const localPlatformFeeMicrounit = Math.floor((payload.amountMicrounit * config.platformFeeBps) / 10_000);
  const localProviderAmountMicrounit = payload.amountMicrounit - localPlatformFeeMicrounit;

  if (
    config.facilitatorMode === "required" &&
    (!config.enableFacilitatorSettlement ||
      !config.facilitatorUrl ||
      !config.facilitatorApiKey ||
      !config.facilitatorRelayerId ||
      !config.facilitatorPolicyId ||
      !config.facilitatorProviderContractId)
  ) {
    return {
      success: false,
      platformFeeMicrounit: 0,
      providerAmountMicrounit: 0,
      txHash: "",
      error: "Facilitator settlement required but not configured"
    };
  }

  const onChainSplit = await quoteSplitOnChain(payload.amountMicrounit);
  const platformFeeMicrounit = onChainSplit?.platformFeeMicrounit ?? localPlatformFeeMicrounit;
  const providerAmountMicrounit = onChainSplit?.providerAmountMicrounit ?? localProviderAmountMicrounit;

  let txHash = "";
  let txStatus: NonNullable<PaymentResult["txStatus"]> = "submitted";

  if (config.enableFacilitatorSettlement && config.facilitatorUrl) {
    const facilitator = await callFacilitatorSettlement({
      endpointUrl: config.facilitatorUrl,
      apiKey: config.facilitatorApiKey || undefined,
      timeoutMs: config.facilitatorTimeoutMs,
      payload: {
        paymentRef: payload.paymentRef,
        amountMicrounit: payload.amountMicrounit,
        callerAddress: payload.callerAddress,
        providerAddress: options?.providerAddress ?? config.stellarPlatformAccount,
        paymentProof: payload.paymentProof,
        relayerId: config.facilitatorRelayerId || undefined,
        policyId: config.facilitatorPolicyId || undefined,
        providerContractId: config.facilitatorProviderContractId || undefined,
        network: config.facilitatorNetwork
      }
    });

    if (facilitator?.txHash) {
      txHash = facilitator.txHash;
      txStatus = "submitted";
    } else if (config.facilitatorMode === "required") {
      return {
        success: false,
        platformFeeMicrounit: 0,
        providerAmountMicrounit: 0,
        txHash: "",
        error: "Facilitator settlement required but unavailable"
      };
    }
  }

  if (config.enableSorobanSettlement && !/^[a-fA-F0-9]{64}$/.test(txHash)) {
    const onChainResult = await settleOnChain({
      grossAmount: payload.amountMicrounit,
      paymentRef: payload.paymentRef,
      consumerAddress: payload.callerAddress,
      providerAddress: options?.providerAddress ?? config.stellarPlatformAccount
    });

    if (onChainResult?.txHash) {
      txHash = onChainResult.txHash;
      txStatus = "submitted";
    }
  }

  if (!txHash) {
    if (config.enableLocalSettlementSimulation && config.facilitatorMode !== "required") {
      const nowIso = new Date().toISOString();
      return {
        success: true,
        platformFeeMicrounit,
        providerAmountMicrounit,
        txHash: `local_${payload.paymentRef}`,
        txStatus: "local",
        txStatusUpdatedAt: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso
      };
    }

    return {
      success: false,
      platformFeeMicrounit,
      providerAmountMicrounit,
      txHash: "",
      error: "No settlement backend available"
    };
  }

  return {
    success: true,
    platformFeeMicrounit,
    providerAmountMicrounit,
    txHash,
    txStatus,
    txStatusUpdatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function validateX402Header(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  // Support both legacy dev token and real Stellar proofs
  if (config.expectedX402Token && value === config.expectedX402Token) {
    return true;
  }

  // Try to parse as Stellar payment proof
  const proof = parsePaymentProof(value);
  return proof !== null && validatePaymentProof(proof, 0); // Amount validation depends on context
}

/**
 * Settle a payment on Stellar network
 * This is async and would be called from the API layer
 */
export async function settlePaymentOnStellar(options: {
  payerPublicKey: string;
  amount: number; // in microunits, convert to XLM
  platformFee: number;
}): Promise<{ success: boolean; txHash?: string; error?: string }> {
  if (!config.enableStellarSettlement) {
    return {
      success: false,
      error: "stellar_settlement_disabled"
    };
  }

  try {
    // Convert microunits to XLM (1 XLM = 10,000,000 stroops)
    const amountXlm = options.amount / 10_000_000;
    const platformFeeXlm = options.platformFee / 10_000_000;

    // Build Stellar transaction
    const txEnvelope = await buildPaymentTransaction(
      options.payerPublicKey,
      config.stellarPlatformAccount,
      amountXlm,
      config.network as "testnet" | "mainnet",
      config.stellarKeypair
    );

    // Submit to Stellar network
    const result = await submitStellarTransaction(txEnvelope, config.network as "testnet" | "mainnet");

    return {
      success: true,
      txHash: result.hash
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown Stellar error"
    };
  }
}
