import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { executeWithResilience, HttpStatusError, shouldRetryHttpError } from "./resilience.js";

const execFileAsync = promisify(execFile);

function extractTxHash(output: string): string | null {
  const match = output.match(/\/tx\/([a-f0-9]{64})/i);
  if (match?.[1]) {
    return match[1];
  }

  const signedMatch = output.match(/Signing transaction:\s*([a-f0-9]{64})/i);
  if (signedMatch?.[1]) {
    return signedMatch[1];
  }

  const bareHash = output.match(/\b([a-f0-9]{64})\b/i);
  if (bareHash?.[1]) {
    return bareHash[1];
  }

  return match?.[1] ?? null;
}

async function getSourceAddress(identity: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("soroban", ["keys", "address", identity]);
    const value = stdout.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

export async function quoteSplitOnChain(grossAmount: number): Promise<{ platformFeeMicrounit: number; providerAmountMicrounit: number } | null> {
  if (!config.paymentRouterContractId) {
    return null;
  }

  const identity = process.env.SOROBAN_IDENTITY ?? "axon-admin";
  const network = process.env.SOROBAN_NETWORK ?? "testnet";

  try {
    const { stdout } = await execFileAsync("soroban", [
      "contract",
      "invoke",
      "--id",
      config.paymentRouterContractId,
      "--source-account",
      identity,
      "--network",
      network,
      "--",
      "quote_split",
      "--gross_amount",
      String(grossAmount)
    ]);

    const parsed = JSON.parse(stdout.trim()) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 2) {
      return null;
    }

    const platformFeeMicrounit = Number(parsed[0]);
    const providerAmountMicrounit = Number(parsed[1]);

    if (!Number.isFinite(platformFeeMicrounit) || !Number.isFinite(providerAmountMicrounit)) {
      return null;
    }

    return {
      platformFeeMicrounit,
      providerAmountMicrounit
    };
  } catch {
    return null;
  }
}

export async function settleOnChain(options: {
  grossAmount: number;
  paymentRef: string;
  consumerAddress: string;
  providerAddress: string;
}): Promise<{ txHash: string } | null> {
  if (!config.paymentRouterContractId) {
    return null;
  }

  const identity = config.sorobanIdentity;
  const network = config.sorobanNetwork;

  // Contract requires consumer auth. In local/dev flow we can fallback to signer identity.
  const sourceAddress = await getSourceAddress(identity);
  const consumer = config.enforceConsumerAuthOnChain
    ? options.consumerAddress
    : (sourceAddress ?? options.consumerAddress);

  try {
    const { stdout, stderr } = await execFileAsync("soroban", [
      "contract",
      "invoke",
      "--id",
      config.paymentRouterContractId,
      "--source-account",
      identity,
      "--network",
      network,
      "--send=yes",
      "--",
      "settle",
      "--consumer",
      consumer,
      "--provider",
      options.providerAddress,
      "--gross_amount",
      String(options.grossAmount),
      "--payment_ref",
      options.paymentRef
    ]);

    const txHash = extractTxHash(`${stdout}\n${stderr}`);
    if (!txHash) {
      return null;
    }

    return { txHash };
  } catch {
    return null;
  }
}

export type TxStatus = "submitted" | "confirmed" | "failed" | "local";

export function isOnChainTxHash(value: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(value);
}

export async function resolveTxStatus(txHash: string): Promise<TxStatus> {
  if (!isOnChainTxHash(txHash)) {
    return "local";
  }

  if (!config.enableTxStatusLookup) {
    return "submitted";
  }

  try {
    const response = await executeWithResilience(
      async (signal) => {
        const res = await fetch(`${config.horizonUrl}/transactions/${txHash}`, { signal });
        if (res.status === 404) {
          return res;
        }
        if (!res.ok) {
          throw new HttpStatusError(res.status, `horizon_status_${res.status}`);
        }
        return res;
      },
      {
        key: "horizon_tx_lookup",
        maxAttempts: config.horizonMaxAttempts,
        baseDelayMs: config.externalRetryBaseDelayMs,
        timeoutMs: 3000,
        failureThreshold: config.externalFailureThreshold,
        circuitOpenMs: config.externalCircuitOpenMs,
        shouldRetry: shouldRetryHttpError
      }
    );

    if (response.status === 404) {
      return "submitted";
    }

    const payload = (await response.json()) as { successful?: boolean };
    if (payload.successful === false) {
      return "failed";
    }

    return "confirmed";
  } catch {
    return "submitted";
  }
}
