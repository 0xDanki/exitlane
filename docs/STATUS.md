# Current project status

Update this file after every completed phase or newly discovered blocker.
Use exact labels: implemented, tested, deployed, simulated, planned, blocked.

---

## Current phase

**Phase 2 — Security review and corrections** (complete)

---

## Last green commit

`12501c3` — docs: add AI engineering context
(all Phase 1 and Phase 2 work is uncommitted, per task instructions)

---

## Verified working

### Phase 1 (repository baseline)
- `.nvmrc` declares Node 22; `engines: ">=22"` in `package.json`.
- `pnpm@12.4.1` confirmed as package manager.
- `eslint .`, `tsc --noEmit`, `next build`, `git diff --check` all pass.
- `docs/PRODUCT_SCOPE.md`, `docs/AI_USE.md`, `FEEDBACK.md`, `.env.example` created.
- `docs/DESIGN_SYSTEM.md` updated to v1.5 with all token values.
- `AGENTS.md` updated with ExitLane pointer outside the generated block.

### Phase 2 (domain layer — initial)
- `src/domain/primitives.ts` — EthAddress, Bytes32, Hex, Uint256String, BasisPoints schemas.
- `src/domain/evidence.ts` — MarketEvidence schema; price as bigint × 10^8.
- `src/domain/mandate.ts` — ExitMandate schema; EIP-712 typed data; hashMandate; recoverMandateSigner; verifyMandateSigner.
- `src/domain/execution.ts` — ExecutionIntent schema; hashExecutionIntent (keccak256 of ABI encoding).
- `src/domain/policy.ts` — Pure async evaluatePolicy; 17 deterministic checks; AUTHORIZED/BLOCKED result.
- `vitest.config.ts` — node environment, `src/**/*.test.ts` glob.
- `tsconfig.json` — target raised to ES2020 for BigInt literals (Decision D-008).

### Phase 2 security corrections
- `Uint64StringSchema` added to `primitives.ts`; used for `validAfter`, `expiry`, `deadline` (replaces unconstrained `Uint256StringSchema` for uint64 EIP-712 fields). Validates [0, 2^64-1].
- `SafeChainIdSchema` added to `primitives.ts`; used for `approvedChainId` in mandate schema. Validates positive, ≤ Number.MAX_SAFE_INTEGER. Eliminates unsafe `Number(arbitraryUint256)` conversion (Decision D-009).
- `mandateTypedData` chain ID conversion is now safe: `Number(mandate.approvedChainId)` is exact after `SafeChainIdSchema` validation.
- `mandate.ts` module docstring corrected: states accurately that knowing an owner address does NOT enable signature forgery; identifies the real risks (weaker deployment separation, cross-application replay, API-layer Privy ownership check).
- `AuthorizationEnvelope` introduced in `policy.ts`: binds policyVersion, mandateHash, evidenceHash, executionHash, evaluatedAtMs, outcome, envelopeHash (Decision D-010).
- `PolicyInput.proposedExecutionHash` renamed to `trustedExecutionHash` with documentation that the API layer must never accept this from the browser.
- `PolicyDecision` now includes `envelope: AuthorizationEnvelope` (always present).
- `hashMarketEvidence` added to `evidence.ts` for canonical evidence hashing.
- `recharts` removed from dependencies; `@types/node` updated from `^20` to `^22`.

---

## Test results (Phase 2 — after security corrections)

| File | Tests |
|------|-------|
| `primitives.test.ts` | 50 pass (adds Uint64StringSchema ×13, SafeChainIdSchema ×11) |
| `execution.test.ts` | 16 pass (adds uint64 deadline boundary tests ×2) |
| `mandate.test.ts` | 30 pass (adds 15-field coverage assertion, literal enforcement, uint64/chain ID boundary tests ×5) |
| `policy.test.ts` | 29 pass (adds envelope tests ×2, Attack A/B trust-boundary tests ×2) |
| **Total** | **125 pass, 0 fail** (2026-09-13, 755ms) |

---

## In progress

- Phase 3 planning (API routes: `/api/health`, `/api/risk`, `/api/analyze`; adapter stubs for The Graph and Anthropic).

---

## Blockers

- None recorded.

---

## Known limitations

- In-memory nonce storage is POC-only (Decision recorded; atomic production implementation deferred).
- No deployed verifying contract — off-chain EIP-712 verification only (Decision D-007). Weaker deployment separation and cross-application replay are known risks; add `verifyingContract` before production.
- API-layer Privy ownership check not yet implemented — required before production.
- All external integrations are unconfigured (see table below).

---

## External integrations

| Integration | Configured | Live verified | Evidence |
|-------------|:----------:|:-------------:|---------|
| The Graph   | No | No | — |
| Privy       | No | No | — |
| Uniswap     | No | No | — |
| Anthropic   | No | No | — |

---

## Latest verification (Phase 2 security corrections)

| Check | Result | Date / evidence |
|-------|--------|----------------|
| `pnpm lint` | ✓ passed | 2026-09-13, `eslint .` — 0 errors, 0 warnings |
| `pnpm test` | ✓ passed | 2026-09-13, 125/125 tests pass in 755ms |
| `pnpm typecheck` | ✓ passed | 2026-09-13, `tsc --noEmit` — 0 errors |
| `pnpm build` | ✓ passed | 2026-09-13, Next.js 16.3.5 Turbopack, compiled in 4.3s |
| `git diff --check` | ✓ clean | 2026-09-13 |

---

## Next three actions

1. Implement `/api/health` route with configuration booleans (no secrets revealed).
2. Create The Graph adapter stub with typed port interface and fixture data.
3. Implement `/api/risk` route calling the adapter and the policy engine.
