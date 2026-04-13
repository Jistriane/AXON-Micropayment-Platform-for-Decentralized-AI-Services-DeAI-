# Payment Flow Guide

Complete overview of how payments work in the DeAI gateway with multi-layer settlement.

## Overview

The gateway uses a **layered settlement strategy** — if one backend is unavailable, it attempts the next layer. However, **inference has no fallback**; it returns 503 if upstream is unavailable.

**Payment Settlement Layers:**
1. Validate payment authorization and request integrity
2. Attempt Facilitator settlement (when enabled)
3. Attempt Soroban on-chain settlement (when enabled)
4. Persist local settlement (`txStatus=local`) when simulation/local path is used
5. Persist payment record and transaction hash
6. Execute inference with validated payment

---

## 1) Payment Validation

### 1.1 X402 authorization check

Inference requests must include a valid X402 payment proof header:

```bash
curl -X POST http://localhost:8080/inference \
  -H "x-402-token: <valid-payment-proof>" \
  -H "Content-Type: application/json" \
  -d '{"modelId":"...","prompt":"..."}'
```

> **Note:** Hardcoded dev tokens are no longer accepted. The token must be configured via `X402_EXPECTED_TOKEN` env variable and must be non-empty.

If authorization is invalid or missing, gateway returns HTTP 402.

### 1.2 Required payload context

The flow validates:
- model existence and active status
- paid authorization header
- payment reference uniqueness
- amount and address consistency in payment authorization

---

## 2) Layer 1 - Facilitator Settlement

When enabled, the gateway calls Facilitator first.

### Typical config

```env
ENABLE_FACILITATOR_SETTLEMENT="true"
FACILITATOR_MODE="required"   # required | optional | disabled
FACILITATOR_URL="https://facilitator.example.com/settle"
FACILITATOR_API_KEY="..."
```

### Modes

- `required`: fail payment if Facilitator is unavailable
- `optional`: continue to next layer on failure
- `disabled`: skip Facilitator

---

## 3) Layer 2 - Soroban On-Chain Settlement

If enabled, gateway attempts settlement through Soroban contracts.

### Typical config

```env
ENABLE_SOROBAN_SETTLEMENT="true"
SOROBAN_NETWORK="testnet"
MARKETPLACE_CONTRACT_ID="..."
PAYMENT_ROUTER_CONTRACT_ID="..."
```

If on-chain settlement fails and simulation/local path is active, gateway continues with local persistence (`txHash=local_<paymentRef>`).

---

## 4) Payment Status Tracking

Gateway stores payment records for operational observability.

Status lifecycle:
- `submitted` — payment authorization initiated
- `confirmed` — settlement backend returned real transaction hash
- `failed` — settlement backend unavailable or returned error

> **Note:** `local` is used for non-on-chain transaction hashes. If settlement fails entirely, payment returns error (402 or 503).

---

## 5) Inference Execution Gate

Inference runs only after payment authorization succeeds **and upstream is available**.

If payment succeeds but inference upstream unavailable:
- Gateway returns HTTP 503 Service Unavailable
- No fallback to mock inference
- Client must retry or use alternative provider

---

## 6) Failure Scenarios

### 402 PAYMENT_REQUIRED

Causes:
- missing or invalid X402 authorization header
- configured X402 token doesn't match
- no settlement backend available (Facilitator, Soroban, or Stellar disabled)

### 503 SERVICE_UNAVAILABLE

Causes:
- `INFERENCE_UPSTREAM_URL` not configured or unreachable
- upstream provider (Gemini, OpenAI) unavailable
- `INFERENCE_FALLBACK_MODE` is not "disabled" (should never happen in production)

> **Strict Mode:** No mock fallback. The system fails explicitly rather than silently degrading.

### 409 CONFLICT

Cause:
- not expected in current flow: `paymentRef` is handled idempotently.

Recommendation:
- always generate unique payment references in clients
- if a duplicate is sent, treat the response as replay of the original authorization (`200` or `402`).

---

## 7) Operational Guidelines

- `FACILITATOR_MODE=required` in production when Facilitator is mandatory
- `INFERENCE_FALLBACK_MODE` is always "disabled" (hardcoded in config type)
- X402 token must be non-empty and configured via `X402_EXPECTED_TOKEN`
- Both payment settlement and inference require real upstream services
- Use CI smoke scripts with verified env values to avoid flaky behavior
- Configure retry/circuit-breaker settings aligned with provider SLAs
