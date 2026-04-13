# Quick Start Guide

Start developing and testing the DeAI platform in 5 minutes.

## Prerequisites

- Node.js 20+
- npm 10+
- Git

## 1) Install dependencies

```bash
cd "$PROJECT_ROOT"
npm install
```

## 2) Configure environment

> `dev:sim` can run locally with settlement and inference simulation. Use a real upstream (Gemini/OpenAI) when validating production-like behavior (`dev:real`).

### Local development with real Gemini

```bash
cat > services/gateway/.env.local << 'EOF_ENV'
DATABASE_URL="file:./dev.db"

SOROBAN_IDENTITY="axon-admin"
SOROBAN_NETWORK="testnet"
ENABLE_SOROBAN_SETTLEMENT="true"
ENFORCE_CONSUMER_AUTH_ONCHAIN="false"
MARKETPLACE_CONTRACT_ID="CA6C6IHDT2BDOSWFGQAOEF3SX4ZOC3MCKNCCUU44P2XLQMV7QF25TG2N"
PAYMENT_ROUTER_CONTRACT_ID="CDYSQ5H5L55ONJJ24FZMF25Z45J3HAIRI4PIDVJS6RCQNWWK2JH7DWJC"

ENABLE_FACILITATOR_SETTLEMENT="false"
FACILITATOR_MODE="optional"

INFERENCE_PROVIDER="gemini"
INFERENCE_UPSTREAM_URL="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
INFERENCE_UPSTREAM_API_KEY="YOUR_GEMINI_API_KEY_HERE"
INFERENCE_UPSTREAM_MODEL="gemini-2.0-flash"
INFERENCE_FALLBACK_MODE="disabled"
INFERENCE_TIMEOUT_MS="12000"
EOF_ENV
```

### Local development with OpenAI

```bash
cat > services/gateway/.env.local << 'EOF_ENV'
DATABASE_URL="file:./dev.db"

SOROBAN_IDENTITY="axon-admin"
SOROBAN_NETWORK="testnet"
ENABLE_SOROBAN_SETTLEMENT="true"
ENFORCE_CONSUMER_AUTH_ONCHAIN="false"
MARKETPLACE_CONTRACT_ID="CA6C6IHDT2BDOSWFGQAOEF3SX4ZOC3MCKNCCUU44P2XLQMV7QF25TG2N"
PAYMENT_ROUTER_CONTRACT_ID="CDYSQ5H5L55ONJJ24FZMF25Z45J3HAIRI4PIDVJS6RCQNWWK2JH7DWJC"

ENABLE_FACILITATOR_SETTLEMENT="false"
FACILITATOR_MODE="optional"

INFERENCE_PROVIDER="openai"
INFERENCE_UPSTREAM_URL="https://api.openai.com/v1/chat/completions"
INFERENCE_UPSTREAM_API_KEY="sk-..."
INFERENCE_UPSTREAM_MODEL="gpt-4-turbo"
INFERENCE_FALLBACK_MODE="disabled"
INFERENCE_TIMEOUT_MS="12000"
EOF_ENV
```

## 3) Run database migration

```bash
npm run db:migrate --workspace services/gateway
```

## 4) Start services

Monorepo (recommended):

```bash
npm run dev:sim
```

Use `npm run dev:real` if you want to disable local settlement simulation and use only real configured settlement backends.

Workspace-level commands:

Gateway (simulation mode):

```bash
npm run dev:sim --workspace services/gateway
```

Gateway (real settlement only):

```bash
npm run dev:real --workspace services/gateway
```

Web app:

```bash
npm run dev --workspace apps/web
```

## 5) Verify health

```bash
curl http://localhost:8080/health
```

Expected: `status: ok`

---

## Useful commands

```bash
npm run lint
npm run build
npm run test --workspace services/gateway
npm run smoke:gateway:ci
npm run smoke:inference:upstream:ci
npm run test:e2e:web
npm run verify:all
```

---

## Next docs

- [API Reference](API.md)
- [Inference Providers](INFERENCE-PROVIDERS.md)
- [Gemini Setup](GEMINI-SETUP.md)
- [Payment Flow](PAYMENT-FLOW.md)
- [Testing](TESTING.md)
- [Operations Runbook](OPERATIONS-RUNBOOK.md)
