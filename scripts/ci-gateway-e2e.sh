#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

log_file="$(mktemp)"
gateway_data_file="$(mktemp)"
gateway_pid=""

cleanup() {
  if [[ -n "$gateway_pid" ]] && kill -0 "$gateway_pid" 2>/dev/null; then
    kill "$gateway_pid" || true
    wait "$gateway_pid" 2>/dev/null || true
  fi
  rm -f "$log_file" "$gateway_data_file"
}

trap cleanup EXIT

pkill -f "tsx watch src/index.ts" >/dev/null 2>&1 || true
pkill -f "npm run dev --workspace services/gateway" >/dev/null 2>&1 || true

if command -v fuser >/dev/null 2>&1; then
  fuser -k 8080/tcp >/dev/null 2>&1 || true
elif command -v lsof >/dev/null 2>&1; then
  pids="$(lsof -ti tcp:8080 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    kill $pids >/dev/null 2>&1 || true
  fi
fi

echo "[ci-e2e] starting gateway"
INFERENCE_PROVIDER="generic" \
INFERENCE_FALLBACK_MODE="mock" \
ENABLE_SOROBAN_SETTLEMENT="false" \
ENABLE_FACILITATOR_SETTLEMENT="false" \
NODE_ENV="test" \
AXON_GATEWAY_DATA_FILE="$gateway_data_file" \
npm run dev --workspace services/gateway >"$log_file" 2>&1 &
gateway_pid="$!"

echo "[ci-e2e] waiting for gateway readiness"
if ! curl -fsS --retry 40 --retry-delay 1 --retry-connrefused "http://localhost:8080/health" >/dev/null 2>/dev/null; then
  echo "Gateway was not ready in time. Logs:"
  cat "$log_file"
  exit 1
fi

echo "[ci-e2e] running smoke"
if ! npm run smoke:gateway; then
  echo "[ci-e2e] smoke failed. Gateway logs:"
  cat "$log_file"
  exit 1
fi

echo "[ci-e2e] ok"