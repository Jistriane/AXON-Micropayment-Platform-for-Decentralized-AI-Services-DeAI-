# AXON MVP Architecture

## Current status (2026-04-13)

- Soroban contracts deployed on testnet:
  - `marketplace`: `CA6C6IHDT2BDOSWFGQAOEF3SX4ZOC3MCKNCCUU44P2XLQMV7QF25TG2N`
  - `payment_router`: `CDYSQ5H5L55ONJJ24FZMF25Z45J3HAIRI4PIDVJS6RCQNWWK2JH7DWJC`
- Deployment admin: `GC5LQLM7IOEC7IDE27CXOS2SH4ZXXNN7NJS3BJOZKAFSPAC2PZ34J4XX`
- Latest deployment tx hashes:
  - marketplace deploy: `70640b244a108d60f6bfd70f0478631d5053551b7d32f4ac032d7073d601a26e`
  - payment_router deploy: `78a611f708b77bc11c16711751d202e24c597e6a93f5afb316f8c11ee54cc66a`
  - marketplace init: `c1f481ce516582a8bdcfe9e622b8d7872d95e90dd86e9d9627e9c825fa92a803`
  - payment_router init: `c243d06fc21803a368a9c6e09bfa2c38a0f2f69ae039d32bb7a60f5f73e653c7`
- Gateway supports:
  - optional on-chain split quote
- optional on-chain settlement with layered strategy (Facilitator → Soroban → fail explicitly)
- Transaction observability is implemented in gateway + frontend:
  - `GET /payments/tx/:txHash`
  - consolidated states: `submitted|confirmed|failed` (no fallback)
  - persisted history with tx status and timestamps

## Layers

- On-chain: Soroban contracts (`marketplace`, `payment_router`)
- Off-chain: Fastify gateway (catalog, authorization, inference)
- Frontend: Next.js app (model publish and paid inference flow)

## End-to-end flow

1. Provider publishes model via `POST /models`.
2. Consumer selects model in the web app.
3. Frontend calls `POST /payments/authorize`.
4. Gateway validates model and may compute split via `payment_router.quote_split`.
5. Gateway may execute `payment_router.settle` if `ENABLE_SOROBAN_SETTLEMENT=true`.
6. Frontend calls `POST /inference` with X402 header.
7. Frontend tracks tx state via `GET /payments/tx/:txHash`.
8. Gateway returns inference output and payment status data.

## MVP limitations

- No real wallet integration in frontend yet (address still sent in payload).
- OpenZeppelin X402 facilitator is not in the final runtime path yet.
- Inference has no fallback; returns 503 if upstream is unavailable.

## Current validation snapshot

- Web E2E: 6 scenarios passing.
- Includes tx state transition coverage in operation card (`Submitted` -> `Confirmed`).
- Web E2E: 6 scenarios passing, including strict failure modes (402 for payment, 503 for inference).

## Next phase priorities

- Integrate `x402-stellar` + OpenZeppelin facilitator.
- Integrate Stellar wallet connection flow.
- Enable `ENFORCE_CONSUMER_AUTH_ONCHAIN=true` for production profile.
- Bind `paymentRef` and X402 proof with on-chain tx verification.
