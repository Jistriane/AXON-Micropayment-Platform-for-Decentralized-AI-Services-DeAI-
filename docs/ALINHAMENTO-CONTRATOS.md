# Contract Alignment (Updated)

## Real state on 2026-04-13

### Testnet deployment completed

- Network: `testnet`
- Admin: `GC5LQLM7IOEC7IDE27CXOS2SH4ZXXNN7NJS3BJOZKAFSPAC2PZ34J4XX`
- Marketplace Contract: `CA6C6IHDT2BDOSWFGQAOEF3SX4ZOC3MCKNCCUU44P2XLQMV7QF25TG2N`
- Payment Router Contract: `CDYSQ5H5L55ONJJ24FZMF25Z45J3HAIRI4PIDVJS6RCQNWWK2JH7DWJC`

Transactions:

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

## Planned vs current

| Item | Current status | Notes |
|---|---|---|
| Marketplace Soroban | Implemented and deployed | Model registry/query/activation |
| Payment Router Soroban | Implemented and deployed | `quote_split` and `settle` available |
| Gateway `quote_split` on-chain | Implemented | Local fallback on errors |
| Gateway `settle` on-chain | Implemented (optional) | Controlled by `ENABLE_SOROBAN_SETTLEMENT` |
| Tx status API | Implemented | `GET /payments/tx/:txHash` with persistence |
| Relational persistence | Implemented | Prisma (SQLite dev, Postgres prod) |
| OpenZeppelin X402 facilitator | Not implemented | Production gap |
| Real wallet in frontend | Implemented (Freighter integration) | Includes connection checks, signature path, and UX fallbacks |

## Gateway on-chain configuration

Relevant variables:

- `MARKETPLACE_CONTRACT_ID`
- `PAYMENT_ROUTER_CONTRACT_ID`
- `SOROBAN_IDENTITY`
- `SOROBAN_NETWORK`
- `ENABLE_SOROBAN_SETTLEMENT`
- `ENFORCE_CONSUMER_AUTH_ONCHAIN`

Local active configuration:

```env
SOROBAN_IDENTITY="axon-admin"
SOROBAN_NETWORK="testnet"
ENABLE_SOROBAN_SETTLEMENT="true"
ENFORCE_CONSUMER_AUTH_ONCHAIN="false"
MARKETPLACE_CONTRACT_ID="CA6C6IHDT2BDOSWFGQAOEF3SX4ZOC3MCKNCCUU44P2XLQMV7QF25TG2N"
PAYMENT_ROUTER_CONTRACT_ID="CDYSQ5H5L55ONJJ24FZMF25Z45J3HAIRI4PIDVJS6RCQNWWK2JH7DWJC"
```

## Frontend and transaction observability

- Operation card shows latest payment summary with:
  - `On-chain` or `Local`
  - tx state (`Submitted`, `Confirmed`, `Failed`, `Local`)
  - explorer link for on-chain tx
  - short contract badge (when configured)
- `NEXT_PUBLIC_ENABLE_TX_STATUS_LOOKUP` is enabled by default and only disabled when explicitly set to `false`.
- E2E suite validates polling behavior and tx state transition in browser runtime.

## Production risks and pending items

1. `ENFORCE_CONSUMER_AUTH_ONCHAIN` must be enabled with real wallet auth.
2. Integrate X402 facilitator for full mediated payment path.
3. Bind X402 proof to `paymentRef` and on-chain tx evidence.
4. Add stronger on-chain error observability (metrics and retry policies).

## Conclusion

Contracts are aligned with the current implementation and fully functional on Stellar testnet. The gateway already supports optional on-chain quote + settle with fallback protection for MVP reliability. Remaining gaps are wallet authentication and full facilitator-based X402 integration for production.
