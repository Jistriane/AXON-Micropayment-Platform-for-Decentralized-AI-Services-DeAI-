type CircuitState = {
  failures: number;
  openUntilMs: number;
};

const circuitStates = new Map<string, CircuitState>();

export class HttpStatusError extends Error {
  constructor(public readonly status: number, message?: string) {
    super(message ?? `http_status_${status}`);
  }
}

export type ResilienceOptions = {
  key: string;
  maxAttempts: number;
  baseDelayMs: number;
  timeoutMs?: number;
  failureThreshold: number;
  circuitOpenMs: number;
  shouldRetry?: (error: unknown) => boolean;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function shouldRetryHttpError(error: unknown): boolean {
  if (error instanceof HttpStatusError) {
    return error.status === 408 || error.status === 429 || error.status >= 500;
  }

  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }

  return true;
}

export async function executeWithResilience<T>(
  operation: (signal?: AbortSignal) => Promise<T>,
  options: ResilienceOptions
): Promise<T> {
  const state = circuitStates.get(options.key) ?? { failures: 0, openUntilMs: 0 };
  const now = Date.now();

  if (state.openUntilMs > now) {
    throw new Error(`circuit_open_${options.key}`);
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= Math.max(1, options.maxAttempts); attempt += 1) {
    let controller: AbortController | undefined;
    let timeout: NodeJS.Timeout | undefined;

    try {
      if (options.timeoutMs && options.timeoutMs > 0) {
        controller = new AbortController();
        timeout = setTimeout(() => controller?.abort(), options.timeoutMs);
      }

      const result = await operation(controller?.signal);
      circuitStates.set(options.key, { failures: 0, openUntilMs: 0 });
      return result;
    } catch (error) {
      lastError = error;
      const canRetry = (options.shouldRetry ?? shouldRetryHttpError)(error);
      const hasMoreAttempts = attempt < Math.max(1, options.maxAttempts);

      if (canRetry && hasMoreAttempts) {
        await wait(options.baseDelayMs * attempt);
        continue;
      }

      break;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  const nextFailures = state.failures + 1;
  const shouldOpen = nextFailures >= Math.max(1, options.failureThreshold);

  circuitStates.set(options.key, {
    failures: shouldOpen ? 0 : nextFailures,
    openUntilMs: shouldOpen ? Date.now() + Math.max(1000, options.circuitOpenMs) : 0
  });

  throw lastError instanceof Error ? lastError : new Error("external_operation_failed");
}
