# AXON Gateway API

Local base URL: `http://localhost:8080`

## Active Soroban contracts (testnet)

- `MARKETPLACE_CONTRACT_ID`: `CA6C6IHDT2BDOSWFGQAOEF3SX4ZOC3MCKNCCUU44P2XLQMV7QF25TG2N`
- `PAYMENT_ROUTER_CONTRACT_ID`: `CDYSQ5H5L55ONJJ24FZMF25Z45J3HAIRI4PIDVJS6RCQNWWK2JH7DWJC`

## GET /health

Returns service health status.

200 response:

```json
{
  "status": "ok",
  "service": "axon-gateway",
  "network": "testnet",
  "uptimeSec": 132.4
}
```

## GET /ops/metrics

Returns in-memory operational metrics for dashboarding and alerting.

Behavior:

- Aggregates request totals and error totals since process startup.
- Tracks HTTP status classes (`2xx`, `4xx`, `5xx`).
- Tracks per-route request/error counts and average latency.

200 response:

```json
{
  "generatedAt": "2026-04-12T22:00:00.000Z",
  "service": "axon-gateway",
  "network": "testnet",
  "uptimeSec": 420.4,
  "metrics": {
    "requestsTotal": 152,
    "errorsTotal": 9,
    "status2xx": 143,
    "status4xx": 7,
    "status5xx": 2,
    "routes": {
      "/health": {
        "requests": 20,
        "errors": 0,
        "totalLatencyMs": 37,
        "avgLatencyMs": 1.85
      },
      "/payments/authorize": {
        "requests": 35,
        "errors": 3,
        "totalLatencyMs": 790,
        "avgLatencyMs": 22.57
      }
    }
  }
}
```

## GET /models

Returns active models.

200 response:

```json
[
  {
    "id": "uuid",
    "providerAddress": "G...",
    "name": "AXON Summarizer v1",
    "description": "Technical summarization",
    "endpoint": "/inference",
    "priceMicrounit": 25000,
    "active": true,
    "createdAt": "2026-04-04T00:00:00.000Z"
  }
]
```

## POST /models

Creates a new model.

Body:

```json
{
  "providerAddress": "GCF5...",
  "name": "My Model",
  "description": "Classifier",
  "endpoint": "/inference",
  "priceMicrounit": 45000
}
```

## GET /payments

Returns payment history.

Persisted fields per item:

- `createdAt` and `updatedAt` from DB record lifecycle.
- `txStatus` and `txStatusUpdatedAt` for consolidated transaction state.
- `txHash` semantics:
  - Soroban tx hash (64 hex) when on-chain settle succeeds.
  - local hash (`local_<paymentRef>`) for local/off-chain path.

## GET /payments/tx/:txHash

Returns payment transaction status.

Behavior:

- For non-on-chain hashes (for example `local_pay_123`), returns `local`.
- For on-chain hashes, returns:
  - `submitted` when not yet confirmed (or when lookup is disabled)
  - `confirmed` when successful on Horizon
  - `failed` when failed on Horizon
- For `confirmed` or `failed`, gateway persists the terminal status in the DB.

200 response:

```json
{
  "txHash": "b44e11fee2688d84f8494479ca0cc63a0c825e25732a22631aac028c71b2b457",
  "status": "confirmed",
  "source": "horizon"
}
```

## POST /payments/authorize

Authorizes payment and computes platform split.

Behavior:

- Validates that `modelId` exists and is active.
- If `PAYMENT_ROUTER_CONTRACT_ID` is set, gateway attempts on-chain `quote_split`.
- If `ENABLE_FACILITATOR_SETTLEMENT=true` and `FACILITATOR_URL` is configured, gateway can call facilitator settlement endpoint first.
- `FACILITATOR_MODE=required` turns facilitator settlement into a fail-fast production requirement.
- If `ENABLE_SOROBAN_SETTLEMENT=true`, gateway attempts on-chain `settle` and returns its tx hash.
- If on-chain operations fail, gateway persists a local settlement (`txStatus=local`) in simulation/local flows.
- External dependencies (facilitator, Horizon, inference upstream) run with retry + timeout + in-memory circuit protection.
- When `ENFORCE_CONSUMER_AUTH_ONCHAIN=true`, gateway enforces strict caller checks:
  - `callerAddress` must be a valid Stellar public key.
  - `paymentProof` must be present.
  - `paymentProof.payerPublicKey` must match `callerAddress`.
  - `paymentProof.timestamp` must be within a 5-minute freshness window.
  - `paymentProof.signature` is cryptographically verified against a canonical payment message.

Relevant variables:

- `ENABLE_SOROBAN_SETTLEMENT` (default `false`)
- `ENABLE_FACILITATOR_SETTLEMENT` (default `false`)
- `FACILITATOR_MODE` (default `optional`)
- `FACILITATOR_URL` (default empty)
- `FACILITATOR_API_KEY` (default empty)
- `FACILITATOR_TIMEOUT_MS` (default `4000`)
- `EXTERNAL_MAX_ATTEMPTS` (default `2`)
- `EXTERNAL_RETRY_BASE_DELAY_MS` (default `150`)
- `EXTERNAL_FAILURE_THRESHOLD` (default `3`)
- `EXTERNAL_CIRCUIT_OPEN_MS` (default `10000`)
- `INFERENCE_MAX_ATTEMPTS` (default `2`)
- `HORIZON_MAX_ATTEMPTS` (default `2`)
- `FACILITATOR_MAX_ATTEMPTS` (default `2`)
- `FACILITATOR_RELAYER_ID` (default empty)
- `FACILITATOR_POLICY_ID` (default empty)
- `FACILITATOR_PROVIDER_CONTRACT_ID` (default empty)
- `FACILITATOR_NETWORK` (default `testnet`)
- `ENFORCE_CONSUMER_AUTH_ONCHAIN` (default `false`)
- `ENABLE_TX_STATUS_LOOKUP` (default `false`, backend)
- `HORIZON_URL` (default `https://horizon-testnet.stellar.org`)
- `SOROBAN_IDENTITY` (default `axon-admin`)
- `SOROBAN_NETWORK` (default `testnet`)

Frontend note:

- `NEXT_PUBLIC_ENABLE_TX_STATUS_LOOKUP` is enabled by default in UI runtime and only disabled with explicit `false`.

Body:

```json
{
  "modelId": "uuid",
  "callerAddress": "GUSER...",
  "amountMicrounit": 25000,
  "paymentRef": "pay_123",
  "paymentProof": {
    "payerPublicKey": "GUSER...",
    "timestamp": 1776038200000,
    "signature": "base64_or_wallet_signature"
  }
}
```

200 response:

```json
{
  "success": true,
  "platformFeeMicrounit": 1250,
  "providerAmountMicrounit": 23750,
  "txHash": "local_pay_123"
}
```

`txHash` notes:

- With on-chain settle enabled and successful: Soroban tx hash (64 hex).
- Without on-chain settle (or in simulation mode): local hash (`local_<paymentRef>`).

`txStatus` values in `GET /payments`:

- `submitted`: tx still being tracked.
- `confirmed`: tx confirmed.
- `failed`: tx failed.

Errors:

- `404` when model does not exist or is inactive.
- `400` for invalid payload.
- Reused `paymentRef` is idempotent: existing payment is returned (`200` for success, `402` for failed authorization).

## POST /inference

Executes inference after X402 token validation.

Behavior:

- If `INFERENCE_UPSTREAM_URL` is configured, gateway calls external service first.
- Upstream provider mode is controlled by `INFERENCE_PROVIDER`:
  - `generic` (default): sends gateway-native inference payload to upstream.
  - `gemini`: sends Gemini-compatible payload (`contents`, `generationConfig`).
  - `openai`: sends Chat Completions-compatible payload (`model`, `messages`, `temperature`).
- For `INFERENCE_PROVIDER=gemini`, set:
  - `INFERENCE_UPSTREAM_API_KEY`
  - `INFERENCE_UPSTREAM_MODEL` (for example `gemini-2.0-flash`)
- For `INFERENCE_PROVIDER=openai`, set:
  - `INFERENCE_UPSTREAM_API_KEY`
  - `INFERENCE_UPSTREAM_MODEL` (for example `gpt-4o-mini`)
- `INFERENCE_FALLBACK_MODE` must be `disabled` in strict mode.
- Accepts configured X402 authorization token and signed Stellar payment proof.

Headers:

- `Content-Type: application/json`
- `x-402-token: <configured-token-or-base64-stellar-proof>`

Configured token example:

```
x-402-token: your-configured-token
```

Base64 Stellar proof example:

```
x-402-token: eyJwYXllclB1YmxpY0tleSI6IkctLi4iLCJyZWNpcGllbnRBY2NvdW50IjoiRy4uLiIsImFtb3VudE1pY3JvdW5pdCI6MjUwMDAsInRpbWVzdGFtcCI6MTc3NTQxNDUyMDAwMCwic2lnbmF0dXJlIjoic2lnbmVkX3BheWxvYWQifQ==
```

Decoded shape:

```json
{
  "payerPublicKey": "GXXXXX...",
  "recipientAccount": "GYYYYY...",
  "amountMicrounit": 25000,
  "timestamp": 1775414520000,
  "signature": "base64_or_wallet_signature"
}
```

Body:

```json
{
  "modelId": "uuid",
  "prompt": "Explain micropayments",
  "temperature": 0.3
}
```

Errors:

- `402 PAYMENT_REQUIRED` when X402 header is invalid or expired.
- `404` when model does not exist.
- `400` for invalid payload.
- `503 INFERENCE_UNAVAILABLE` when upstream inference is missing or unavailable.

Operational check:

```bash
npm run smoke:inference:upstream
```
