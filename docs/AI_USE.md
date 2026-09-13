# AI use in ExitLane

This document distinguishes two separate uses of AI in the ExitLane project and
defines the trust level and permitted scope of each.

---

## 1. Development AI — Cursor Agent with Claude

**Role:** implementation aid used by the development team.

Cursor Agent (currently Claude Sonnet) helps write TypeScript, generate
specification drafts, refactor code, and explore the codebase. It operates
under the constraints in `CLAUDE.md` and all `.cursor/rules/*.mdc` files.

### What development AI may do

- Read and edit source files within the repository.
- Generate or refactor application code following existing architecture.
- Draft or update documentation based on verified repository state.
- Run build, lint, typecheck, and test commands.
- Explain code and architecture decisions.

### What development AI must not do

- Read, print, or summarize `.env.local`, private keys, or any credential file.
- Invent external API responses, contract addresses, or transaction receipts.
- Claim an integration is live without verifiable evidence from a real provider response.
- Weaken types, validation logic, or tests to make a build pass.
- Bypass the authorization boundary described in `docs/PRODUCT_SCOPE.md`.

---

## 2. Application AI — Claude via Anthropic API

**Role:** constrained runtime assistant embedded in the ExitLane application.

The application calls Claude (via `@anthropic-ai/sdk`) for exactly two workflows
defined in `docs/PRODUCT_SCOPE.md`. All other uses of AI in the application are
outside scope and must not be added without an explicit decision in `docs/DECISIONS.md`.

### Workflow 1 — Mandate draft generation

| Property | Value |
|----------|-------|
| Input | Operator's plain-language emergency plan |
| Output | Untrusted schema-validated mandate draft (Zod-verified before use) |
| Trust level | Untrusted — operator reviews and signs the draft |
| Constraint | Missing values stay unresolved; AI must not fill in addresses, amounts, or thresholds without operator input |

### Workflow 2 — Evidence explanation

| Property | Value |
|----------|-------|
| Input | Normalized Graph evidence + already-computed deterministic policy result |
| Output | Plain-language summary for the operator |
| Trust level | Advisory — does not affect the policy decision |
| Constraint | AI receives the result, not raw provider payloads; cannot re-run or override the engine |

### Hard boundaries for application AI

Application AI **cannot**:

- Authorize execution or override a deterministic policy decision.
- Select trusted transaction fields (token, amount, router, recipient, calldata).
- Generate, approve, or modify transaction calldata.
- Consume a nonce or submit a transaction.
- Access credentials, private keys, or authorization material.
- Produce a result that ExitLane treats as authoritative without deterministic verification.

These boundaries are enforced at the architecture level (AI output is a typed,
unvalidated draft or advisory text — it never enters the execution path directly)
and must not be relaxed without a recorded decision in `docs/DECISIONS.md`.

---

## Labeling requirements

Any AI-generated content shown to the operator must be clearly labeled:

- Mandate drafts: labeled as AI-generated and unverified until the operator reviews and signs.
- Evidence explanations: labeled as an AI summary of deterministic results.
- The UI must never imply that AI approved, authorized, or executed a transaction.

The phrase **"Software checks; AI explains"** describes the trust model throughout
the product. See `docs/DESIGN_SYSTEM.md` § Trust model for the full wording policy.
