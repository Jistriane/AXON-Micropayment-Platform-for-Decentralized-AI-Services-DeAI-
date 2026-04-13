# Gemini API Setup Guide

Complete guide to configure Google Generative AI (Gemini) with the DeAI gateway.

## Index

1. [Create Google account](#create-google-account)
2. [Get API key](#get-api-key)
3. [Local configuration](#local-configuration)
4. [Production configuration](#production-configuration)
5. [Integration tests](#integration-tests)
6. [Quota monitoring](#quota-monitoring)
7. [Troubleshooting](#troubleshooting)

---

## Create Google account

If you already have a Google account, skip to [Get API key](#get-api-key).

If you do not have one:
1. Visit [accounts.google.com/SignUp](https://accounts.google.com/SignUp)
2. Fill your account information
3. Complete verification

---

## Get API key

### Step 1: Open AI Studio

Visit [ai.google.dev](https://ai.google.dev)

### Step 2: Click "Get API Key"

Use the top-right button and select or create your Google Cloud project.

### Step 3: Copy the key

The key format is similar to:

```txt
AIzaSyC_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Important:
- Never share this key
- Never commit this key to Git
- Store it in a secret manager or local env file

### Optional key connectivity check

```bash
API_KEY="AIzaSyC_xxxxx"

curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=$API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{"text": "Hello Gemini"}]
    }]
  }'
```

---

## Local configuration

Add to `services/gateway/.env.local`:

```env
INFERENCE_PROVIDER="gemini"
INFERENCE_UPSTREAM_URL="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
INFERENCE_UPSTREAM_API_KEY="AIzaSyC_xxxxx"
INFERENCE_UPSTREAM_MODEL="gemini-2.0-flash"
INFERENCE_FALLBACK_MODE="disabled"
INFERENCE_TIMEOUT_MS="12000"
```

Start gateway:

```bash
npm run dev --workspace services/gateway
```

---

## Production configuration

Use strict mode (no mock fallback):

```env
INFERENCE_PROVIDER="gemini"
INFERENCE_UPSTREAM_URL="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"
INFERENCE_UPSTREAM_API_KEY="YOUR_PRODUCTION_KEY"
INFERENCE_UPSTREAM_MODEL="gemini-2.0-flash"
INFERENCE_FALLBACK_MODE="disabled"
INFERENCE_TIMEOUT_MS="12000"
```

Validate:

```bash
npm run validate:gateway:production
```

Run upstream smoke:

```bash
INFERENCE_FALLBACK_MODE=disabled \
INFERENCE_UPSTREAM_URL="https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent" \
INFERENCE_PROVIDER=gemini \
INFERENCE_UPSTREAM_API_KEY="YOUR_KEY" \
npm run smoke:inference:upstream
```

---

## Integration tests

1. Create model via `POST /models`
2. Execute `POST /inference` with `x-402-token`
3. Confirm response includes generated text and `paid: true`

---

## Quota monitoring

Use [ai.google.dev/dashboard](https://ai.google.dev/dashboard) to track request rate and quota usage.

If you exceed free-tier limits, configure billing in Google Cloud.

---

## Troubleshooting

### 403 Forbidden
- Invalid key or restricted model/region
- Recreate key in AI Studio

### Timeout
- Increase `INFERENCE_TIMEOUT_MS`
- Check network connectivity

### 503 INFERENCE_UNAVAILABLE
- In production mode, ensure upstream is reachable
- Keep `INFERENCE_FALLBACK_MODE=disabled` in all environments and ensure upstream is healthy
