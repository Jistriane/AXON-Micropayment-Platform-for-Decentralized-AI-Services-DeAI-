# Production Readiness Report

**Last Updated:** 2026-04-13  
**Status:** ✅ Ready for production profile (`dev:real`) with strict upstream inference and on-chain settlement paths configured

## Executive Summary

The platform supports two explicit runtime profiles:

- **Simulation profile (`dev:sim`)**: local settlement and local inference simulation are allowed for developer productivity.
- **Production-like profile (`dev:real`)**: local simulation paths are disabled; inference requires healthy upstream provider and settlement must come from real backends.

Recent hardening work focused on transaction status consistency, idempotent payment authorization, real on-chain hash propagation, and observability.

## Current Readiness Baseline

- Gateway test suite: **47 passing tests**
- Web build: passing
- Soroban testnet contracts deployed and referenced in docs
- Real tx hashes observed and exposed to frontend/explorer links when on-chain settlement succeeds
- Payment history persistence includes `txStatus` and `txStatusUpdatedAt`

## Runtime Profiles

### 1) Simulation profile (local development)

Use when building quickly without fully provisioned external services.

Expected behavior:

- `ENABLE_LOCAL_SETTLEMENT_SIMULATION=true`
- local settlement hashes returned as `local_<paymentRef>` when on-chain settlement is not used
- local inference simulation can answer requests when upstream is unavailable

### 2) Production-like profile (pre-prod/prod validation)

Use for release gates and production deployment behavior.

Required behavior:

- `INFERENCE_FALLBACK_MODE=disabled`
- configured and reachable inference upstream (`INFERENCE_UPSTREAM_URL`, provider key/model)
- settlement via configured real backend(s): Facilitator and/or Soroban
- no dependency on local simulation toggles

## Critical Production Configuration

```env
# Inference (strict)
INFERENCE_PROVIDER=gemini
INFERENCE_UPSTREAM_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
INFERENCE_UPSTREAM_API_KEY=<secret>
INFERENCE_UPSTREAM_MODEL=gemini-2.0-flash
INFERENCE_FALLBACK_MODE=disabled

# Settlement
ENABLE_SOROBAN_SETTLEMENT=true
MARKETPLACE_CONTRACT_ID=<contract_id>
PAYMENT_ROUTER_CONTRACT_ID=<contract_id>
SOROBAN_NETWORK=testnet
SOROBAN_IDENTITY=axon-admin

# Optional facilitator (recommended in managed ops)
ENABLE_FACILITATOR_SETTLEMENT=true
FACILITATOR_MODE=required
FACILITATOR_URL=https://facilitator.example/settle
FACILITATOR_API_KEY=<secret>
```

## Production Risk Checks

- `paymentRef` replay should remain idempotent (`200` or `402`, never duplicate write)
- `txStatus` should be one of `submitted|confirmed|failed|local`
- explorer links should only rely on true on-chain hashes (64 hex)
- `GET /payments/tx/:txHash` should persist terminal `confirmed|failed` states
- facilitator required mode should fail fast at startup when profile is incomplete

## Validation Commands

```bash
npm run validate:gateway:production
npm run test --workspace services/gateway
npm run smoke:inference:upstream
npm run verify:all
```

## Release Gate Checklist

- [ ] Run gateway tests and confirm green
- [ ] Run production preflight validation
- [ ] Verify upstream inference credentials and quotas
- [ ] Verify Soroban contract IDs and signer identity
- [ ] Verify payment authorization returns real tx hashes in production profile
- [ ] Verify operation telemetry through `GET /ops/metrics`

## Conclusion

The project is production-ready when operated in the strict profile with real upstream inference and settlement backends. Keep simulation profile limited to local development and CI convenience flows.
