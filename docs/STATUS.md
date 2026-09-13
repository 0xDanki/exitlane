# Current project status

Update this file after every completed phase or newly discovered blocker.
Use exact labels: implemented, tested, deployed, simulated, planned, blocked.

---

## Current phase

**Phase 3 — Trusted live WETH/USDC market evidence from The Graph** (complete)

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

## Test results (Phase 3 — after Graph evidence pipeline)

| File | Tests |
|------|-------|
| `primitives.test.ts` | 50 pass |
| `execution.test.ts` | 16 pass |
| `mandate.test.ts` | 30 pass |
| `policy.test.ts` | 29 pass |
| `server/graph/evidence.test.ts` | 37 pass (new: priceStringToScaled ×9, fetchWethUsdcEvidence ×28) |
| **Total** | **162 pass, 0 fail** (2026-09-13, 803ms) |

---

### Phase 3 (Graph evidence pipeline — complete)

- `src/config/markets.ts` — trusted public market identifiers: Base mainnet chain ID, WETH/USDC addresses and decimals, verified subgraph ID and pool address.
- `src/server/env.ts` — server-only `THE_GRAPH_API_KEY` access (enforced by `server-only` package).
- `src/server/graph/client.ts` — HTTP client with typed errors, 8 s timeout, key in header (never URL).
- `src/server/graph/evidence.ts` — Zod-validated fetch pipeline; token identity enforcement; `priceStringToScaled` (BigInt-only, truncation); chain-derived `observedAtMs`; `EvidenceFetchError` typed errors.
- `src/app/api/evidence/route.ts` — `GET /api/evidence` (Node runtime, force-dynamic); no fake fallback; no secret in response.
- `src/test-setup.ts` + `vitest.config.ts` updated — `server-only` mocked for test environment.
- **Discovery (live-verified):** Subgraph `GqzP4X…TbvZpz` (36.2K Signal, `hasIndexingErrors: false`), pool `0xd0b53D…F224` (WETH/USDC 0.05%, TVL ≈ $8.7M), token0 = WETH, token1 = USDC, price field = `token1Price` (USDC per WETH). See Decision D-011.
- **Rounding rule documented:** truncation (floor) at 8 decimal places. See Decision D-012.
- The Graph supplies evidence only. It does NOT authorize execution. Authorization remains exclusively in `evaluatePolicy()`.

---

## In progress

- Phase 4 planning (UI, Privy auth, quote/execute flow).

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
| The Graph   | ✓ Yes | ✓ Yes | `GET /api/evidence` → $2475, block 51257280, age 6 s (2026-09-13) |
| Privy       | No | No | — |
| Uniswap     | No | No | — |
| Anthropic   | No | No | — |

---

## Latest verification (Phase 3 — Graph evidence pipeline)

| Check | Result | Date / evidence |
|-------|--------|----------------|
| `pnpm lint` | ✓ passed | 2026-09-13, `eslint .` — 0 errors, 0 warnings |
| `pnpm test` | ✓ passed | 2026-09-13, 162/162 tests pass in 803ms |
| `pnpm typecheck` | ✓ passed | 2026-09-13, `tsc --noEmit` — 0 errors |
| `pnpm build` | ✓ passed | 2026-09-13, Next.js 16.3.5 Turbopack, `/api/evidence` (Dynamic) |
| `git diff --check` | ✓ clean | 2026-09-13 |
| `/api/evidence` live | ✓ $2475.33 | 2026-09-13, block 51257280, age 6 s, key not printed |

---

## Next three actions

1. Implement `/api/health` route with configuration booleans (no secrets revealed).
2. Implement Privy authentication and wallet ownership verification.
3. Implement `/api/risk` route calling evidence + policy engine (no execution).
