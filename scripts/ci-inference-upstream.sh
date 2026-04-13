#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

gateway_log_file="$(mktemp)"
upstream_log_file="$(mktemp)"
gateway_data_file="$(mktemp)"
mock_server_file="$(mktemp --suffix=.mjs)"
gateway_pid=""
upstream_pid=""

cleanup() {
  if [[ -n "$gateway_pid" ]] && kill -0 "$gateway_pid" 2>/dev/null; then
    kill "$gateway_pid" || true
    wait "$gateway_pid" 2>/dev/null || true
  fi

  if [[ -n "$upstream_pid" ]] && kill -0 "$upstream_pid" 2>/dev/null; then
    kill "$upstream_pid" || true
    wait "$upstream_pid" 2>/dev/null || true
  fi

  rm -f "$gateway_log_file" "$upstream_log_file" "$gateway_data_file" "$mock_server_file"
}

trap cleanup EXIT

cat > "$mock_server_file" <<'EOF'
import { createServer } from "node:http";

const server = createServer((req, res) => {
  if (req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      process.stdout.write(`mock-upstream-request:${req.method} ${req.url}\n`);
      const parsed = JSON.parse(body || "{}");
      const content = parsed?.contents?.[0]?.parts?.[0]?.text ?? "no prompt";

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: `mock gemini ok: ${String(content).slice(0, 80)}` }]
              }
            }
          ]
        })
      );
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
});

server.listen(9099, "127.0.0.1", () => {
  process.stdout.write("mock-upstream-ready\n");
});
EOF

echo "[ci-upstream] starting mock upstream server"
node "$mock_server_file" >"$upstream_log_file" 2>&1 &
upstream_pid="$!"

for _ in {1..20}; do
  if grep -q "mock-upstream-ready" "$upstream_log_file"; then
    break
  fi
  sleep 0.5
done

if ! grep -q "mock-upstream-ready" "$upstream_log_file"; then
  echo "Mock upstream was not ready in time. Logs:"
  cat "$upstream_log_file"
  exit 1
fi

echo "[ci-upstream] waiting for mock upstream endpoint"
if ! curl -sS --retry 20 --retry-delay 1 --retry-connrefused "http://127.0.0.1:9099/v1beta/models/gemini-2.0-flash:generateContent" >/dev/null 2>/dev/null; then
  echo "Mock upstream endpoint unavailable. Logs:"
  cat "$upstream_log_file"
  exit 1
fi

echo "[ci-upstream] starting gateway with strict upstream mode"
INFERENCE_PROVIDER="gemini" \
INFERENCE_UPSTREAM_URL="http://127.0.0.1:9099/v1beta/models/gemini-2.0-flash:generateContent" \
INFERENCE_UPSTREAM_API_KEY="smoke-gemini-key" \
INFERENCE_UPSTREAM_MODEL="gemini-2.0-flash" \
INFERENCE_FALLBACK_MODE="disabled" \
AXON_GATEWAY_DATA_FILE="$gateway_data_file" \
npm run dev --workspace services/gateway >"$gateway_log_file" 2>&1 &
gateway_pid="$!"

echo "[ci-upstream] waiting for gateway readiness"
if ! curl -fsS --retry 40 --retry-delay 1 --retry-connrefused "http://localhost:8080/health" >/dev/null 2>/dev/null; then
  echo "Gateway was not ready in time. Logs:"
  cat "$gateway_log_file"
  exit 1
fi

echo "[ci-upstream] running upstream smoke"
if ! INFERENCE_PROVIDER="gemini" \
  INFERENCE_UPSTREAM_URL="http://127.0.0.1:9099/v1beta/models/gemini-2.0-flash:generateContent" \
  INFERENCE_UPSTREAM_API_KEY="smoke-gemini-key" \
  INFERENCE_UPSTREAM_MODEL="gemini-2.0-flash" \
  INFERENCE_FALLBACK_MODE="disabled" \
  npm run smoke:inference:upstream; then
  echo "[ci-upstream] smoke failed. Gateway logs:"
  cat "$gateway_log_file"
  echo "[ci-upstream] logs mock upstream:"
  cat "$upstream_log_file"
  exit 1
fi

echo "[ci-upstream] ok"
