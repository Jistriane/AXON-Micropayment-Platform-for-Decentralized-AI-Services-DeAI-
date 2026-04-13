import type { PaymentProof } from "@axon/shared";
import { config } from "./config.js";
import { executeWithResilience, HttpStatusError, shouldRetryHttpError } from "./resilience.js";

export type FacilitatorSettlementRequest = {
  endpointUrl: string;
  apiKey?: string;
  timeoutMs: number;
  payload: {
    paymentRef: string;
    amountMicrounit: number;
    callerAddress: string;
    providerAddress: string;
    paymentProof?: PaymentProof;
    relayerId?: string;
    policyId?: string;
    providerContractId?: string;
    network?: string;
  };
};

export async function callFacilitatorSettlement(
  request: FacilitatorSettlementRequest
): Promise<{ txHash: string } | null> {
  if (!request.endpointUrl) {
    return null;
  }

  try {
    return await executeWithResilience(
      async (signal) => {
        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        };

        if (request.apiKey) {
          headers.Authorization = `Bearer ${request.apiKey}`;
        }

        const response = await fetch(request.endpointUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(request.payload),
          signal
        });

        if (!response.ok) {
          throw new HttpStatusError(response.status, `facilitator_status_${response.status}`);
        }

        const body = (await response.json()) as {
          txHash?: string;
          transactionHash?: string;
          tx_hash?: string;
        };

        const txHash = body.txHash ?? body.transactionHash ?? body.tx_hash;
        if (typeof txHash !== "string" || txHash.length === 0) {
          throw new Error("facilitator_missing_tx_hash");
        }

        return { txHash };
      },
      {
        key: "facilitator_settlement",
        maxAttempts: config.facilitatorMaxAttempts,
        baseDelayMs: config.externalRetryBaseDelayMs,
        timeoutMs: request.timeoutMs,
        failureThreshold: config.externalFailureThreshold,
        circuitOpenMs: config.externalCircuitOpenMs,
        shouldRetry: shouldRetryHttpError
      }
    );
  } catch {
    return null;
  }
}
