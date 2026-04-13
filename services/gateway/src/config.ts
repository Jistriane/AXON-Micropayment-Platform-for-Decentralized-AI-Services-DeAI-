import { Keypair } from "@stellar/stellar-sdk";

function initializeStellarKeypair(): Keypair {
  const secretKey = process.env.STELLAR_SECRET_KEY;

  if (!secretKey) {
    // Generate a new keypair for development
    const keypair = Keypair.random();
    console.warn(`[config] No STELLAR_SECRET_KEY provided. Using ephemeral keypair: ${keypair.publicKey()}`);
    return keypair;
  }

  try {
    return Keypair.fromSecret(secretKey);
  } catch (error) {
    throw new Error(`Invalid STELLAR_SECRET_KEY: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const stellarKeypair = initializeStellarKeypair();

const facilitatorMode = (process.env.FACILITATOR_MODE ?? "optional") as "disabled" | "optional" | "required";

export type GatewayConfig = {
  facilitatorMode: "disabled" | "optional" | "required";
  enableFacilitatorSettlement: boolean;
  facilitatorUrl: string;
  facilitatorApiKey: string;
  facilitatorRelayerId: string;
  facilitatorPolicyId: string;
  facilitatorProviderContractId: string;
  facilitatorNetwork: string;
};

export function validateGatewayProductionProfile(env = process.env): GatewayConfig {
  const runtimeConfig: GatewayConfig = {
    facilitatorMode: (env.FACILITATOR_MODE ?? "optional") as "disabled" | "optional" | "required",
    enableFacilitatorSettlement: env.ENABLE_FACILITATOR_SETTLEMENT === "true",
    facilitatorUrl: env.FACILITATOR_URL ?? "",
    facilitatorApiKey: env.FACILITATOR_API_KEY ?? "",
    facilitatorRelayerId: env.FACILITATOR_RELAYER_ID ?? "",
    facilitatorPolicyId: env.FACILITATOR_POLICY_ID ?? "",
    facilitatorProviderContractId: env.FACILITATOR_PROVIDER_CONTRACT_ID ?? "",
    facilitatorNetwork: env.FACILITATOR_NETWORK ?? (env.STELLAR_NETWORK ?? "testnet")
  };

  if (runtimeConfig.facilitatorMode !== "required") {
    throw new Error("Invalid facilitator production config: FACILITATOR_MODE must be set to required");
  }

  validateGatewayProductionConfig(runtimeConfig);
  validateInferenceProductionConfig(env);

  return runtimeConfig;
}

export function validateInferenceProductionConfig(env = process.env): void {
  const fallbackMode = env.INFERENCE_FALLBACK_MODE ?? "disabled";
  const upstreamUrl = env.INFERENCE_UPSTREAM_URL ?? "";
  const provider = env.INFERENCE_PROVIDER ?? "generic";
  const apiKey = env.INFERENCE_UPSTREAM_API_KEY ?? "";

  const missing = [
    fallbackMode !== "disabled" ? "INFERENCE_FALLBACK_MODE=disabled" : "",
    !upstreamUrl ? "INFERENCE_UPSTREAM_URL" : "",
    (provider === "openai" || provider === "gemini") && !apiKey ? "INFERENCE_UPSTREAM_API_KEY" : ""
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Invalid inference production config: missing ${missing.join(", ")}`);
  }
}

export function validateGatewayProductionConfig(runtimeConfig: GatewayConfig): void {
  if (runtimeConfig.facilitatorMode !== "required") {
    return;
  }

  const missing = [
    !runtimeConfig.enableFacilitatorSettlement ? "ENABLE_FACILITATOR_SETTLEMENT" : "",
    !runtimeConfig.facilitatorUrl ? "FACILITATOR_URL" : "",
    !runtimeConfig.facilitatorApiKey ? "FACILITATOR_API_KEY" : "",
    !runtimeConfig.facilitatorRelayerId ? "FACILITATOR_RELAYER_ID" : "",
    !runtimeConfig.facilitatorPolicyId ? "FACILITATOR_POLICY_ID" : "",
    !runtimeConfig.facilitatorProviderContractId ? "FACILITATOR_PROVIDER_CONTRACT_ID" : "",
    !runtimeConfig.facilitatorNetwork ? "FACILITATOR_NETWORK" : ""
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Invalid facilitator production config: missing ${missing.join(", ")}`);
  }
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  expectedX402Token: process.env.X402_EXPECTED_TOKEN ?? "",
  platformFeeBps: Number(process.env.PLATFORM_FEE_BPS ?? 500),
  network: (process.env.STELLAR_NETWORK ?? "testnet") as "testnet" | "mainnet",
  horizonUrl: process.env.HORIZON_URL ?? "https://horizon-testnet.stellar.org",
  enableTxStatusLookup: process.env.ENABLE_TX_STATUS_LOOKUP === "true",
  externalMaxAttempts: Number(process.env.EXTERNAL_MAX_ATTEMPTS ?? 2),
  externalRetryBaseDelayMs: Number(process.env.EXTERNAL_RETRY_BASE_DELAY_MS ?? 150),
  externalFailureThreshold: Number(process.env.EXTERNAL_FAILURE_THRESHOLD ?? 3),
  externalCircuitOpenMs: Number(process.env.EXTERNAL_CIRCUIT_OPEN_MS ?? 10_000),
  inferenceMaxAttempts: Number(process.env.INFERENCE_MAX_ATTEMPTS ?? process.env.EXTERNAL_MAX_ATTEMPTS ?? 2),
  horizonMaxAttempts: Number(process.env.HORIZON_MAX_ATTEMPTS ?? process.env.EXTERNAL_MAX_ATTEMPTS ?? 2),
  facilitatorMaxAttempts: Number(process.env.FACILITATOR_MAX_ATTEMPTS ?? process.env.EXTERNAL_MAX_ATTEMPTS ?? 2),
  inferenceUpstreamUrl: process.env.INFERENCE_UPSTREAM_URL ?? "",
  inferenceProvider: (process.env.INFERENCE_PROVIDER ?? "generic") as "generic" | "openai" | "gemini",
  inferenceUpstreamApiKey: process.env.INFERENCE_UPSTREAM_API_KEY ?? "",
  inferenceUpstreamModel: process.env.INFERENCE_UPSTREAM_MODEL ?? "",
  inferenceFallbackMode: (process.env.INFERENCE_FALLBACK_MODE ?? "disabled") as "disabled",
  inferenceTimeoutMs: Number(process.env.INFERENCE_TIMEOUT_MS ?? 10_000),
  sorobanIdentity: process.env.SOROBAN_IDENTITY ?? "axon-admin",
  sorobanNetwork: process.env.SOROBAN_NETWORK ?? "testnet",
  enableSorobanSettlement: process.env.ENABLE_SOROBAN_SETTLEMENT === "true",
  enableFacilitatorSettlement: process.env.ENABLE_FACILITATOR_SETTLEMENT === "true",
  enableLocalSettlementSimulation: process.env.ENABLE_LOCAL_SETTLEMENT_SIMULATION === "true",
  facilitatorMode,
  facilitatorUrl: process.env.FACILITATOR_URL ?? "",
  facilitatorApiKey: process.env.FACILITATOR_API_KEY ?? "",
  facilitatorTimeoutMs: Number(process.env.FACILITATOR_TIMEOUT_MS ?? 4000),
  facilitatorRelayerId: process.env.FACILITATOR_RELAYER_ID ?? "",
  facilitatorPolicyId: process.env.FACILITATOR_POLICY_ID ?? "",
  facilitatorProviderContractId: process.env.FACILITATOR_PROVIDER_CONTRACT_ID ?? "",
  facilitatorNetwork: process.env.FACILITATOR_NETWORK ?? (process.env.STELLAR_NETWORK ?? "testnet"),
  enforceConsumerAuthOnChain: process.env.ENFORCE_CONSUMER_AUTH_ONCHAIN === "true",
  marketplaceContractId: process.env.MARKETPLACE_CONTRACT_ID ?? "",
  paymentRouterContractId: process.env.PAYMENT_ROUTER_CONTRACT_ID ?? "",
  // Stellar configuration
  stellarKeypair,
  stellarPublicKey: stellarKeypair.publicKey(),
  stellarPlatformAccount: process.env.STELLAR_PLATFORM_ACCOUNT ?? stellarKeypair.publicKey(),
  enableStellarSettlement: process.env.ENABLE_STELLAR_SETTLEMENT === "true"
};
