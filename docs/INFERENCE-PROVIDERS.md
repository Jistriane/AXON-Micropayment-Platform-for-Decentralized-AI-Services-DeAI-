# Inference Providers Guide

This document explains how to configure supported upstream AI providers.

## Overview

| Provider | Payload format | Default model | Recommended usage |
|---|---|---|---|
| `gemini` | Google Generative AI | `gemini-2.0-flash` | production default |
| `openai` | Chat Completions | `gpt-4` | alternative production |
| `generic` | pass-through (custom endpoint) | N/A | self-hosted or custom providers |

---

## 1) Generic Provider

> ⚠️ **Note:** Mock mode has been removed. Generic provider requires a real upstream endpoint.

Use for custom or self-hosted inference endpoints.

```env
INFERENCE_PROVIDER="generic"
INFERENCE_UPSTREAM_URL="https://your-inference-service.example.com/infer"
INFERENCE_UPSTREAM_API_KEY="your-api-key"
INFERENCE_FALLBACK_MODE="disabled"
INFERENCE_TIMEOUT_MS="12000"
```

Behavior:
- routes to custom endpoint (no fallback to mock)
- returns 503 if endpoint unavailable

---

## 2) Gemini Provider

Use for production-grade upstream inference via Google.

```env
INFERENCE_PROVIDER="gemini"
INFERENCE_UPSTREAM_URL="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
INFERENCE_UPSTREAM_API_KEY="AIzaSyC_xxxxxxxxx"
INFERENCE_UPSTREAM_MODEL="gemini-2.0-flash"
INFERENCE_FALLBACK_MODE="disabled"   # strict mode (no fallback)
INFERENCE_TIMEOUT_MS="12000"
```

Notes:
- returns 503 error when upstream is unreachable or misconfigured
- upstream URL and API key required for all environments (production and development)

---

## 3) OpenAI Provider

Use as an alternate upstream provider.

```env
INFERENCE_PROVIDER="openai"
INFERENCE_UPSTREAM_URL="https://api.openai.com/v1/chat/completions"
INFERENCE_UPSTREAM_API_KEY="sk_xxxxx"
INFERENCE_UPSTREAM_MODEL="gpt-4"
INFERENCE_FALLBACK_MODE="disabled"
INFERENCE_TIMEOUT_MS="30000"
```

---

## 4) Switching Providers

Example of switching from Gemini to OpenAI:

```env
# Gemini
INFERENCE_PROVIDER="gemini"
INFERENCE_UPSTREAM_URL="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
INFERENCE_UPSTREAM_API_KEY="AIzaSy..."
INFERENCE_UPSTREAM_MODEL="gemini-2.0-flash"

# Switch to OpenAI
INFERENCE_PROVIDER="openai"
INFERENCE_UPSTREAM_URL="https://api.openai.com/v1/chat/completions"
INFERENCE_UPSTREAM_API_KEY="sk-..."
INFERENCE_UPSTREAM_MODEL="gpt-4"
```

**All providers require a real upstream endpoint. Mock mode is no longer supported.**

Validation checklist:
1. Connectivity test to provider endpoint
2. `npm run validate:gateway:production`
3. `npm run smoke:inference:upstream`

---

## 5) Troubleshooting

### 403 / 401 auth errors
- confirm API key
- confirm project/account permissions and quotas

### Timeout
- increase `INFERENCE_TIMEOUT_MS`
- verify network path and DNS

### Missing inference output
- verify `INFERENCE_UPSTREAM_URL` is set and accessible
- verify `INFERENCE_UPSTREAM_API_KEY` is valid
- verify `INFERENCE_PROVIDER` matches the endpoint type
- check server logs for 503 or connection errors
