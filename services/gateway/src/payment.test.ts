import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeAndSettlePayment, validateX402Header } from "./payment.js";
import {
  buildGatewayPaymentProofMessage,
  buildPaymentProofHeader,
  verifyPaymentProofSignature,
  type StellarPaymentProof
} from "./stellar.js";
import { Keypair } from "@stellar/stellar-sdk";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("payment", () => {
  it("returns payment failure when no settlement backend is enabled", async () => {
    const result = await authorizeAndSettlePayment({
      modelId: "m1",
      callerAddress: "GUSER123",
      amountMicrounit: 100_000,
      paymentRef: "pay_ref"
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("No settlement backend available");
  });

  it("rejects plain token by default", () => {
    expect(validateX402Header("dev-x402-token")).toBe(false);
    expect(validateX402Header("invalid-token")).toBe(false);
  });

  it("validates Stellar x402 payment proof structure", () => {
    const keypair = Keypair.random();
    const proof: StellarPaymentProof = {
      payerPublicKey: keypair.publicKey(),
      recipientAccount: Keypair.random().publicKey(),
      amountMicrounit: 100_000,
      timestamp: Date.now(),
      signature: "test_signature"
    };

    const header = buildPaymentProofHeader(proof);
    expect(validateX402Header(header)).toBe(true);
  });

  it("accepts minimal x402 proof shape used by web client", () => {
    const keypair = Keypair.random();
    const minimalHeader = Buffer.from(
      JSON.stringify({
        payerPublicKey: keypair.publicKey(),
        timestamp: Date.now(),
        signature: "test_signature"
      })
    ).toString("base64");

    expect(validateX402Header(minimalHeader)).toBe(true);
  });

  it("rejects expired payment proof", () => {
    const keypair = Keypair.random();
    const proof: StellarPaymentProof = {
      payerPublicKey: keypair.publicKey(),
      recipientAccount: Keypair.random().publicKey(),
      amountMicrounit: 100_000,
      timestamp: Date.now() - 6 * 60 * 1000,
      signature: "test_signature"
    };

    const header = buildPaymentProofHeader(proof);
    expect(validateX402Header(header)).toBe(false);
  });

  it("validates cryptographic paymentProof signature", () => {
    const payer = Keypair.random();
    const timestamp = Date.now();
    const message = buildGatewayPaymentProofMessage({
      modelId: "m1",
      callerAddress: payer.publicKey(),
      amountMicrounit: 25000,
      paymentRef: "pay_sig",
      timestamp
    });
    const signature = payer.sign(Buffer.from(message, "utf-8")).toString("base64");

    const ok = verifyPaymentProofSignature({
      modelId: "m1",
      callerAddress: payer.publicKey(),
      amountMicrounit: 25000,
      paymentRef: "pay_sig",
      paymentProof: {
        payerPublicKey: payer.publicKey(),
        timestamp,
        signature
      }
    });

    expect(ok).toBe(true);
  });

  it("rejects invalid paymentProof signature", () => {
    const payer = Keypair.random();

    const ok = verifyPaymentProofSignature({
      modelId: "m1",
      callerAddress: payer.publicKey(),
      amountMicrounit: 25000,
      paymentRef: "pay_sig",
      paymentProof: {
        payerPublicKey: payer.publicKey(),
        timestamp: Date.now(),
        signature: "invalid_signature"
      }
    });

    expect(ok).toBe(false);
  });

  it("fails when facilitator is required but not configured", async () => {
    vi.stubEnv("FACILITATOR_MODE", "required");
    vi.stubEnv("ENABLE_FACILITATOR_SETTLEMENT", "false");
    vi.resetModules();

    const { authorizeAndSettlePayment: authorizeWithRequiredFacilitator } = await import("./payment.js");

    const result = await authorizeWithRequiredFacilitator({
      modelId: "m1",
      callerAddress: "GUSER123",
      amountMicrounit: 100_000,
      paymentRef: "pay_required"
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Facilitator settlement required");
  });

  it("simulates local settlement when enabled in development", async () => {
    vi.stubEnv("ENABLE_LOCAL_SETTLEMENT_SIMULATION", "true");
    vi.stubEnv("ENABLE_SOROBAN_SETTLEMENT", "false");
    vi.stubEnv("ENABLE_FACILITATOR_SETTLEMENT", "false");
    vi.stubEnv("FACILITATOR_MODE", "optional");
    vi.resetModules();

    const { authorizeAndSettlePayment: authorizeWithLocalSimulation } = await import("./payment.js");

    const result = await authorizeWithLocalSimulation({
      modelId: "m1",
      callerAddress: "GUSER123",
      amountMicrounit: 100_000,
      paymentRef: "pay_local_sim"
    });

    expect(result.success).toBe(true);
    expect(result.txHash).toBe("local_pay_local_sim");
    expect(result.txStatus).toBe("local");
  });
});
