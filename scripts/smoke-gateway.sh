#!/usr/bin/env bash
set -euo pipefail

base_url="${1:-http://localhost:8080}"
expected_token="${X402_EXPECTED_TOKEN:-dev-x402-token}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

models_json="$tmp_dir/models.json"
create_json="$tmp_dir/create_model.json"
auth_json="$tmp_dir/auth.json"
inference_json="$tmp_dir/inference.json"

echo "[smoke] health"
curl -sS "$base_url/health" | grep -q '"status":"ok"'

echo "[smoke] models"
curl -sS "$base_url/models" > "$models_json"
grep -q '\[' "$models_json"

echo "[smoke] create model"
curl -sS -X POST "$base_url/models" \
  -H "Content-Type: application/json" \
  -d '{"providerAddress":"GSMOKETESTPROVIDER12345","name":"Smoke Model","description":"Model for gateway e2e validation","endpoint":"/inference","priceMicrounit":25000}' > "$create_json"

model_id="$(sed -n 's/.*"id":"\([^"]*\)".*/\1/p' "$create_json" | head -n1)"
payment_ref="smoke-pay-$(date +%s%N)"

if [[ -z "$model_id" ]]; then
  echo "Failed to extract model_id from /models response"
  cat "$create_json"
  exit 1
fi

echo "[smoke] inference payment required"
status_code=$(curl -sS -o "$inference_json" -w "%{http_code}" \
  -X POST "$base_url/inference" \
  -H "Content-Type: application/json" \
  -d "{\"modelId\":\"$model_id\",\"prompt\":\"hello\"}")

if [[ "$status_code" != "402" ]]; then
  echo "Expected 402, got $status_code"
  exit 1
fi

echo "[smoke] authorize payment"
curl -sS -X POST "$base_url/payments/authorize" \
  -H "Content-Type: application/json" \
  -d "{\"modelId\":\"$model_id\",\"callerAddress\":\"GSMOKETESTCALLER12345\",\"amountMicrounit\":25000,\"paymentRef\":\"$payment_ref\"}" > "$auth_json"

grep -q '"success":true' "$auth_json"

echo "[smoke] inference authorized"
status_code=$(curl -sS -o "$inference_json" -w "%{http_code}" \
  -X POST "$base_url/inference" \
  -H "Content-Type: application/json" \
  -H "X-402-token: $expected_token" \
  -d "{\"modelId\":\"$model_id\",\"prompt\":\"explain micropayments\"}")

if [[ "$status_code" != "200" ]]; then
  echo "Expected 200, got $status_code"
  cat "$inference_json"
  exit 1
fi

grep -q '"paid":true' "$inference_json"

echo "[smoke] ok"
