# AXON - Decentralized AI Payments

![AXON Logo](apps/web/public/Logo.png)

![AXON Dashboard](Dashboard.png)

![AXON Dashboard Full](Dashord%20Complet.png)

MVP monorepo for a Stellar-based agentic micropayments hackathon project.

## Overview

This repository implements a DeAI platform with:

- Soroban contracts for AI marketplace and payment routing
- Off-chain gateway with X402-style payment validation
- Next.js web dApp for model listing and paid inference
- Basic CI/CD scripts and local Docker-ready infrastructure

## Complete Architecture Diagram

```mermaid
flowchart LR
  U[User / Wallet] --> W[Web App\nNext.js]

  subgraph OffChain[Off-chain Platform]
    W --> G[Gateway API\nFastify + TypeScript]
    G --> DB[(Prisma DB\nSQLite dev / Postgres prod)]
    G --> M[Metrics Endpoint\nGET /ops/metrics]

    G --> INF{Inference Provider Layer}
    INF --> GEM[Gemini\nGoogle Generative AI]
    INF --> OAI[OpenAI\nChat Completions]
    INF --> GEN[Generic\nCompatible Endpoint]

    G --> FAC[OpenZeppelin Facilitator\nX402 Settlement]
  end

  subgraph OnChain[On-chain Stellar / Soroban]
    SC[Stellar Network\nSoroban Contracts]
    MP[marketplace contract]
    PR[payment_router contract]
    SC --> MP
    SC --> PR
  end

  G -->|quote_split / settle| SC
  FAC -->|mediated settlement| SC
  W -->|status polling| G

  subgraph CI[Quality and Delivery]
    T1[Gateway Tests\n47 unit tests]
    T2[Smoke Tests\ngateway + upstream + web]
    T3[Web E2E\nPlaywright]
    T4[Soroban Tests\nRust]
    PIPE[verify:all pipeline]
    T1 --> PIPE
    T2 --> PIPE
    T3 --> PIPE
    T4 --> PIPE
  end

  PIPE --> REL[Production Release\nChecklist + Runbook]
```

## End-to-End Payment and Inference Sequence

```mermaid
sequenceDiagram
  autonumber
  participant U as User/Wallet
  participant W as Web App (Next.js)
  participant G as Gateway API
  participant F as Facilitator
  participant S as Soroban (Stellar)
  participant D as Prisma DB
  participant P as AI Provider (Gemini/OpenAI/Generic)

  U->>W: Open app and select model
  W->>G: GET /models
  G-->>W: Model list + price

  U->>W: Submit prompt
  W->>G: POST /payments/authorize
  G->>D: Validate model/paymentRef and persist auth state

  alt Facilitator enabled
    G->>F: Settlement request (X402 metadata)
    alt Facilitator success
      F-->>G: Settled
    else Facilitator failure
      alt FACILITATOR_MODE=required
        G-->>W: 402 Payment denied
        W-->>U: Show payment rejection
      else FACILITATOR_MODE=optional
        G->>S: Continue with direct Soroban settlement
      end
    end
  else Facilitator disabled
    G->>S: On-chain settlement
  end

  alt On-chain success
    S-->>G: txHash + submitted/confirmed
  else On-chain failure
    G->>D: Persist local settlement status
  end

  G-->>W: Payment authorized + tx status
  W-->>U: Show tx timeline/state

  W->>G: POST /inference + X-402-token
  G->>D: Verify paid state and model activity
  G->>P: Inference request

  alt Provider success
    P-->>G: Inference result
    G->>D: Persist response metadata
    G-->>W: 200 paid=true + result
    W-->>U: Render answer
  else Provider failure
    G-->>W: 503 INFERENCE_UNAVAILABLE
    W-->>U: Show infrastructure error
  end

  loop Optional tx polling
    W->>G: GET /payments/tx/:txHash
    G->>D: Resolve latest status
    G-->>W: submitted/confirmed/failed/local
  end
```

## Current validated status (2026-04-13) — Production Ready ✅

### Payment & Settlement
- ✅ Facilitator (OpenZeppelin) integration: `required` mode enforces API key + contract validation at boot
- ✅ Soroban testnet contracts active (`marketplace` + `payment_router`)
- ✅ Multi-level settlement: Facilitator → On-chain → Local fallback
- ✅ Payment persistence with transaction tracking (`txStatus`, `txHash`, `txStatusUpdatedAt`)
- ✅ Retry logic + circuit breaker for external dependencies (Facilitator, Horizon, inference)

### Inference
- ✅ **Gemini API integration**: Google Generative AI with real credentials (no mock in prod)
- ✅ Provider abstraction: supports `gemini` (recommended), `openai`, `generic`
- ✅ Strict mode: `INFERENCE_FALLBACK_MODE=disabled` returns 503 INFERENCE_UNAVAILABLE on upstream failure
- ✅ Payload translation: request/response format adaptation per provider

### Observability
- ✅ Operational metrics endpoint: `GET /ops/metrics` with per-route latency + error tracking
- ✅ Production preflight validation: `npm run validate:gateway:production`
- ✅ Smoke tests automated: upstream inference edge-to-edge (manual + CI)

### Testing & QA
- ✅ **47 gateway tests** (config, payment, auth, facilitator, http, inference)
- ✅ **CI smoke tests** with mock Gemini server (no real credentials in CI)
- ✅ **Web E2E suite**: 6/6 scenarios passing
- ✅ **Contract tests**: Soroban marketplace + payment_router

### Frontend & UX
- ✅ Wallet connection support (Freighter)
- ✅ Model listing with price display
- ✅ Payment authorization UI with X402 proof
- ✅ Transaction status tracking (On-chain / Local)
- ✅ Inference result display

For objective release gating, see [Production Release Checklist](docs/RELEASE-CHECKLIST.md).

## Documentation

- [Documentation Index](docs/INDEX.md) — Full map of guides by workflow and audience

**Getting Started:**
- [Quick Start](docs/QUICK-START.md) — Setup in 5 minutes
- [Gemini Setup](docs/GEMINI-SETUP.md) — Configure Gemini API step-by-step
- [Inference Providers](docs/INFERENCE-PROVIDERS.md) — Gemini vs OpenAI vs Generic

**Development:**
- [API Reference](docs/API.md) — All endpoints and responses
- [Payment Flow](docs/PAYMENT-FLOW.md) — How payments work (multi-level settlement)
- [Testing Guide](docs/TESTING.md) — Unit, smoke, and E2E tests

**Operations:**
- [Operations Runbook](docs/OPERATIONS-RUNBOOK.md) — Deployment, incidents, troubleshooting
- [Facilitator Production](docs/FACILITATOR-PRODUCTION.md) — OpenZeppelin relayer configuration
- [Release Checklist](docs/RELEASE-CHECKLIST.md) — Pre-release validation

## Structure

- `contracts/soroban/marketplace`: AI model registry contract
- `contracts/soroban/payment_router`: payment split and settlement contract
- `services/gateway`: Fastify API for catalog, payment, and inference
- `apps/web`: Next.js frontend flow
- `packages/shared`: shared TypeScript contracts and types
- `infra`: local docker-compose assets

## Requirements

- Node.js 20+
- Rust + `wasm32-unknown-unknown` target
- Soroban CLI (for on-chain deploy and tests)

## X402 payment with Stellar

- The gateway validates X402 headers for HTTP micropayment flows.
- It supports both a dev token (`dev-x402-token`) and signed Stellar payment proofs.
- Stellar proof includes payer key, recipient account, amount in microunits, timestamp, and signature.
- Proofs outside a 5-minute time window are rejected.
- For real Stellar settlement, configure:
  - `STELLAR_SECRET_KEY`: gateway private key (ephemeral keypair if missing)
  - `STELLAR_PLATFORM_ACCOUNT`: account that receives platform fees
  - `ENABLE_STELLAR_SETTLEMENT=true`: enables real settlement instead of mock mode

### Gateway dev modes

- `npm run dev --workspace services/gateway` (or `npm run dev:sim --workspace services/gateway`): enables local settlement simulation for a smoother local UX.
- `npm run dev:real --workspace services/gateway`: disables local simulation and uses only real configured settlement backends (Facilitator/Soroban).

## Persistence with Prisma

- The gateway uses **Prisma ORM** for relational persistence.
- Supported databases:
  - **SQLite** for development (`DATABASE_URL="file:./dev.db"`)
  - **PostgreSQL** for production (`DATABASE_URL="postgresql://user:password@localhost:5432/axon_gateway"`)
- Migration and inspection commands:

```bash
npm run db:migrate
npm run db:studio
```

## External inference with Gemini

- The gateway integrates with Google Generative AI (Gemini) via `INFERENCE_PROVIDER=gemini`
- Supports real-time inference with credentials from [ai.google.dev](https://ai.google.dev)
- Provider abstraction also supports OpenAI (`INFERENCE_PROVIDER=openai`) and generic compatible endpoints
- Production mode (`INFERENCE_FALLBACK_MODE=disabled`) enforces upstream-only, returns 503 on failure
- Request/response payload translation per provider (Gemini uses `contents` format)

**Configuration:**

```env
INFERENCE_PROVIDER=gemini
INFERENCE_UPSTREAM_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
INFERENCE_UPSTREAM_API_KEY=AIzaSyC_xxxxx  # from ai.google.dev
INFERENCE_UPSTREAM_MODEL=gemini-2.0-flash
INFERENCE_FALLBACK_MODE=disabled  # production: no mock fallback
INFERENCE_TIMEOUT_MS=12000
```

See:
- [docs/QUICK-START.md](docs/QUICK-START.md) — Get started in 5 minutes
- [docs/GEMINI-SETUP.md](docs/GEMINI-SETUP.md) — Step-by-step Gemini configuration
- [docs/INFERENCE-PROVIDERS.md](docs/INFERENCE-PROVIDERS.md) — Compare providers

## Facilitator settlement (OpenZeppelin)

The gateway supports mediated payment settlement with OpenZeppelin Facilitator:

- **Modes:**
  - `FACILITATOR_MODE=required`: must use facilitator, fail-fast on unavailability (production)
  - `FACILITATOR_MODE=optional`: try facilitator, fallback to on-chain (development)
  - `FACILITATOR_MODE=disabled`: skip facilitator entirely

- **Required configuration for `required` mode:**
  ```env
  ENABLE_FACILITATOR_SETTLEMENT=true
  FACILITATOR_MODE=required
  FACILITATOR_URL=https://facilitator.example/settle
  FACILITATOR_API_KEY=your-secret-key
  FACILITATOR_RELAYER_ID=openzeppelin-relayer
  FACILITATOR_POLICY_ID=production-policy
  FACILITATOR_PROVIDER_CONTRACT_ID=CA6C6IHDT2BDOSWFGQAOEF3SX4ZOC3MCKNCCUU44P2XLQMV7QF25TG2N
  ```

See [docs/FACILITATOR-PRODUCTION.md](docs/FACILITATOR-PRODUCTION.md) for full configuration.

## Quick start

**For developers:** See [docs/QUICK-START.md](docs/QUICK-START.md) for detailed setup steps.

```bash
npm install
npm run dev
```

Alternative modes:

```bash
npm run dev:sim   # Web + gateway with local settlement simulation
npm run dev:real  # Web + gateway using only real settlement backends
```

- Frontend: http://localhost:3000
- Gateway: http://localhost:8080/health

## Frontend deploy (GitHub Pages)

The frontend is deployed automatically via GitHub Actions when new commits land on `main`.

- Workflow: `.github/workflows/deploy-pages.yml`
- Trigger: `push` on `main` (and manual `workflow_dispatch`)
- Build mode: Next.js static export (`GITHUB_PAGES=true`)
- Artifact path: `apps/web/out`
- Public URL:
  - https://jistriane.github.io/AXON-Micropayment-Platform-for-Decentralized-AI-Services-DeAI-/

Required repository setting:

- GitHub repository `Settings > Pages > Build and deployment > Source`: `GitHub Actions`

## Useful commands

```bash
# Development
npm run dev                              # Watch mode
npm run dev:sim                          # Monorepo dev with local settlement simulation
npm run dev:real                         # Monorepo dev with real settlement only
npm run lint                             # TypeScript check
npm run build                            # Build for production

# Testing
npm run test                             # All tests
npm run test --workspace services/gateway  # Gateway tests (47)
npm run test:e2e:web                    # E2E web tests
npm run test:contracts:soroban          # Soroban contracts

# Smoke tests
npm run smoke:inference:upstream         # Validate with real Gemini API
npm run smoke:inference:upstream:ci      # CI smoke with mock Gemini
npm run smoke:gateway                    # Gateway health check
npm run smoke:web:ci                     # Web E2E via CI

# Production validation
npm run validate:gateway:production      # Preflight config check
npm run verify:all                       # Full CI suite

# Database
npm run db:migrate --workspace services/gateway   # Run migrations
npm run db:studio --workspace services/gateway    # Prisma Studio UI
```

## Soroban contracts

```bash
cd contracts/soroban
cargo test
```

Automated testnet deployment:

```bash
# one-time prereqs:
cargo install --locked soroban-cli
rustup target add wasm32-unknown-unknown

# identity used to sign deployments:
soroban keys generate axon-admin --network testnet

# deploy + init marketplace and payment_router
npm run deploy:soroban:testnet
```

Optional deploy variables:

- `SOROBAN_IDENTITY` (default: `axon-admin`)
- `SOROBAN_NETWORK` (default: `testnet`)
- `PLATFORM_FEE_BPS` (default: `500`)

## Current testnet deployment (2026-04-13)

- Network: `testnet`
- Admin: `GC5LQLM7IOEC7IDE27CXOS2SH4ZXXNN7NJS3BJOZKAFSPAC2PZ34J4XX`
- Marketplace Contract: `CA6C6IHDT2BDOSWFGQAOEF3SX4ZOC3MCKNCCUU44P2XLQMV7QF25TG2N`
- Payment Router Contract: `CDYSQ5H5L55ONJJ24FZMF25Z45J3HAIRI4PIDVJS6RCQNWWK2JH7DWJC`

Deployment transactions:

- Marketplace deploy tx: `70640b244a108d60f6bfd70f0478631d5053551b7d32f4ac032d7073d601a26e`
- Payment Router deploy tx: `78a611f708b77bc11c16711751d202e24c597e6a93f5afb316f8c11ee54cc66a`
- Marketplace init tx: `c1f481ce516582a8bdcfe9e622b8d7872d95e90dd86e9d9627e9c825fa92a803`
- Payment Router init tx: `c243d06fc21803a368a9c6e09bfa2c38a0f2f69ae039d32bb7a60f5f73e653c7`

Explorer links:

- https://stellar.expert/explorer/testnet/tx/70640b244a108d60f6bfd70f0478631d5053551b7d32f4ac032d7073d601a26e
- https://stellar.expert/explorer/testnet/tx/78a611f708b77bc11c16711751d202e24c597e6a93f5afb316f8c11ee54cc66a
- https://stellar.expert/explorer/testnet/tx/c1f481ce516582a8bdcfe9e622b8d7872d95e90dd86e9d9627e9c825fa92a803
- https://stellar.expert/explorer/testnet/tx/c243d06fc21803a368a9c6e09bfa2c38a0f2f69ae039d32bb7a60f5f73e653c7
- https://stellar.expert/explorer/testnet/tx/87e4e57e08c3d5d0a329b1afc60062aa01571160a126c5dcb462a9e45b29b95b

Recommended local gateway config (`services/gateway/.env.local`):

```env
SOROBAN_IDENTITY="axon-admin"
SOROBAN_NETWORK="testnet"
ENABLE_SOROBAN_SETTLEMENT="true"
ENFORCE_CONSUMER_AUTH_ONCHAIN="false"
MARKETPLACE_CONTRACT_ID="CA6C6IHDT2BDOSWFGQAOEF3SX4ZOC3MCKNCCUU44P2XLQMV7QF25TG2N"
PAYMENT_ROUTER_CONTRACT_ID="CDYSQ5H5L55ONJJ24FZMF25Z45J3HAIRI4PIDVJS6RCQNWWK2JH7DWJC"
```

Optional frontend config for contract display and tx polling:

```env
NEXT_PUBLIC_PAYMENT_ROUTER_CONTRACT_ID="CDYSQ5H5L55ONJJ24FZMF25Z45J3HAIRI4PIDVJS6RCQNWWK2JH7DWJC"
# enabled by default; set false to disable explicitly
NEXT_PUBLIC_ENABLE_TX_STATUS_LOOKUP=true
NEXT_PUBLIC_TX_STATUS_POLL_INTERVAL_MS=2500
NEXT_PUBLIC_TX_STATUS_MAX_POLLS=6
```

Backend tx lookup config (recommended):

```env
ENABLE_TX_STATUS_LOOKUP=true
HORIZON_URL="https://horizon-testnet.stellar.org"
```

With this setup, the frontend calls `GET /payments/tx/:txHash` on the gateway instead of querying Horizon directly.

Production gateway reference profile:

- [services/gateway/.env.production.example](services/gateway/.env.production.example)
- [Facilitator production guide](docs/FACILITATOR-PRODUCTION.md)
- [Operations runbook](docs/OPERATIONS-RUNBOOK.md)
- [Soroban mainnet runbook](docs/SOROBAN-MAINNET-RUNBOOK.md)
- `npm run validate:gateway:production`

It includes strict on-chain auth, facilitator required mode, relayer metadata wiring, and more conservative retry settings for production operators.

The gateway now fails fast on startup if required facilitator production variables are incomplete.
Operational metrics are available at `GET /ops/metrics` for dashboarding and alert routing.
The production preflight also validates inference safety (`INFERENCE_FALLBACK_MODE=disabled` + upstream settings).

## Implemented MVP flow

1. Provider registers an AI model through the gateway.
2. Consumer loads marketplace models in the frontend.
3. Consumer requests inference and payment authorization.
4. Gateway validates payment and computes split (optional on-chain quote).
5. Gateway may execute on-chain settlement through `PaymentRouterContract` when enabled.
6. Frontend requests inference and displays payment timeline + operation status.

Payment history persists `createdAt`, `updatedAt`, `txStatus`, and `txStatusUpdatedAt`, so UI state survives page refresh.

## Test coverage snapshot

- Gateway tests cover payment/inference/http behavior, including `GET /payments/tx/:txHash`.
- Web E2E currently validates 6 scenarios:
  - paid inference flow
  - tx transition in operation card (`Submitted` -> `Confirmed`)
  - local settlement summary in operation card
  - payment rejection error
  - missing-model inference error
  - gateway-unavailable model publish error

## Production next steps

- Integrate dedicated production AI services as upstream inference providers.
