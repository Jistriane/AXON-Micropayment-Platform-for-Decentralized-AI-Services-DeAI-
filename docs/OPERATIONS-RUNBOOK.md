# Operations Runbook

This runbook covers the minimum operational steps for the gateway, database, and production payment flow.

## Scope

This document is for:

- gateway startup and outage handling
- payment and facilitator failures
- database backup and restore
- rollback to a known-good release

## 1) Startup preflight

Before starting the gateway in production:

```bash
npm run validate:gateway:production
```

Confirm the following before deployment:

**Facilitator (Payment):**
- `FACILITATOR_MODE=required` (production) or `optional` (staging)
- `ENABLE_FACILITATOR_SETTLEMENT=true`
- `FACILITATOR_URL` is reachable from the production network
- `FACILITATOR_API_KEY` is stored securely (not in version control)
- `FACILITATOR_RELAYER_ID`, `FACILITATOR_POLICY_ID`, `FACILITATOR_PROVIDER_CONTRACT_ID`, and `FACILITATOR_NETWORK` are set

**Inference (Gemini or OpenAI):**
- `INFERENCE_FALLBACK_MODE=disabled` (strict mode for production and `dev:real`)
- `INFERENCE_PROVIDER=gemini` (recommended) or `openai` or `generic`
- `INFERENCE_UPSTREAM_URL` points to production provider
  - Gemini: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`
  - OpenAI: `https://api.openai.com/v1/chat/completions`
- `INFERENCE_UPSTREAM_API_KEY` is set (for gemini and openai)
- `INFERENCE_UPSTREAM_MODEL` matches provider (e.g., `gemini-2.0-flash` or `gpt-4`)
- `INFERENCE_TIMEOUT_MS` is set (recommended: `12000` for Gemini, `30000` for OpenAI)

**Database:**
- `DATABASE_URL` points to PostgreSQL (production)
- Database is reachable and credentials are valid
- Pending migrations have been run: `npm run db:migrate`

**Stellar & On-chain:**
- `STELLAR_SECRET_KEY` is set for payment signing
- `STELLAR_PLATFORM_ACCOUNT` is set for fee collection
- `ENFORCE_CONSUMER_AUTH_ONCHAIN=true`

### Preflight validation example

```bash
# All required vars set and validated
npm run validate:gateway:production

# Expected output:
# [config] No STELLAR_SECRET_KEY provided. Using ephemeral keypair: GC...
# ◇ injected env (23) from .env.local
# Gateway production configuration is valid.
```

If validation fails, check logs for specific missing or invalid variables.

## 2) Incident response

Use this sequence when payments, inference, or startup behavior regresses.

1. Check gateway health endpoint and application logs.
2. Confirm the facilitator endpoint is reachable.
3. Confirm the database connection is valid.
4. Check Horizon and any upstream inference dependency for external outages.
5. Determine whether the failure is isolated to on-chain settlement, inference, or persistence.
6. If the failure affects production payments, switch traffic away from the broken release before making code changes.

### Common failure classes

- Gateway startup fails immediately: missing production env vars or invalid facilitator profile.
- Payment authorization fails: verify caller auth, proof signature, and model availability.
- On-chain settlement fails: verify Horizon, contract IDs, and relayer configuration.
- Inference fails: confirm upstream inference availability and retry/circuit settings.
- Payment history is missing: check Prisma migrations and database connectivity.

## 3) Rollback procedure

If the current release is unstable, roll back to the last known-good build.

1. Stop the current gateway deployment.
2. Restore the previous release artifact or container image.
3. Reapply the previous production environment file if it changed.
4. Run the production preflight again.
5. Start the gateway and verify `/health`.
6. Verify a non-destructive payment authorization path in staging before re-enabling production traffic.

If the problem was introduced by a schema change:

- keep the old release running until a compatible migration plan is prepared
- avoid destructive database changes during the incident unless the data loss tradeoff is explicit

## 4) Backup and restore

### Backup

For the Prisma-backed gateway database, take regular PostgreSQL backups.

Recommended baseline:

```bash
pg_dump "$DATABASE_URL" > gateway-backup.sql
```

Store backups outside the application host or in managed object storage with retention controls.

### Restore

To restore a backup into a clean database:

```bash
psql "$DATABASE_URL" < gateway-backup.sql
```

After restore:

1. Run `npm run db:migrate` if schema migrations are pending.
2. Run `npm run validate:gateway:production`.
3. Verify model listing and payment authorization endpoints.
4. Confirm the latest payment history records are readable.

## 5) Post-incident checklist

After recovery:

- document the root cause
- record the exact configuration values involved
- capture the first failing request or log line
- update tests if the incident exposed a missing regression case
- update the release checklist if a new operational gap was found

## 6) Troubleshooting guide

### Gemini inference returns 503 INFERENCE_UNAVAILABLE

**Symptoms:**
```
POST /inference → 503
{
  "error": {
    "code": "INFERENCE_UNAVAILABLE",
      "message": "Inference service unavailable"
  }
}
```

**Diagnosis:**
1. Verify `INFERENCE_UPSTREAM_URL` and `INFERENCE_UPSTREAM_API_KEY` are set and valid
2. Verify Gemini API key: 
   ```bash
   curl -X GET "https://generativelanguage.googleapis.com/v1beta/models?key=$INFERENCE_UPSTREAM_API_KEY"
   ```
3. Check Google Cloud status: [status.cloud.google.com](https://status.cloud.google.com)
4. Verify rate limit (free tier: 15 req/min)

**Resolution:**
- If key is invalid: generate new key at [ai.google.dev](https://ai.google.dev)
- If rate limited: enable billing in Google Cloud Console
- If quota exceeded: check metrics with `GET /ops/metrics`

### Facilitator settlement fails (required mode)

**Symptoms:**
```
Boot or payment fails with:
"Invalid facilitator production config: ..."
```

**Diagnosis:**
1. Verify all required vars are set:
   ```bash
   echo $FACILITATOR_MODE $FACILITATOR_API_KEY $FACILITATOR_PROVIDER_CONTRACT_ID
   # Should output: required AIzaSyC_... CA6C6IHDT2BDOSWFGQAOEF3SX4ZOC3MCKNCCUU44P2XLQMV7QF25TG2N
   ```
2. Test Facilitator endpoint reachability:
   ```bash
   curl -I $FACILITATOR_URL
   ```
3. Check API key by testing with Facilitator:
   ```bash
   curl -X POST $FACILITATOR_URL \
     -H "Authorization: Bearer $FACILITATOR_API_KEY" \
     -d '{"test": true}'
   ```

**Resolution:**
- Verify vars in `.env.production.local` or secrets manager
- Restart gateway: `npm run dev --workspace services/gateway`
- If required mode is too strict for incident, temporarily switch to `optional` mode

### Payment returns 402 PAYMENT_REQUIRED

**Symptoms:**
```
POST /inference → 402
{
  "error": {"code": "PAYMENT_REQUIRED"},
  "message": "X402 authorization failed"
}
```

**Diagnosis:**
1. Check X402 header presence:
   ```bash
   curl -v http://localhost:8080/inference \
     2>&1 | grep -i "x-402\|x402"
   ```
2. If using Stellar proof, verify timestamp freshness (< 5 min):
   ```bash
   echo "$X402_PROOF" | base64 -d | jq .timestamp
   # Compare with current time in ms: date +%s000
   ```

**Resolution:**
- Add header: `-H "x-402-token: <valid-payment-proof-or-configured-token>"`
- Regenerate Stellar proof with current timestamp (for prod)

### Database connection fails

**Symptoms:**
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Diagnosis:**
1. Verify PostgreSQL is running:
   ```bash
   psql "$DATABASE_URL"
   ```
2. Check connection string in `.env`:
   ```bash
   echo $DATABASE_URL
   # Should be: postgresql://user:pass@host:5432/db
   ```

**Resolution:**
- Start PostgreSQL: `docker-compose up postgres`
- Or use SQLite for dev: `DATABASE_URL="file:./dev.db"`
- Run migrations: `npm run db:migrate --workspace services/gateway`

### On-chain settlement fails (Soroban)

**Symptoms:**
```
Payment returns: txStatus = "pending" but never "confirmed"
or
Error: "Horizon unavailable" appears in logs
```

**Diagnosis:**
1. Check Horizon status: [horizon-testnet.stellar.org](https://horizon-testnet.stellar.org)
2. Verify Stellar network:
   ```bash
   echo $STELLAR_NETWORK $SOROBAN_NETWORK
   # Should both be: testnet
   ```
3. Check contract IDs are valid:
   ```bash
   curl https://horizon-testnet.stellar.org/ledgers
   ```

**Resolution:**
- Wait for Horizon to recover (check status page)
- Or temporarily route traffic to a healthy release/profile with available settlement backends
- Verify contracts were deployed to testnet

### Metrics endpoint returns empty

**Symptoms:**
```
GET /ops/metrics →
{
  "metrics": {"requestsTotal": 0, ...}
}
```

**Cause:** Gateway just restarted; metrics reset on boot

**Resolution:** Wait for requests to accumulate, then check again

## 7) Monitoring and alerting baseline

Use `GET /ops/metrics` as the gateway metrics source.

For upstream inference path validation (staging/production profile):

```bash
npm run smoke:inference:upstream
```

Example pull:

```bash
curl -s http://localhost:8080/ops/metrics
```

Recommended dashboard panels:

- Request throughput (`metrics.requestsTotal` derivative)
- Error rate (`metrics.errorsTotal / metrics.requestsTotal`)
- Status class distribution (`status2xx`, `status4xx`, `status5xx`)
- Route-level error hotspots (`metrics.routes[route].errors`)
- Route-level latency (`metrics.routes[route].avgLatencyMs`)

Recommended alert thresholds:

- Global error rate > 5% for 5 minutes
- `status5xx` increasing continuously for 3 minutes
- `/payments/authorize` avg latency > 500ms for 10 minutes
- `/inference` avg latency > 2s for 10 minutes
- `/payments/tx/:txHash` errors > 10 in 5 minutes

Alert routing:

- P1: payment authorization unavailable, persistent 5xx spikes
- P2: high latency without payment failures
- P3: isolated 4xx increase due to client misuse

## 7) Ownership notes

This project currently uses a small operational footprint. Until centralized monitoring exists, keep the following manually checkable:

- gateway logs
- database backup age
- facilitator reachability
- Horizon reachability
- last successful production preflight
