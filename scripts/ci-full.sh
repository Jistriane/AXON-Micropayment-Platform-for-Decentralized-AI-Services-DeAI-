#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

echo "[ci-full] build"
npm run build

echo "[ci-full] lint"
npm run lint

echo "[ci-full] unit tests"
npm run test

echo "[ci-full] gateway smoke"
npm run smoke:gateway:ci

echo "[ci-full] inference upstream smoke"
npm run smoke:inference:upstream:ci

echo "[ci-full] web smoke"
npm run smoke:web:ci

echo "[ci-full] cleanup ports for playwright"
if command -v fuser >/dev/null 2>&1; then
	fuser -k 3000/tcp 8080/tcp >/dev/null 2>&1 || true
elif command -v lsof >/dev/null 2>&1; then
	pids="$(lsof -ti tcp:3000 -ti tcp:8080 2>/dev/null || true)"
	if [[ -n "$pids" ]]; then
		kill $pids >/dev/null 2>&1 || true
	fi
fi

echo "[ci-full] playwright"
npm run test:e2e:web

echo "[ci-full] soroban"
(cd contracts/soroban && cargo test)

echo "[ci-full] ok"
