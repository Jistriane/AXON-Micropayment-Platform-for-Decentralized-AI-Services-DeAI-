# Testing Guide

Complete testing guide for the DeAI platform.

## Index

1. [Unit test suite](#unit-test-suite)
2. [Smoke tests](#smoke-tests)
3. [E2E tests](#e2e-tests)
4. [Manual tests](#manual-tests)
5. [CI/CD](#cicd)

---

## Unit test suite

Gateway unit tests:

```bash
npm run test --workspace services/gateway
```

Expected baseline:
- 6 test files
- 47 tests passing

### Run specific tests

```bash
npm run test --workspace services/gateway src/inference.test.ts
npm run test --workspace services/gateway -- --grep "Gemini"
npm run test --workspace services/gateway -- --watch
```

---

## Smoke tests

### Upstream smoke with real provider

```bash
INFERENCE_FALLBACK_MODE=disabled \
INFERENCE_UPSTREAM_URL="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent" \
INFERENCE_PROVIDER=gemini \
INFERENCE_UPSTREAM_API_KEY="YOUR_KEY" \
npm run smoke:inference:upstream
```

### CI smoke with local mock upstream

```bash
npm run smoke:inference:upstream:ci
```

### Gateway CI smoke

```bash
npm run smoke:gateway:ci
```

---

## E2E tests

Playwright suite:

```bash
npm run test:e2e:web
```

Useful variants:

```bash
npm run test:e2e:web -- --headed
npm run test:e2e:web -- --debug
npm run test:e2e:web -- web-flow.spec.ts
```

---

## Manual tests

### Health

```bash
curl http://localhost:8080/health
```

### Models

```bash
curl http://localhost:8080/models
```

### Create model

```bash
curl -X POST http://localhost:8080/models \
  -H "Content-Type: application/json" \
  -d '{
    "providerAddress": "GCZST3SM7K3S23LFYDFDSEEEE43LQVHAQCGSFD2XLAJHB4Z5K6SK3PK",
    "name": "Test Model",
    "description": "Test model",
    "endpoint": "/inference",
    "priceMicrounit": 25000
  }'
```

### Inference

```bash
curl -X POST http://localhost:8080/inference \
  -H "Content-Type: application/json" \
  -H "x-402-token: <valid-payment-proof-or-configured-token>" \
  -d '{
    "modelId": "<model_id>",
    "prompt": "What is AI?"
  }'
```

---

## CI/CD

Full pipeline:

```bash
npm run verify:all
```

It covers build, lint, gateway tests, smoke tests, web E2E, and Soroban tests.

---

## Troubleshooting

### Port already in use

```bash
lsof -ti:8080 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

### Invalid Gemini key

- Recheck `INFERENCE_UPSTREAM_API_KEY`
- Run the upstream smoke command again

### 503 INFERENCE_UNAVAILABLE

- Confirm upstream URL and API key
- Confirm `INFERENCE_FALLBACK_MODE=disabled`
