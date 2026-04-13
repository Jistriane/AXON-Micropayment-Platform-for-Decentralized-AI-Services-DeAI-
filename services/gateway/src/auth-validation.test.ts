import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { validateStrictConsumerAuth } from "./app.js";
import { buildGatewayPaymentProofMessage } from "./stellar.js";

describe("strict on-chain consumer auth validation", () => {
  it("returns no error when strict mode is disabled", () => {
    const result = validateStrictConsumerAuth({
      enforceConsumerAuthOnChain: false,
      modelId: "m1",
      callerAddress: "not-stellar",
      amountMicrounit: 25_000,
      paymentRef: "pay_disabled"
    });

    expect(result).toBeNull();
  });

  it("requires paymentProof when strict mode is enabled", () => {
    const result = validateStrictConsumerAuth({
      enforceConsumerAuthOnChain: true,
      modelId: "m1",
      callerAddress: Keypair.random().publicKey(),
      amountMicrounit: 25_000,
      paymentRef: "pay_missing_proof"
    });

    expect(result).toBe("paymentProof required for strict on-chain mode");
  });

  it("rejects invalid signature in strict mode", () => {
    const payer = Keypair.random();
    const result = validateStrictConsumerAuth({
      enforceConsumerAuthOnChain: true,
      modelId: "m1",
      callerAddress: payer.publicKey(),
      amountMicrounit: 25_000,
      paymentRef: "pay_invalid_signature",
      paymentProof: {
        payerPublicKey: payer.publicKey(),
        timestamp: Date.now(),
        signature: "invalid_signature"
      }
    });

    expect(result).toBe("paymentProof invalid signature");
  });

  it("accepts valid signed paymentProof in strict mode", () => {
    const payer = Keypair.random();
    const timestamp = Date.now();

    const message = buildGatewayPaymentProofMessage({
      modelId: "m1",
      callerAddress: payer.publicKey(),
      amountMicrounit: 25_000,
      paymentRef: "pay_valid_signature",
      timestamp
    });

    const signature = payer.sign(Buffer.from(message, "utf-8")).toString("base64");

    const result = validateStrictConsumerAuth({
      enforceConsumerAuthOnChain: true,
      modelId: "m1",
      callerAddress: payer.publicKey(),
      amountMicrounit: 25_000,
      paymentRef: "pay_valid_signature",
      paymentProof: {
        payerPublicKey: payer.publicKey(),
        timestamp,
        signature
      }
    });

    expect(result).toBeNull();
  });
});
