import { describe, expect, it } from "vitest";
import {
  validateGatewayProductionConfig,
  validateGatewayProductionProfile,
  validateInferenceProductionConfig
} from "./config.js";

describe("gateway config", () => {
  it("fails fast when facilitator required config is incomplete", () => {
    expect(() =>
      validateGatewayProductionConfig({
        facilitatorMode: "required",
        enableFacilitatorSettlement: false,
        facilitatorUrl: "",
        facilitatorApiKey: "",
        facilitatorRelayerId: "",
        facilitatorPolicyId: "",
        facilitatorProviderContractId: "",
        facilitatorNetwork: ""
      })
    ).toThrow(/Invalid facilitator production config/);
  });

  it("accepts optional facilitator config without extra fields", () => {
    expect(() =>
      validateGatewayProductionConfig({
        facilitatorMode: "optional",
        enableFacilitatorSettlement: false,
        facilitatorUrl: "",
        facilitatorApiKey: "",
        facilitatorRelayerId: "",
        facilitatorPolicyId: "",
        facilitatorProviderContractId: "",
        facilitatorNetwork: ""
      })
    ).not.toThrow();
  });

  it("fails when required mode is missing FACILITATOR_API_KEY", () => {
    expect(() =>
      validateGatewayProductionConfig({
        facilitatorMode: "required",
        enableFacilitatorSettlement: true,
        facilitatorUrl: "https://facilitator.example/settle",
        facilitatorApiKey: "",
        facilitatorRelayerId: "relayer",
        facilitatorPolicyId: "policy",
        facilitatorProviderContractId: "contract",
        facilitatorNetwork: "testnet"
      })
    ).toThrow(/FACILITATOR_API_KEY/);
  });

  it("fails fast when the production profile is not required mode", () => {
    expect(() =>
      validateGatewayProductionProfile({
        FACILITATOR_MODE: "optional"
      } as NodeJS.ProcessEnv)
    ).toThrow(/FACILITATOR_MODE must be set to required/);
  });

  it("fails when inference fallback mode is not disabled in production profile", () => {
    expect(() =>
      validateInferenceProductionConfig({
        INFERENCE_FALLBACK_MODE: "mock",
        INFERENCE_UPSTREAM_URL: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
      } as NodeJS.ProcessEnv)
    ).toThrow(/INFERENCE_FALLBACK_MODE=disabled/);
  });

  it("fails when inference upstream url is missing in production profile", () => {
    expect(() =>
      validateInferenceProductionConfig({
        INFERENCE_FALLBACK_MODE: "disabled",
        INFERENCE_UPSTREAM_URL: ""
      } as NodeJS.ProcessEnv)
    ).toThrow(/INFERENCE_UPSTREAM_URL/);
  });

  it("fails when gemini provider is configured without upstream api key", () => {
    expect(() =>
      validateInferenceProductionConfig({
        INFERENCE_FALLBACK_MODE: "disabled",
        INFERENCE_UPSTREAM_URL: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        INFERENCE_PROVIDER: "gemini",
        INFERENCE_UPSTREAM_API_KEY: ""
      } as NodeJS.ProcessEnv)
    ).toThrow(/INFERENCE_UPSTREAM_API_KEY/);
  });

  it("accepts production inference profile for gemini provider", () => {
    expect(() =>
      validateInferenceProductionConfig({
        INFERENCE_FALLBACK_MODE: "disabled",
        INFERENCE_UPSTREAM_URL: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        INFERENCE_PROVIDER: "gemini",
        INFERENCE_UPSTREAM_API_KEY: "sk-test"
      } as NodeJS.ProcessEnv)
    ).not.toThrow();
  });
});
