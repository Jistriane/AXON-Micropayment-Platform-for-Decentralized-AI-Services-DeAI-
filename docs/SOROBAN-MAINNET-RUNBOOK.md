# Soroban Mainnet Deployment Runbook

This runbook defines a safer process for deploying `marketplace` and `payment_router` to Stellar mainnet.

## Scope

Use this guide for:

- first-time mainnet deployment
- contract re-deployments with explicit change control
- post-deploy gateway configuration updates

## 1) Preconditions

Required tooling:

- `cargo`
- `rustup`
- `soroban` CLI
- `wasm32-unknown-unknown` Rust target

Validate local toolchain:

```bash
cargo --version
rustup --version
soroban --version
rustup target list --installed | grep wasm32-unknown-unknown
```

## 2) Operational safety before deploy

1. Freeze changes to contract code during the deployment window.
2. Confirm backup of gateway database and current env files.
3. Confirm the current production release can be rolled back.
4. Confirm signer identity ownership and key custody policy.

## 3) Configure identity and network

Set deployment identity and network:

```bash
export SOROBAN_NETWORK=mainnet
export SOROBAN_IDENTITY=axon-mainnet-admin
```

If identity does not exist locally, generate/import it using your secure key flow:

```bash
soroban keys generate "$SOROBAN_IDENTITY" --network "$SOROBAN_NETWORK"
```

Network defaults for `mainnet` are already supported by the deploy script:

- RPC URL: `https://mainnet.sorobanrpc.com`
- Passphrase: `Public Global Stellar Network ; September 2015`

For custom providers, override:

```bash
export SOROBAN_RPC_URL="https://your-mainnet-rpc.example"
export SOROBAN_NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"
```

## 4) Dry run on testnet (recommended)

Before touching mainnet, validate the same release on testnet:

```bash
export SOROBAN_NETWORK=testnet
npm run deploy:soroban:testnet
```

Capture output contract IDs and verify `init` transactions.

## 5) Mainnet deploy

Run deployment with mainnet network selection:

```bash
export SOROBAN_NETWORK=mainnet
export SOROBAN_IDENTITY=axon-mainnet-admin
export PLATFORM_FEE_BPS=500
npm run deploy:soroban:testnet
```

Despite the npm script name, behavior is controlled by `SOROBAN_NETWORK`.

Expected output includes:

- `MARKETPLACE_CONTRACT_ID`
- `PAYMENT_ROUTER_CONTRACT_ID`
- `ADMIN_ADDRESS`

## 6) Post-deploy verification

1. Confirm both contracts are deployed and initialized.
2. Run contract tests locally:

```bash
npm run test:contracts:soroban
```

3. Update gateway production env:

```env
MARKETPLACE_CONTRACT_ID=<mainnet_marketplace_id>
PAYMENT_ROUTER_CONTRACT_ID=<mainnet_payment_router_id>
SOROBAN_NETWORK=mainnet
ENFORCE_CONSUMER_AUTH_ONCHAIN=true
```

4. Run gateway preflight:

```bash
npm run validate:gateway:production
```

5. Validate critical API paths in a staging-like environment before routing full traffic.

## 7) Rollback strategy

If deployment verification fails:

1. Keep gateway pinned to previous contract IDs.
2. Revert environment variables to last known-good values.
3. Re-run preflight and health checks.
4. Open incident log and capture failing transaction hashes.

## 8) Change log requirements

For each deployment, record:

- deployment date/time (UTC)
- operator identity
- contract commit hash
- output contract IDs
- init transaction hashes
- gateway config change reference
