# Facilitator Production Guide

Last update: 2026-04-12

This guide describes how to prepare the gateway for a production facilitator / relayer deployment.

## Scope

This is the production wiring for the gateway's optional facilitator settlement path. It is intended for an OpenZeppelin-style relayer or equivalent mediated settlement service.

It covers:

- required environment variables
- policy and contract metadata wiring
- fail-fast behavior
- operational validation before launch

## Recommended runtime modes

- `FACILITATOR_MODE=optional`:
  - facilitator is used when available
  - gateway falls back to Soroban/local settlement when unavailable
- `FACILITATOR_MODE=required`:
  - facilitator is mandatory
  - gateway fails fast if facilitator settings are missing or settlement cannot be obtained
- `ENABLE_FACILITATOR_SETTLEMENT=false`:
  - disables the facilitator path entirely

## Required variables for production mode

Set these variables when `FACILITATOR_MODE=required`:

```env
ENABLE_FACILITATOR_SETTLEMENT=true
FACILITATOR_MODE=required
FACILITATOR_URL=https://facilitator.example/settle
FACILITATOR_API_KEY=<production-secret>
FACILITATOR_TIMEOUT_MS=5000
FACILITATOR_MAX_ATTEMPTS=3
FACILITATOR_RELAYER_ID=openzeppelin-relayer
FACILITATOR_POLICY_ID=production-policy
FACILITATOR_PROVIDER_CONTRACT_ID=CA6C6IHDT2BDOSWFGQAOEF3SX4ZOC3MCKNCCUU44P2XLQMV7QF25TG2N
FACILITATOR_NETWORK=testnet
ENFORCE_CONSUMER_AUTH_ONCHAIN=true
```

Also keep the existing gateway contracts and settlement variables aligned:

```env
SOROBAN_IDENTITY=axon-admin
SOROBAN_NETWORK=testnet
ENABLE_SOROBAN_SETTLEMENT=true
MARKETPLACE_CONTRACT_ID=CA6C6IHDT2BDOSWFGQAOEF3SX4ZOC3MCKNCCUU44P2XLQMV7QF25TG2N
PAYMENT_ROUTER_CONTRACT_ID=CDYSQ5H5L55ONJJ24FZMF25Z45J3HAIRI4PIDVJS6RCQNWWK2JH7DWJC
```

## Boot validation behavior

The gateway now fails fast during startup when `FACILITATOR_MODE=required` and the facilitator profile is incomplete.

Validation checks include:

- facilitator settlement enabled
- facilitator URL present
- relayer ID present
- policy ID present
- provider contract ID present
- facilitator network present

## Request payload wiring

The gateway sends the following metadata to the facilitator endpoint:

- `paymentRef`
- `amountMicrounit`
- `callerAddress`
- `providerAddress`
- `paymentProof`
- `relayerId`
- `policyId`
- `providerContractId`
- `network`

## Pre-launch checklist

1. Confirm the facilitator endpoint is reachable from the gateway network.
2. Confirm the API key is stored in the secret manager and not committed.
3. Confirm the relayer ID and policy ID match the facilitator provider configuration.
4. Confirm `providerContractId` matches the active `payment_router` contract.
5. Confirm `FACILITATOR_MODE=required` only after a full dry run in staging.
6. Confirm layered settlement behavior in `optional` mode for non-production environments.

## Validation command

Run the following command before starting the gateway in production:

```bash
npm run validate:gateway:production
```

This command exits non-zero if the required facilitator production profile is incomplete.

## Suggested rollout order

1. Staging with `FACILITATOR_MODE=optional`.
2. Staging with `FACILITATOR_MODE=required`.
3. Production with `FACILITATOR_MODE=required` after successful dry runs and operator sign-off.

## Failure handling

If the facilitator is required and settlement is unavailable, the gateway returns a hard failure instead of silently falling back. This prevents production from drifting into an unsupported settlement path.
