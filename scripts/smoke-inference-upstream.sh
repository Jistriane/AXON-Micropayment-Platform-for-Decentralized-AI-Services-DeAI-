#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-http://localhost:8080}"
expected_token="${X402_EXPECTED_TOKEN:-dev-x402-token}"
inference_provider="${INFERENCE_PROVIDER:-generic}"
inference_fallback_mode="${INFERENCE_FALLBACK_MODE:-mock}"
inference_upstream_url="${INFERENCE_UPSTREAM_URL:-}"
inference_upstream_api_key="${INFERENCE_UPSTREAM_API_KEY:-}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

models_json="$tmp_dir/models.json"
inference_json="$tmp_dir/inference.json"

if [[ "$inference_fallback_mode" != "disabled" ]]; then
  echo "[smoke-upstream] INFERENCE_FALLBACK_MODE must be 'disabled' to validate real upstream"
  exit 1
fi

if [[ -z "$inference_upstream_url" ]]; then
  echo "[smoke-upstream] INFERENCE_UPSTREAM_URL is not configured"
  exit 1
fi

if [[ "$inference_provider" != "generic" && -z "$inference_upstream_api_key" ]]; then
  echo "[smoke-upstream] INFERENCE_UPSTREAM_API_KEY is required when INFERENCE_PROVIDER=$inference_provider"
  exit 1
fi

echo "[smoke-upstream] health"
curl -sS "$base_url/health" | grep -q '"status":"ok"'

echo "[smoke-upstream] model list"
curl -sS "$base_url/models" > "$models_json"

model_id="$(sed -n 's/.*"id":"\([^"]*\)".*/\1/p' "$models_json" | head -n1)"

if [[ -z "$model_id" ]]; then
  echo "[smoke-upstream] no model available for testing"
  cat "$models_json"
  exit 1
fi

echo "[smoke-upstream] inference upstream"
status_code=$(curl -sS -o "$inference_json" -w "%{http_code}" \
  -X POST "$base_url/inference" \
  -H "Content-Type: application/json" \
  -H "x-402-token: $expected_token" \
  -d "{\"modelId\":\"$model_id\",\"prompt\":\"upstream smoke: explain decentralized AI micropayments\"}")

if [[ "$status_code" != "200" ]]; then
  echo "[smoke-upstream] expected 200, got $status_code"
  cat "$inference_json"
  exit 1
fi

grep -q '"paid":true' "$inference_json"

echo "[smoke-upstream] ok"
