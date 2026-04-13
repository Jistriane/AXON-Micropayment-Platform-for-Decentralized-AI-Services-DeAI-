import { describe, expect, it, vi } from "vitest";
import { callFacilitatorSettlement } from "./facilitator.js";

describe("facilitator", () => {
  it("returns tx hash from facilitator response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ txHash: "a".repeat(64) })
      })
    );

    const result = await callFacilitatorSettlement({
      endpointUrl: "https://facilitator.example/settle",
      timeoutMs: 1000,
      payload: {
        paymentRef: "pay_test",
        amountMicrounit: 25000,
        callerAddress: "GCALLER",
        providerAddress: "GPROVIDER"
      }
    });

    expect(result).toEqual({ txHash: "a".repeat(64) });
    vi.unstubAllGlobals();
  });

  it("returns null when facilitator response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false
      })
    );

    const result = await callFacilitatorSettlement({
      endpointUrl: "https://facilitator.example/settle",
      timeoutMs: 1000,
      payload: {
        paymentRef: "pay_test",
        amountMicrounit: 25000,
        callerAddress: "GCALLER",
        providerAddress: "GPROVIDER"
      }
    });

    expect(result).toBeNull();
    vi.unstubAllGlobals();
  });

  it("retries facilitator call after transient failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ txHash: "b".repeat(64) })
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await callFacilitatorSettlement({
      endpointUrl: "https://facilitator.example/settle",
      timeoutMs: 1000,
      payload: {
        paymentRef: "pay_retry",
        amountMicrounit: 25000,
        callerAddress: "GCALLER",
        providerAddress: "GPROVIDER"
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ txHash: "b".repeat(64) });
    vi.unstubAllGlobals();
  });

  it("sends relayer metadata in facilitator request payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ txHash: "c".repeat(64) })
    });
    vi.stubGlobal("fetch", fetchMock);

    await callFacilitatorSettlement({
      endpointUrl: "https://facilitator.example/settle",
      apiKey: "api-key",
      timeoutMs: 1000,
      payload: {
        paymentRef: "pay_meta",
        amountMicrounit: 25000,
        callerAddress: "GCALLER",
        providerAddress: "GPROVIDER",
        relayerId: "openzeppelin-relayer",
        policyId: "policy-123",
        providerContractId: "contract-abc",
        network: "testnet"
      }
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    expect(requestInit.headers).toMatchObject({
      Authorization: "Bearer api-key"
    });
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      relayerId: "openzeppelin-relayer",
      policyId: "policy-123",
      providerContractId: "contract-abc",
      network: "testnet"
    });
    vi.unstubAllGlobals();
  });
});
