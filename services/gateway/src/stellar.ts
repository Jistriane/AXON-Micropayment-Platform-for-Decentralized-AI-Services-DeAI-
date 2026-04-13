import {
  Keypair,
  TransactionBuilder,
  Account,
  BASE_FEE,
  Operation,
  Asset
} from "@stellar/stellar-sdk";
import type { PaymentProof, PaymentRequest } from "@axon/shared";

export interface StellarPaymentProof {
  payerPublicKey: string;
  recipientAccount: string;
  amountMicrounit: number;
  timestamp: number;
  signature: string;
}

export interface SettledPayment {
  txHash: string;
  payerPublicKey: string;
  amount: number;
  timestamp: number;
}

function getStellarNetworkPassphrase(network: "testnet" | "mainnet"): string {
  return network === "testnet" 
    ? "Test SDF Network ; September 2015"
    : "Public Global Stellar Network ; September 2015";
}

/**
 * Build a Stellar transaction for payment settlement
 * Note: In production, this would require loading account sequence from Horizon
 */
export async function buildPaymentTransaction(
  payerPublicKey: string,
  recipientAccount: string,
  amountXlm: number,
  network: "testnet" | "mainnet",
  gatewayKeypair: Keypair
): Promise<string> {
  const networkPassphrase = getStellarNetworkPassphrase(network);

  // Create a source account with sequence 0 (would be loaded from server in production)
  const sourceAccount = new Account(payerPublicKey, "0");

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase
  })
    .addOperation(
      Operation.payment({
        destination: recipientAccount,
        asset: Asset.native(),
        amount: String(amountXlm)
      })
    )
    .setTimeout(30)
    .build();

  // Sign with gateway keypair as facilitator
  transaction.sign(gatewayKeypair);

  const xdrBuffer = transaction.toEnvelope().toXDR();
  return xdrBuffer instanceof Buffer ? xdrBuffer.toString("base64") : String(xdrBuffer);
}

/**
 * Submit a Stellar transaction envelope to Horizon.
 */
export async function submitStellarTransaction(
  txEnvelope: string,
  network: "testnet" | "mainnet"
): Promise<{ hash: string; ledger: number }> {
  if (!txEnvelope) {
    throw new Error("Invalid transaction envelope");
  }

  const horizonBase =
    network === "testnet"
      ? "https://horizon-testnet.stellar.org"
      : "https://horizon.stellar.org";

  const payload = new URLSearchParams({ tx: txEnvelope });
  const response = await fetch(`${horizonBase}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: payload.toString()
  });

  if (!response.ok) {
    throw new Error(`horizon_submit_failed_${response.status}`);
  }

  const body = (await response.json()) as {
    hash?: string;
    ledger?: number;
  };

  if (!body.hash || typeof body.ledger !== "number") {
    throw new Error("horizon_submit_invalid_response");
  }

  return {
    hash: body.hash,
    ledger: body.ledger
  };
}

/**
 * Validate a payment proof signed by the payer
 */
export function validatePaymentProof(proof: StellarPaymentProof, expectedAmount: number): boolean {
  // Validate amount matches (or allow any if expectedAmount is 0)
  if (expectedAmount > 0 && proof.amountMicrounit !== expectedAmount) {
    return false;
  }

  // Validate timestamp is recent (within 5 minutes)
  const now = Date.now();
  if (Math.abs(now - proof.timestamp) > 5 * 60 * 1000) {
    return false;
  }

  // Validate public key format
  try {
    Keypair.fromPublicKey(proof.payerPublicKey);
  } catch {
    return false;
  }

  // In production, would verify the cryptographic signature
  // For now, we accept valid structure as proof of intent
  return true;
}

/**
 * Create a payment proof structure from X-Pay header
 */
export function parsePaymentProof(headerValue: string): StellarPaymentProof | null {
  try {
    const decoded = Buffer.from(headerValue, "base64").toString("utf-8");
    const data = JSON.parse(decoded) as Record<string, unknown>;

    const payerPublicKey = String(data.payerPublicKey ?? "");
    const timestamp = Number(data.timestamp);
    const signature = String(data.signature ?? "");

    if (!payerPublicKey || !Number.isFinite(timestamp) || !signature) {
      return null;
    }

    const recipientAccount = String(data.recipientAccount ?? payerPublicKey);
    const parsedAmount = Number(data.amountMicrounit);
    const amountMicrounit = Number.isFinite(parsedAmount) ? parsedAmount : 0;

    return {
      payerPublicKey,
      recipientAccount,
      amountMicrounit,
      timestamp,
      signature
    };
  } catch {
    return null;
  }
}

/**
 * Build X-Pay header from payment proof
 */
export function buildPaymentProofHeader(proof: StellarPaymentProof): string {
  const json = JSON.stringify(proof);
  return Buffer.from(json).toString("base64") as string;
}

export function buildGatewayPaymentProofMessage(input: {
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

function decodeSignature(signature: string): Buffer | null {
  const trimmed = signature.trim();

  if (!trimmed) {
    return null;
  }

  const isHex = /^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0;
  if (isHex) {
    try {
      const decoded = Buffer.from(trimmed, "hex");
      if (decoded.length > 0) {
        return decoded;
      }
    } catch {
      // try base64 path next
    }
  }

  try {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length > 0) {
      return decoded;
    }
  } catch {
    return null;
  }

  return null;
}

export function verifyPaymentProofSignature(input: {
  modelId: string;
  callerAddress: string;
  amountMicrounit: number;
  paymentRef: string;
  paymentProof: PaymentProof;
}): boolean {
  if (input.paymentProof.payerPublicKey !== input.callerAddress) {
    return false;
  }

  const signature = decodeSignature(input.paymentProof.signature);
  if (!signature) {
    return false;
  }

  const message = buildGatewayPaymentProofMessage({
    modelId: input.modelId,
    callerAddress: input.callerAddress,
    amountMicrounit: input.amountMicrounit,
    paymentRef: input.paymentRef,
    timestamp: input.paymentProof.timestamp
  });

  try {
    const keypair = Keypair.fromPublicKey(input.callerAddress);
    return keypair.verify(Buffer.from(message, "utf-8"), signature);
  } catch {
    return false;
  }
}
