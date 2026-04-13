# ADR-001: Monorepo for MVP Hackathon

## Context

We needed to deliver integrated contracts, backend, and frontend quickly, with low setup friction.

## Decision

Adopt a monorepo using npm workspaces and domain-oriented packages (`apps`, `services`, `contracts`, `packages`).

## Consequences

- Benefits: faster onboarding, centralized versioning, shared type reuse.
- Trade-off: a unified build/test pipeline requires stronger dependency discipline.
