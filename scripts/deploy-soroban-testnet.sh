#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOROBAN_DIR="$ROOT_DIR/contracts/soroban"
TARGET_DIR="$SOROBAN_DIR/target/wasm32-unknown-unknown/release"

NETWORK_NAME="${SOROBAN_NETWORK:-testnet}"
IDENTITY_NAME="${SOROBAN_IDENTITY:-axon-admin}"
FEE_BPS="${PLATFORM_FEE_BPS:-500}"

case "$NETWORK_NAME" in
  testnet)
    SOROBAN_RPC_URL="${SOROBAN_RPC_URL:-https://soroban-testnet.stellar.org}"
    SOROBAN_NETWORK_PASSPHRASE="${SOROBAN_NETWORK_PASSPHRASE:-Test SDF Network ; September 2015}"
    ;;
  mainnet)
    SOROBAN_RPC_URL="${SOROBAN_RPC_URL:-https://mainnet.sorobanrpc.com}"
    SOROBAN_NETWORK_PASSPHRASE="${SOROBAN_NETWORK_PASSPHRASE:-Public Global Stellar Network ; September 2015}"
    ;;
  *)
    if [[ -z "${SOROBAN_RPC_URL:-}" || -z "${SOROBAN_NETWORK_PASSPHRASE:-}" ]]; then
      cat <<EOF >&2
Unsupported SOROBAN_NETWORK='${NETWORK_NAME}'.
Provide both:
  SOROBAN_RPC_URL
  SOROBAN_NETWORK_PASSPHRASE
EOF
      exit 1
    fi
    ;;
esac

log() {
  printf '[deploy-soroban] %s\n' "$1"
}

ensure_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  fi
}

ensure_cmd cargo
ensure_cmd soroban
ensure_cmd rustup

if ! rustup target list --installed | grep -q '^wasm32-unknown-unknown$'; then
  log "installing rust target wasm32-unknown-unknown"
  rustup target add wasm32-unknown-unknown
fi

if ! soroban network ls | grep -q "^${NETWORK_NAME}$"; then
  log "configuring ${NETWORK_NAME} network"
  soroban network add \
    --global \
    "$NETWORK_NAME" \
    --rpc-url "$SOROBAN_RPC_URL" \
    --network-passphrase "$SOROBAN_NETWORK_PASSPHRASE"
fi

if ! soroban keys ls | grep -q "^${IDENTITY_NAME}$"; then
  cat <<EOF >&2
Identity '${IDENTITY_NAME}' not found.
Create it first (or set SOROBAN_IDENTITY):
  soroban keys generate ${IDENTITY_NAME} --network ${NETWORK_NAME}
EOF
  exit 1
fi

ADMIN_ADDRESS="$(soroban keys address "$IDENTITY_NAME")"

log "building contracts"
(
  cd "$SOROBAN_DIR"
  cargo build --target wasm32-unknown-unknown --release
)

MARKETPLACE_WASM="$TARGET_DIR/marketplace.wasm"
PAYMENT_ROUTER_WASM="$TARGET_DIR/payment_router.wasm"
MARKETPLACE_OPT="$TARGET_DIR/marketplace.optimized.wasm"
PAYMENT_ROUTER_OPT="$TARGET_DIR/payment_router.optimized.wasm"

log "optimizing marketplace wasm"
soroban contract optimize --wasm "$MARKETPLACE_WASM" --wasm-out "$MARKETPLACE_OPT"

log "optimizing payment_router wasm"
soroban contract optimize --wasm "$PAYMENT_ROUTER_WASM" --wasm-out "$PAYMENT_ROUTER_OPT"

log "deploying marketplace"
MARKETPLACE_ID="$(soroban contract deploy --wasm "$MARKETPLACE_OPT" --source "$IDENTITY_NAME" --network "$NETWORK_NAME")"

log "deploying payment_router"
PAYMENT_ROUTER_ID="$(soroban contract deploy --wasm "$PAYMENT_ROUTER_OPT" --source "$IDENTITY_NAME" --network "$NETWORK_NAME")"

log "initializing marketplace"
soroban contract invoke \
  --id "$MARKETPLACE_ID" \
  --source "$IDENTITY_NAME" \
  --network "$NETWORK_NAME" \
  -- \
  init \
  --admin "$ADMIN_ADDRESS"

log "initializing payment_router"
soroban contract invoke \
  --id "$PAYMENT_ROUTER_ID" \
  --source "$IDENTITY_NAME" \
  --network "$NETWORK_NAME" \
  -- \
  init \
  --admin "$ADMIN_ADDRESS" \
  --fee_bps "$FEE_BPS"

cat <<EOF

Deployment complete.
NETWORK=${NETWORK_NAME}
ADMIN_ADDRESS=${ADMIN_ADDRESS}
MARKETPLACE_CONTRACT_ID=${MARKETPLACE_ID}
PAYMENT_ROUTER_CONTRACT_ID=${PAYMENT_ROUTER_ID}

Use these env vars in the gateway:
MARKETPLACE_CONTRACT_ID=${MARKETPLACE_ID}
PAYMENT_ROUTER_CONTRACT_ID=${PAYMENT_ROUTER_ID}
EOF
