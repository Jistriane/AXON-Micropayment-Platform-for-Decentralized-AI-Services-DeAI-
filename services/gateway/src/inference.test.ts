import { afterEach, describe, expect, it, vi } from "vitest";
import { runInference } from "./inference.js";

const originalUpstream = process.env.INFERENCE_UPSTREAM_URL;
const originalFallbackMode = process.env.INFERENCE_FALLBACK_MODE;
const originalProvider = process.env.INFERENCE_PROVIDER;
const originalUpstreamApiKey = process.env.INFERENCE_UPSTREAM_API_KEY;
const originalUpstreamModel = process.env.INFERENCE_UPSTREAM_MODEL;
const originalLocalSettlementSimulation = process.env.ENABLE_LOCAL_SETTLEMENT_SIMULATION;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalUpstream === undefined) {
    delete process.env.INFERENCE_UPSTREAM_URL;
  } else {
    process.env.INFERENCE_UPSTREAM_URL = originalUpstream;
  }

  if (originalFallbackMode === undefined) {
    delete process.env.INFERENCE_FALLBACK_MODE;
  } else {
    process.env.INFERENCE_FALLBACK_MODE = originalFallbackMode;
  }

  if (originalProvider === undefined) {
    delete process.env.INFERENCE_PROVIDER;
  } else {
    process.env.INFERENCE_PROVIDER = originalProvider;
  }

  if (originalUpstreamApiKey === undefined) {
    delete process.env.INFERENCE_UPSTREAM_API_KEY;
  } else {
    process.env.INFERENCE_UPSTREAM_API_KEY = originalUpstreamApiKey;
  }

  if (originalUpstreamModel === undefined) {
    delete process.env.INFERENCE_UPSTREAM_MODEL;
  } else {
    process.env.INFERENCE_UPSTREAM_MODEL = originalUpstreamModel;
  }

  if (originalLocalSettlementSimulation === undefined) {
    delete process.env.ENABLE_LOCAL_SETTLEMENT_SIMULATION;
  } else {
    process.env.ENABLE_LOCAL_SETTLEMENT_SIMULATION = originalLocalSettlementSimulation;
  }
});

describe("inference adapter", () => {
  it("fails when upstream is not configured", async () => {
    delete process.env.INFERENCE_UPSTREAM_URL;

    await expect(
      runInference({
        modelId: "model-1",
        prompt: "test"
      })
    ).rejects.toThrow(/inference_upstream_required/);
  });

  it("fails when upstream fails", async () => {
    process.env.INFERENCE_UPSTREAM_URL = "http://127.0.0.1:9999/infer";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(
      runInference({
        modelId: "model-2",
        prompt: "upstream fail"
      })
    ).rejects.toThrow(/inference_upstream_unavailable/);
  });

  it("returns upstream response when available", async () => {
    process.env.INFERENCE_UPSTREAM_URL = "http://127.0.0.1:9000/infer";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          output: "upstream response",
          latencyMs: 42
        })
      })
    );

    const result = await runInference({
      modelId: "model-3",
      prompt: "upstream test"
    });

    expect(result.output).toBe("upstream response");
    expect(result.latencyMs).toBe(42);
    expect(result.paid).toBe(true);
  });

  it("rejects non-disabled fallback mode", async () => {
    process.env.INFERENCE_UPSTREAM_URL = "http://127.0.0.1:9000/infer";
    process.env.INFERENCE_FALLBACK_MODE = "mock";

    await expect(
      runInference({
        modelId: "model-4",
        prompt: "fallback mode forbidden"
      })
    ).rejects.toThrow(/inference_fallback_forbidden/);
  });

  it("supports Gemini upstream with generateContent payload", async () => {
    process.env.INFERENCE_UPSTREAM_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
    process.env.INFERENCE_PROVIDER = "gemini";
    process.env.INFERENCE_UPSTREAM_API_KEY = "test-gemini-key";
    process.env.INFERENCE_UPSTREAM_MODEL = "gemini-2.0-flash";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: "gemini response" }]
            }
          }
        ]
      })
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await runInference({
      modelId: "model-7",
      prompt: "gemini test"
    });

    expect(result.output).toBe("gemini response");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, requestInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(requestInit.headers).toMatchObject({
      "x-goog-api-key": "test-gemini-key"
    });
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      contents: [{ parts: [{ text: "gemini test" }] }],
      generationConfig: { temperature: 0.2 }
    });
  });

  it("returns local simulated inference when upstream is missing in simulation mode", async () => {
    delete process.env.INFERENCE_UPSTREAM_URL;
    process.env.ENABLE_LOCAL_SETTLEMENT_SIMULATION = "true";

    const result = await runInference({
      modelId: "model-local-sim",
      prompt: "simulate local inference"
    });

    expect(result.paid).toBe(true);
    expect(result.output).toContain("[local-sim]");
  });

  it("returns local simulated inference when upstream fails in simulation mode", async () => {
    process.env.INFERENCE_UPSTREAM_URL = "http://127.0.0.1:9999/infer";
    process.env.ENABLE_LOCAL_SETTLEMENT_SIMULATION = "true";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const result = await runInference({
      modelId: "model-local-sim-2",
      prompt: "simulate local inference on upstream failure"
    });

    expect(result.paid).toBe(true);
    expect(result.output).toContain("[local-sim]");
  });
});
