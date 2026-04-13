## Complete Architecture: Decentralized AI Micropayments Platform (DeAI)

### Implementation and deployment status (2026-04-13)

- Active network: Stellar testnet
- Deployed contracts:
  - Marketplace: `CA6C6IHDT2BDOSWFGQAOEF3SX4ZOC3MCKNCCUU44P2XLQMV7QF25TG2N`
  - Payment Router: `CDYSQ5H5L55ONJJ24FZMF25Z45J3HAIRI4PIDVJS6RCQNWWK2JH7DWJC`
- Deployment admin: `GC5LQLM7IOEC7IDE27CXOS2SH4ZXXNN7NJS3BJOZKAFSPAC2PZ34J4XX`
- Deployment transactions:
  - Marketplace deploy tx: `70640b244a108d60f6bfd70f0478631d5053551b7d32f4ac032d7073d601a26e`
  - Payment Router deploy tx: `78a611f708b77bc11c16711751d202e24c597e6a93f5afb316f8c11ee54cc66a`
  - Marketplace init tx: `c1f481ce516582a8bdcfe9e622b8d7872d95e90dd86e9d9627e9c825fa92a803`
  - Payment Router init tx: `c243d06fc21803a368a9c6e09bfa2c38a0f2f69ae039d32bb7a60f5f73e653c7`
- Explorer links:
  - https://stellar.expert/explorer/testnet/tx/70640b244a108d60f6bfd70f0478631d5053551b7d32f4ac032d7073d601a26e
  - https://stellar.expert/explorer/testnet/tx/78a611f708b77bc11c16711751d202e24c597e6a93f5afb316f8c11ee54cc66a
  - https://stellar.expert/explorer/testnet/tx/c1f481ce516582a8bdcfe9e622b8d7872d95e90dd86e9d9627e9c825fa92a803
  - https://stellar.expert/explorer/testnet/tx/c243d06fc21803a368a9c6e09bfa2c38a0f2f69ae039d32bb7a60f5f73e653c7
- Gateway capabilities:
  - Optional on-chain `quote_split` with explicit failure handling
  - Optional on-chain `settle` with layered backend strategy
  - Transaction status endpoint and DB persistence (`submitted`, `confirmed`, `failed`)
- Persistence: Prisma ORM (SQLite in dev, PostgreSQL-ready for production)
- Current web validation: Playwright E2E `6/6` passing

## 1. Solution overview

The DeAI platform is a decentralized marketplace where AI providers publish models as services and consumers (users or agents) pay per-use for inference. Stellar + Soroban provide settlement and contract logic, while an off-chain gateway handles API orchestration, X402 validation, and integration with AI workloads.

Primary goal: democratize AI model monetization with low-friction micropayments and production-oriented observability.

## 2. Architecture components

### 2.1 On-chain layer (Stellar/Soroban)

- Stellar Network as L1 execution and settlement layer
- Soroban contracts:
  - `MarketplaceContract`: model registration and catalog metadata
  - `PaymentRouterContract`: split quote and settlement path
- Optional account abstraction and advanced agent account flows (future)

### 2.2 Off-chain layer (Gateway + AI services)

- Fastify gateway responsibilities:
  - model CRUD and catalog serving
  - payment authorization
  - optional on-chain quote and settle invocation
  - tx status lookup against Horizon through gateway endpoint
  - persistence of payment timeline and tx state via Prisma
- AI inference execution:
  - upstream inference call when configured
  - local fallback response when upstream is unavailable

### 2.3 Frontend layer (Next.js dApp)

- Publish model flow
- Paid inference flow
- Payment history and operation card summary
- Consolidated tx state UI:
  - `On-chain` vs `Fallback`
  - `Submitted`, `Confirmed`, `Failed`, `Fallback`
  - explorer links and contract badge when available

## 3. Key runtime flow

1. Provider publishes model via `POST /models`.
2. Consumer chooses model in web app.
3. Frontend requests `POST /payments/authorize`.
4. Gateway validates model and computes split (on-chain quote optional).
5. Gateway optionally executes on-chain settlement.
6. Frontend calls `POST /inference` with X402 header.
7. Frontend tracks tx state via `GET /payments/tx/:txHash`.
8. Gateway persists final tx state and serves durable payment history.

## 4. Testing strategy (current)

- Smart contracts: `cargo test` in Soroban workspace
- Gateway: Vitest + HTTP tests (payment, inference, tx status)
- Frontend: Playwright E2E covering
  - successful paid inference
  - tx transition in operation card (`Submitted` -> `Confirmed`)
  - fallback operation summary
  - payment rejection
  - missing-model inference error
  - gateway unavailability path

## 5. DevOps and delivery

- Monorepo orchestration through npm workspaces
- CI scripts in `scripts/` for gateway/web full checks
- Automated Soroban deploy script for testnet
- Environment profiles for local dev and testnet integrations

## 6. Production roadmap

- Integrate OpenZeppelin facilitator flow for full X402 mediation
- Add real Stellar wallet authentication to frontend
- Enforce on-chain consumer auth in production profile
- Replace local mock fallback with dedicated production inference services
- Extend observability with metrics, alerting, and retry controls

## 7. Operational notes

- Frontend tx polling is enabled by default and can be disabled explicitly.
- Backend tx status lookup remains controllable through environment flags.
- All docs and examples are aligned with current deployed contract IDs and tested behavior.
