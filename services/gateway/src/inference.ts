import type { InferenceRequest, InferenceResult } from "@axon/shared";
import { config } from "./config.js";
import { executeWithResilience, HttpStatusError, shouldRetryHttpError } from "./resilience.js";

function getInferenceUpstreamUrl(): string {
  return process.env.INFERENCE_UPSTREAM_URL ?? config.inferenceUpstreamUrl;
}

function getInferenceTimeoutMs(): number {
  const fromEnv = process.env.INFERENCE_TIMEOUT_MS;
  return fromEnv ? Number(fromEnv) : config.inferenceTimeoutMs;
}

function getInferenceProvider(): "generic" | "openai" | "gemini" {
  const fromEnv = process.env.INFERENCE_PROVIDER;
  if (fromEnv === "gemini") {
    return "gemini";
  }
  if (fromEnv === "openai") {
    return "openai";
  }
  if (config.inferenceProvider === "gemini") {
    return "gemini";
  }
  return config.inferenceProvider === "openai" ? "openai" : "generic";
}

function getInferenceUpstreamApiKey(): string {
  return process.env.INFERENCE_UPSTREAM_API_KEY ?? config.inferenceUpstreamApiKey;
}

function getInferenceUpstreamModel(): string {
  return process.env.INFERENCE_UPSTREAM_MODEL ?? config.inferenceUpstreamModel;
}

function getInferenceFallbackMode(): "disabled" {
  const fromEnv = process.env.INFERENCE_FALLBACK_MODE;
  if (fromEnv && fromEnv !== "disabled") {
    throw new Error("inference_fallback_forbidden");
  }
  return "disabled";
}

function isLocalInferenceSimulationEnabled(): boolean {
  const fromEnv = process.env.ENABLE_LOCAL_SETTLEMENT_SIMULATION;
  if (fromEnv !== undefined) {
    return fromEnv === "true";
  }
  return config.enableLocalSettlementSimulation;
}

function buildLocalSimulatedInference(input: InferenceRequest): InferenceResult {
  const excerpt = input.prompt.trim().slice(0, 120) || "(empty prompt)";
  return {
    modelId: input.modelId,
    output: `[local-sim] Inference executed in local simulation mode. Prompt excerpt: ${excerpt}`,
    latencyMs: 25,
    paid: true
  };
}

async function runUpstreamInference(input: InferenceRequest): Promise<InferenceResult> {
  const start = Date.now();

  return await executeWithResilience(
    async (signal) => {
      const provider = getInferenceProvider();
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      let requestBody: object = input;
      if (provider === "openai") {
        const apiKey = getInferenceUpstreamApiKey();
        if (!apiKey) {
          throw new Error("inference_upstream_api_key_required");
        }

        headers.Authorization = `Bearer ${apiKey}`;
        requestBody = {
          model: getInferenceUpstreamModel() || "gpt-4o-mini",
          messages: [{ role: "user", content: input.prompt }],
          temperature: input.temperature ?? 0.2
        };
      } else if (provider === "gemini") {
        const apiKey = getInferenceUpstreamApiKey();
        if (!apiKey) {
          throw new Error("inference_upstream_api_key_required");
        }

        headers["x-goog-api-key"] = apiKey;
        requestBody = {
          contents: [{ parts: [{ text: input.prompt }] }],
          generationConfig: {
            temperature: input.temperature ?? 0.2
          }
        };
      }

      const response = await fetch(getInferenceUpstreamUrl(), {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal
      });

      if (!response.ok) {
        throw new HttpStatusError(response.status, `upstream_status_${response.status}`);
      }

      const payload = (await response.json()) as
        | Partial<InferenceResult>
        | {
            choices?: Array<{
              message?: {
                content?: string;
              };
            }>;
            candidates?: Array<{
              content?: {
                parts?: Array<{
                  text?: string;
                }>;
              };
            }>;
          };

      const openAiOutput = payload && "choices" in payload
        ? payload.choices?.[0]?.message?.content
        : undefined;
      const geminiOutput = payload && "candidates" in payload
        ? payload.candidates?.[0]?.content?.parts?.[0]?.text
        : undefined;

      return {
        modelId: input.modelId,
        output:
          (typeof (payload as Partial<InferenceResult>).output === "string"
            ? (payload as Partial<InferenceResult>).output
            : undefined) ??
          openAiOutput ??
          geminiOutput ??
          "Inference executed without output payload.",
        latencyMs:
          (typeof (payload as Partial<InferenceResult>).latencyMs === "number"
            ? (payload as Partial<InferenceResult>).latencyMs
            : undefined) ?? Date.now() - start,
        paid: true
      };
    },
    {
      key: "upstream_inference",
      maxAttempts: config.inferenceMaxAttempts,
      baseDelayMs: config.externalRetryBaseDelayMs,
      timeoutMs: getInferenceTimeoutMs(),
      failureThreshold: config.externalFailureThreshold,
      circuitOpenMs: config.externalCircuitOpenMs,
      shouldRetry: shouldRetryHttpError
    }
  );
}

export async function runInference(input: InferenceRequest): Promise<InferenceResult> {
  const upstreamUrl = getInferenceUpstreamUrl();
  getInferenceFallbackMode();

  if (!upstreamUrl) {
    if (isLocalInferenceSimulationEnabled()) {
      return buildLocalSimulatedInference(input);
    }
    throw new Error("inference_upstream_required");
  }

  try {
    return await runUpstreamInference(input);
  } catch {
    if (isLocalInferenceSimulationEnabled()) {
      return buildLocalSimulatedInference(input);
    }
    throw new Error("inference_upstream_unavailable");
  }
}
