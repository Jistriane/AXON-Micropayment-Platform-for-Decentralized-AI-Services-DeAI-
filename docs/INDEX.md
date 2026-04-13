# Documentation Index

Complete documentation reference for the DeAI platform.

## Quick Reference

**Just starting?** → [Quick Start](QUICK-START.md)

**Configuring Gemini?** → [Gemini Setup](GEMINI-SETUP.md)

**Deploying to production?** → [Operations Runbook](OPERATIONS-RUNBOOK.md)

**Building or integrating?** → [API Reference](API.md) + [Testing Guide](TESTING.md)

## Documentation Map

### Getting Started (5-30 minutes)

| Document | Audience | Time | Purpose |
|----------|----------|------|---------|
| [QUICK-START.md](QUICK-START.md) | Developers | 5 min | Set up local environment in 5 minutes |
| [GEMINI-SETUP.md](GEMINI-SETUP.md) | Developers | 10 min | Configure Gemini API with real credentials |
| [INFERENCE-PROVIDERS.md](INFERENCE-PROVIDERS.md) | Developers | 15 min | Understand Gemini vs OpenAI vs Generic |

### Development (30-60 minutes)

| Document | Audience | Time | Purpose |
|----------|----------|------|---------|
| [API.md](API.md) | Backend devs | 30 min | All endpoints, request/response examples |
| [TESTING.md](TESTING.md) | QA/Test engineers | 30 min | Unit, smoke, E2E tests; CI/CD |
| [PAYMENT-FLOW.md](PAYMENT-FLOW.md) | Backend devs | 20 min | How payments work (multi-level settlement) |

### Production (1-2 hours)

| Document | Audience | Time | Purpose |
|----------|----------|------|---------|
| [PRODUCTION-READINESS.md](PRODUCTION-READINESS.md) | Everyone | 15 min | Runtime profiles, strict production rules, and release gates |
| [OPERATIONS-RUNBOOK.md](OPERATIONS-RUNBOOK.md) | DevOps/SRE | 1 hour | Deploy, monitor, troubleshoot |
| [FACILITATOR-PRODUCTION.md](FACILITATOR-PRODUCTION.md) | DevOps/Backend | 30 min | OpenZeppelin Facilitator configuration |
| [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) | DevOps/PM | 15 min | Pre-release validation steps |

### Architecture & ADRs

| Document | Audience | Purpose |
|----------|----------|---------|
| [MVP Architecture Overview](arquitetura-mvp.md) | Architects | System design overview |
| [ADR-001: Monorepo for MVP](adr/ADR-001-monorepo-mvp.md) | Architects | Decision: Monorepo structure |
| [Contract Alignment](ALINHAMENTO-CONTRATOS.md) | Architects | Smart contract alignment |
| [Prisma Data Model](PRISMA.md) | Developers | Database schema reference |

### Deployment (Mainnet)

| Document | Audience | Purpose |
|----------|----------|---------|
| [SOROBAN-MAINNET-RUNBOOK.md](SOROBAN-MAINNET-RUNBOOK.md) | DevOps | Deploy contracts to Stellar mainnet |

---

## Common Workflows

### 1) I want to get started developing

```
1. Read: QUICK-START.md (5 min)
2. Do: npm install && npm run dev
3. Read: API.md to understand endpoints
4. Code: Create a new endpoint
5. Test: npm run test --workspace services/gateway
```

### 2) I want to integrate real Gemini API

```
1. Read: GEMINI-SETUP.md (10 min)
2. Obtain: API key from ai.google.dev
3. Configure: Add to .env.local
4. Test: npm run smoke:inference:upstream
5. Done: Gemini is now handling real inference
```

### 3) I want to understand payment flow

```
1. Read: PAYMENT-FLOW.md (20 min)
   - Multi-level settlement architecture
   - Facilitator → On-chain → Fail explicitly if both unavailable
2. Read: FACILITATOR-PRODUCTION.md (if using Facilitator)
3. Reference: POST /payments/authorize in API.md
4. Test: npm run smoke:inference:upstream
```

### 4) I want to deploy to production

```
1. Read: OPERATIONS-RUNBOOK.md section 1 (Startup preflight)
2. Configure: .env.production.local with all required vars
3. Validate: npm run validate:gateway:production
4. Test: npm run smoke:inference:upstream (with real Gemini)
5. Checklist: RELEASE-CHECKLIST.md
6. Deploy: npm run build && deploy container
7. Monitor: GET /ops/metrics, check logs

### 6) I want automatic frontend deploy on GitHub Pages

```
1. Confirm workflow exists: .github/workflows/deploy-pages.yml
2. Push to main branch
3. Check Actions run: "Deploy Frontend to GitHub Pages"
4. Verify repository Pages source is "GitHub Actions"
5. Validate public URL:
   https://jistriane.github.io/AXON-Micropayment-Platform-for-Decentralized-AI-Services-DeAI-/
```
```

### 5) Something broke in production

```
1. Check: GET /health and logs
2. Diagnose: OPERATIONS-RUNBOOK.md section 6 (Troubleshooting)
   - Is it Gemini? → Check API key, quotas, Google Cloud status
   - Is it Facilitator? → Check URL, API key, network reachability
   - Is it Database? → Check PostgreSQL connection
3. Restore: Follow recovery procedure in OPERATIONS-RUNBOOK.md
4. Post-incident: Document and update tests
```

---

## Document Details

### QUICK-START.md
- **When:** First time setup
- **Covers:** Installation, env configuration, local testing, basic API calls
- **Time:** 5 minutes
- **Output:** Working local gateway + frontend on localhost:3000

### GEMINI-SETUP.md
- **When:** Want to use real Gemini API
- **Covers:** Creating Google account, getting API key, configuration, testing
- **Time:** 10 minutes
- **Output:** Gateway calling real Gemini API with valid credentials

### INFERENCE-PROVIDERS.md
- **When:** Choosing between Gemini, OpenAI, or Generic
- **Covers:** Provider comparison, configuration per provider, switching providers, troubleshooting
- **Time:** 15 minutes
- **Output:** Understanding of available providers and when to use each

### API.md  
- **When:** Building API consumers or integrations
- **Covers:** All endpoints (GET /health, POST /inference, etc.), request/response formats, error codes
- **Time:** 30 minutes (reference)
- **Output:** Complete API specification

### PAYMENT-FLOW.md
- **When:** Understanding how payments work
- **Covers:** Multi-level settlement, Facilitator integrations, strict failure modes, state tracking
- **Time:** 20 minutes
- **Output:** Understanding payment architecture and settlement flow

### TESTING.md
- **When:** Running tests or adding test coverage
- **Covers:** Unit tests (47), smoke tests, E2E tests, CI/CD, troubleshooting
- **Time:** 30 minutes (reference)
- **Output:** Ability to run all test suites

### OPERATIONS-RUNBOOK.md
- **When:** Deploying, monitoring, or troubleshooting production
- **Covers:** Preflight validation, incident response, rollback, database ops, troubleshooting
- **Time:** 1 hour
- **Output:** Ability to deploy, operate, and troubleshoot platform

### FACILITATOR-PRODUCTION.md
- **When:** Integrating with OpenZeppelin Facilitator
- **Covers:** Modes (required/optional/disabled), environment vars, payload wiring, pre-launch checklist
- **Time:** 30 minutes
- **Output:** Production-ready Facilitator integration

### RELEASE-CHECKLIST.md
- **When:** Preparing for release
- **Covers:** Pre-release validation steps, sign-off requirements
- **Time:** 15 minutes
- **Output:** Confidence that platform is ready for release

---

## Finding Answers

### By Topic

**Inference / AI:**
- How to configure → GEMINI-SETUP.md / INFERENCE-PROVIDERS.md
- API details → API.md (section "POST /inference")
- Troubleshooting → OPERATIONS-RUNBOOK.md (section 6)

**Payments:**
- How payments work → PAYMENT-FLOW.md
- API details → API.md (section "POST /payments/authorize")
- Facilitator setup → FACILITATOR-PRODUCTION.md
- Troubleshooting → OPERATIONS-RUNBOOK.md (section 6)

**Testing / Development:**
- Getting started → QUICK-START.md
- Testing → TESTING.md
- Database → PRISMA.md
- All endpoints → API.md

**Operations / Production:**
- Deployment → OPERATIONS-RUNBOOK.md (section 1)
- Troubleshooting → OPERATIONS-RUNBOOK.md (section 6)
- Release → RELEASE-CHECKLIST.md
- Monitoring → OPERATIONS-RUNBOOK.md (section 7)

### By Problem

| Problem | Document | Section |
|---------|----------|---------|
| "How do I start?" | QUICK-START.md | All |
| "Gemini returns 403" | OPERATIONS-RUNBOOK.md | Section 6 / Troubleshooting |
| "Payment returns 402" | OPERATIONS-RUNBOOK.md | Section 6 / Troubleshooting |
| "Database won't connect" | OPERATIONS-RUNBOOK.md | Section 6 / Troubleshooting |
| "How do tests work?" | TESTING.md | All (reference) |
| "What's the API endpoint for X?" | API.md | Reference |
| "When should I use Gemini vs OpenAI?" | INFERENCE-PROVIDERS.md | Section 4 (Comparison) |

---

## Coverage Snapshot

This documentation set currently covers:
- ✅ Development workflows
- ✅ Inference/Gemini integration
- ✅ Payment flow and Facilitator
- ✅ Production operations
- ✅ Testing and CI/CD
- ✅ Troubleshooting guide
- ✅ API reference

## Naming Note

Some document file names are intentionally kept in their original naming convention for repository compatibility. The link labels in this index use standardized English titles for readability.

---

## Next Steps

**For Developers:**
1. Start with [QUICK-START.md](QUICK-START.md)
2. Read [GEMINI-SETUP.md](GEMINI-SETUP.md) to integrate Gemini
3. Reference [API.md](API.md) while building
4. Use [TESTING.md](TESTING.md) to validate changes

**For DevOps/SRE:**
1. Read [OPERATIONS-RUNBOOK.md](OPERATIONS-RUNBOOK.md) section 1 (Preflight)
2. Read [FACILITATOR-PRODUCTION.md](FACILITATOR-PRODUCTION.md) (if using Facilitator)
3. Follow [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) before release
4. Use [OPERATIONS-RUNBOOK.md](OPERATIONS-RUNBOOK.md) section 6 (Troubleshooting) when needed

**For Operators:**
1. Read [OPERATIONS-RUNBOOK.md](OPERATIONS-RUNBOOK.md) (complete)
2. Set up monitoring: `GET /ops/metrics`
3. Create runbooks from [OPERATIONS-RUNBOOK.md](OPERATIONS-RUNBOOK.md) for your team

---

## Contributing to Docs

When you add a new feature or fix, please:

1. Update relevant docs section
2. Add example to [API.md](API.md) if adding endpoint
3. Add test reference to [TESTING.md](TESTING.md)
4. Update [OPERATIONS-RUNBOOK.md](OPERATIONS-RUNBOOK.md) if configuration changed
5. Update this INDEX if creating new doc

---

## Document Version

**Last Updated:** 2026-04-12
**Gateway Version:** 0.1.0
**Status:** ✅ Production Ready

See [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) for current release status.
