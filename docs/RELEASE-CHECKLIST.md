# Production Release Checklist (Target: 95%+ readiness)

Last update: 2026-04-12

This checklist converts project readiness into binary criteria (`Done` or `Pending`) so release decisions are objective.

## Scoring model

- Weight per area is fixed.
- Area score = `done_items / total_items`.
- Global readiness = weighted sum of area scores.

| Area | Weight |
|---|---:|
| Smart Contracts | 20% |
| Gateway/API | 25% |
| Frontend/Web | 20% |
| Data/Persistence | 10% |
| Testing/Quality | 15% |
| DevOps/Operations | 10% |

## 1) Smart Contracts (20%)

| Criterion | Status |
|---|---|
| Marketplace contract deployed on testnet | Done |
| Payment Router contract deployed on testnet | Done |
| `quote_split` callable from gateway | Done |
| `settle` callable from gateway | Done |
| Contract init transactions documented | Done |
| Consumer auth enforcement strategy for production (`ENFORCE_CONSUMER_AUTH_ONCHAIN=true`) validated | Done |
| Mainnet deployment runbook prepared | Done |

Progress: `7/7` (100%)

## 2) Gateway/API (25%)

| Criterion | Status |
|---|---|
| `GET /models` and `POST /models` stable | Done |
| `POST /payments/authorize` with on-chain optional path | Done |
| Layered settlement path on on-chain failure with explicit failure when no backend is available | Done |
| `GET /payments/tx/:txHash` status lookup endpoint | Done |
| Tx terminal status persisted to DB | Done |
| X402 configured token + signed proof validation | Done |
| Strict caller/paymentProof enforcement path (`ENFORCE_CONSUMER_AUTH_ONCHAIN=true`) | Done |
| Cryptographic verification of `paymentProof.signature` in strict mode | Done |
| Optional facilitator settlement integration path (`ENABLE_FACILITATOR_SETTLEMENT`) | Done |
| Facilitator production policy/SLA mode (`FACILITATOR_MODE=required`) | Done |
| Facilitator required-mode fail-fast when unset/unavailable | Done |
| Facilitator startup validation for required production profile | Done |
| OpenZeppelin relayer metadata wiring (`relayerId`, `policyId`, `providerContractId`) | Done |
| Facilitator production deployment guide prepared | Done |
| Full OpenZeppelin relayer production integration (credentials, network policy, provider contract) | Done |
| Production-grade retries/circuit breaking for external dependencies | Done |

Progress: `16/16` (100%)

## 3) Frontend/Web (20%)

| Criterion | Status |
|---|---|
| Marketplace and publish-model flow working | Done |
| Paid inference flow working | Done |
| Payment history hydrated from backend | Done |
| Operation card tx summary (`On-chain`/`Failed`, tx state, link) | Done |
| Tx state polling implemented | Done |
| Basic wallet connection in frontend (Freighter public key) | Done |
| Transaction signing UX with wallet in payment flow | Done |
| Explicit production UX for auth failures and chain errors | Done |

Progress: `8/8` (100%)

## 4) Data/Persistence (10%)

| Criterion | Status |
|---|---|
| Prisma migrations in place | Done |
| Payment metadata persistence (`txStatus`, timestamps) | Done |
| SQLite development profile available | Done |
| PostgreSQL production profile documented | Done |
| Backup and restore operational playbook | Done |

Progress: `5/5` (100%)

## 5) Testing/Quality (15%)

| Criterion | Status |
|---|---|
| Gateway tests passing | Done |
| Web E2E passing | Done |
| Tx state transition (`Submitted -> Confirmed`) covered in E2E | Done |
| Strict failure flow (payment/inference) covered in E2E | Done |
| Contract tests (`cargo test`) in CI path | Done |
| Security-focused tests (auth abuse, replay, malformed proofs) | Done |

Progress: `6/6` (100%)

## 6) DevOps/Operations (10%)

| Criterion | Status |
|---|---|
| Soroban deployment script automated | Done |
| Monorepo CI scripts available | Done |
| Environment templates updated | Done |
| Structured monitoring/alerting dashboards | Done |
| Incident response and rollback runbook | Done |
| Production gateway environment profile prepared | Done |
| Gateway production preflight command (`npm run validate:gateway:production`) | Done |

Progress: `7/7` (100%)

## Current weighted readiness

- Smart Contracts: `1.00 * 20 = 20.0`
- Gateway/API: `1.00 * 25 = 25.0`
- Frontend/Web: `1.00 * 20 = 20.0`
- Data/Persistence: `1.00 * 10 = 10.0`
- Testing/Quality: `1.00 * 15 = 15.0`
- DevOps/Operations: `1.00 * 10 = 10.0`

Estimated total readiness: **100.0% toward production criteria**

Note: This production checklist is stricter than MVP completion and enforces explicit failures (no mock inference fallback in runtime).

## Post-95% improvements

1. Integrate dedicated production AI services as upstream inference providers.
2. Add external metrics backend integration (Prometheus/Grafana, Datadog, or equivalent).
3. Keep strict upstream-only inference configuration (`INFERENCE_FALLBACK_MODE=disabled`) across production profiles.
4. Keep `smoke:inference:upstream:ci` in CI to continuously validate upstream provider contract.
