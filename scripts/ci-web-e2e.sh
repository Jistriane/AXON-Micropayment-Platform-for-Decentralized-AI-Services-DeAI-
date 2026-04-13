#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

gateway_log="$(mktemp)"
web_log="$(mktemp)"
gateway_data_file="$(mktemp)"
gateway_pid=""
web_pid=""

cleanup() {
  if [[ -n "$web_pid" ]] && kill -0 "$web_pid" 2>/dev/null; then
    kill "$web_pid" || true
    wait "$web_pid" 2>/dev/null || true
  fi

  if [[ -n "$gateway_pid" ]] && kill -0 "$gateway_pid" 2>/dev/null; then
    kill "$gateway_pid" || true
    wait "$gateway_pid" 2>/dev/null || true
  fi

  rm -f "$gateway_log" "$web_log" "$gateway_data_file"
}

trap cleanup EXIT

pkill -f "tsx watch src/index.ts" >/dev/null 2>&1 || true
pkill -f "next dev -p 3000" >/dev/null 2>&1 || true
pkill -f "npm run dev --workspace services/gateway" >/dev/null 2>&1 || true
pkill -f "npm run dev --workspace apps/web" >/dev/null 2>&1 || true

if command -v fuser >/dev/null 2>&1; then
  fuser -k 3000/tcp 8080/tcp >/dev/null 2>&1 || true
elif command -v lsof >/dev/null 2>&1; then
  pids="$(lsof -ti tcp:3000 -ti tcp:8080 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    kill $pids >/dev/null 2>&1 || true
  fi
fi

echo "[ci-web] starting gateway"
AXON_GATEWAY_DATA_FILE="$gateway_data_file" npm run dev --workspace services/gateway >"$gateway_log" 2>&1 &
gateway_pid="$!"

echo "[ci-web] waiting gateway readiness"
if ! curl -fsS --retry 40 --retry-delay 1 --retry-connrefused "http://localhost:8080/health" >/dev/null 2>/dev/null; then
  echo "Gateway was not ready in time. Logs:"
  cat "$gateway_log"
  exit 1
fi

echo "[ci-web] starting web"
NEXT_PUBLIC_GATEWAY_URL="http://127.0.0.1:8080" npm run dev --workspace apps/web >"$web_log" 2>&1 &
web_pid="$!"

echo "[ci-web] waiting web readiness"
if ! curl -fsS --retry 60 --retry-delay 1 --retry-connrefused "http://localhost:3000" >/dev/null 2>/dev/null; then
  echo "Web was not ready in time. Logs:"
  cat "$web_log"
  exit 1
fi

tmp_html="$(mktemp)"
trap 'rm -f "$tmp_html"; cleanup' EXIT

curl -fsS "http://localhost:3000" >"$tmp_html"

echo "[ci-web] validating homepage content"
if ! grep -q "Micropayments for decentralized AI services" "$tmp_html"; then
  echo "Expected homepage content not found."
  cat "$tmp_html"
  exit 1
fi

echo "[ci-web] validating logo route"
if ! curl -fsS "http://localhost:3000/Logo.png" >/dev/null; then
  echo "Logo not accessible through frontend"
  exit 1
fi

echo "[ci-web] ok"
