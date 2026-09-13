# Security model

## Protected assets

- Treasury funds
- Owner authorization
- Privy authorization private key
- Provider API keys
- Mandate integrity
- Nonce/idempotency state
- Audit evidence

## Trust boundaries

Untrusted inputs include browser requests, signed payload wrappers, The Graph responses, AI output, Uniswap responses, RPC responses, timestamps, persisted state, and displayed copy.

Privy is trusted to enforce the configured signer policy. Uniswap is trusted to return a valid protocol transaction; ExitLane still verifies the response envelope and parameters. The Graph is the evidence provider; freshness and schema shape must be checked. AI output is never trusted for authorization.

## Required controls

- Server-side authentication and wallet association
- Zod validation at every boundary
- EIP-712 signature recovery
- Exact signed-field comparisons
- Integer values for prices, amounts, and basis points
- Expiry and not-before checks using server time
- Atomic nonce consumption in production
- Idempotent transaction submission
- Current router discovery plus a restrictive Privy policy
- Global demo amount cap
- Explicit provider timeouts
- Redacted structured logging
- No arbitrary calldata signing endpoint

## Fail-closed events

Block execution when evidence is stale, a provider times out, schemas are unknown, AI and deterministic policy disagree under the current MVP rule, transaction state is uncertain, a nonce is reused, or any field cannot be verified.

## Signed mandate fields (EIP-712 ExitMandate v1)

All 15 fields below are included in the EIP-712 typed-data hash.  Any mutation
invalidates the signature.  Field order is stable.

| # | Field | EIP-712 type | Semantic |
|---|-------|-------------|---------|
| 1 | `mandateVersion` | `string` | Schema version; Zod literal — only `"1"` accepted |
| 2 | `owner` | `address` | Address of the operator who signed |
| 3 | `treasuryWallet` | `address` | Wallet whose funds are being protected |
| 4 | `inputToken` | `address` | Token to sell (exact match required) |
| 5 | `outputToken` | `address` | Token to receive (exact match required) |
| 6 | `maxInputAmount` | `uint256` | Maximum wei of inputToken to sell |
| 7 | `triggerComparator` | `string` | Zod literal — only `"lte"` (price ≤ threshold) accepted in v1 |
| 8 | `triggerThreshold` | `uint256` | Price threshold scaled by 10^8 |
| 9 | `maxSlippageBps` | `uint256` | Maximum slippage in integer basis points [0, 10 000] |
| 10 | `approvedChainId` | `uint256` | Chain ID — present in both domain and message; constrained to safe integer range (Decision D-009) |
| 11 | `approvedRouter` | `address` | Exact execution target address |
| 12 | `outputRecipient` | `address` | Exact recipient of swap output |
| 13 | `validAfter` | `uint64` | Unix seconds before which mandate is inactive; validated [0, 2^64-1] |
| 14 | `expiry` | `uint64` | Unix seconds after which mandate is expired; validated [0, 2^64-1]; must be > `validAfter` |
| 15 | `nonce` | `bytes32` | 32-byte single-use identifier |

EIP-712 domain: `{ name: "ExitLane", version: "1", chainId: Number(approvedChainId) }`.
No `verifyingContract` — off-chain verification (Decision D-007).

### Missing verifyingContract — corrected risk analysis

**Knowing an owner address does NOT enable signature forgery.**  An attacker
cannot produce a valid ECDSA signature for an address they do not control.

The actual risks of omitting `verifyingContract` are:

1. **Weaker deployment-level domain separation**: two ExitLane deployments on
   the same chain (e.g., staging vs production) sharing `name="ExitLane"` and
   `version="1"` will share the same domain separator.  A mandate signed for
   staging is mathematically valid on production.  `verifyingContract` would
   make each deployment's separator unique.

2. **Cross-application replay**: any application that constructs the identical
   EIP-712 domain and the same typed-data struct layout could replay signatures.
   The risk is low given ExitLane's unique 15-field struct, but not zero.

3. **API-layer Privy ownership check (separate concern)**: the policy engine
   verifies the signature came from `mandate.owner`.  The API layer must
   *additionally* verify that `mandate.owner` is the wallet address of the
   authenticated Privy user.  Without this, someone who knows an operator's
   address could submit a mandate claiming to be that operator (though they
   cannot produce a valid signature for it).

Mitigations: add `verifyingContract` before production; enforce Privy ownership
check in the API layer for every request.

## Execution intent and trusted hash binding (Decision D-005 / D-010)

The canonical execution hash is `keccak256(abi.encode(...))` over all 11 fields:
`chainId`, `target`, `calldata`, `nativeValue`, `inputToken`, `outputToken`,
`exactInputAmount`, `minOutputAmount`, `recipient`, `slippageBps`, `deadline`.
A single-byte mutation in any field changes the hash.

### Trust boundary

The execution hash is computed and stored server-side when the server
constructs the execution intent from the validated Uniswap response.  The hash
is **never accepted from the browser as authoritative**.

Before a transaction is submitted, the API layer must:
1. Retrieve the stored `envelope.executionHash`.
2. Recompute `hashExecutionIntent(actualIntent)`.
3. Require exact equality.  Any post-authorization mutation → `EXECUTION_HASH_INCONSISTENT`.

An attacker who recomputes the hash for mutated calldata will produce a hash
that differs from the server-stored trusted value → still blocked.

### AuthorizationEnvelope

The policy engine produces an `AuthorizationEnvelope` (always, AUTHORIZED or
BLOCKED) binding:
- `policyVersion: "1"`
- `mandateHash` — EIP-712 hash of the signed mandate
- `evidenceHash` — canonical hash of the evidence snapshot
- `executionHash` — canonical hash of the execution intent (the trusted value)
- `evaluatedAtMs` — evaluation wall-clock time
- `outcome` — AUTHORIZED or BLOCKED
- `envelopeHash` — `keccak256(abi.encode(all of the above))`

The envelope is NOT user-signed.  It is a server-side audit record.

## Policy checks (17 total, all must pass)

`SCHEMA_INVALID` · `SIGNER_MISMATCH` · `NOT_YET_VALID` · `MANDATE_EXPIRED` ·
`WRONG_CHAIN` · `EVIDENCE_STALE` · `EVIDENCE_PAIR_MISMATCH` · `TRIGGER_NOT_MET` ·
`AMOUNT_EXCEEDED` · `INPUT_TOKEN_MISMATCH` · `OUTPUT_TOKEN_MISMATCH` ·
`RECIPIENT_MISMATCH` · `TARGET_NOT_APPROVED` · `SLIPPAGE_EXCEEDED` ·
`DEADLINE_AFTER_EXPIRY` · `NONCE_REUSED` · `EXECUTION_HASH_INCONSISTENT`

## Chain ID handling (Decision D-009)

ExitLane's schema uses `SafeChainIdSchema` for `approvedChainId`.  This
validates the value is a positive decimal integer ≤ `Number.MAX_SAFE_INTEGER`
(9 007 199 254 740 991).  All real Ethereum chain IDs are far below this bound.
The validation allows safe conversion to a JavaScript `number` as required by
the viem `TypedDataDomain` type.  An `approvedChainId` above the safe boundary
is rejected at schema validation time — it never reaches `hashMandate()`.

| Chain | ID | Role |
|-------|-----|------|
| Base mainnet | 8453 | Evidence source (Decision D-002) |
| Base Sepolia | 84532 | Execution MVP target |

## Privy authentication controls (Phase 4)

- Server-side verification uses `@privy-io/node` `PrivyClient.utils().auth().verifyAccessToken()`.
- `PRIVY_APP_SECRET` is read only in `src/server/env.ts` (enforced by `server-only`).
- A missing, malformed, expired, or otherwise invalid token returns `401 UNAUTHENTICATED`.
- Raw Privy SDK errors are caught and replaced with a stable `PrivyAuthError` before the route handler sees them — no raw error text, user identifiers, or token fragments appear in responses.
- Access tokens are never logged or echoed back.
- The Privy `PrivyClient` is a lazy singleton (initialized on first use per worker process); no credentials are held in module scope before the first authenticated request.
- **Not yet enforced (required before production):** API-layer wallet ownership check — verify that `mandate.owner` equals the Privy wallet address for the authenticated user (Decision D-007).

## AI mandate-draft safety controls (Phase 4)

The AI draft subsystem follows AI_USE.md. Key controls:

| Control | Implementation |
|---------|---------------|
| Untrusted output | `MandateDraftSchema` is strict (`z.object({...}).strict()`); additional properties rejected |
| No sensitive fields | Schema rejects: addresses, chain IDs, router, calldata, nonce, policy outcome, auth status |
| Source-span verification | `verifySourceSpans()` checks every non-null `sourceSpan` appears verbatim in `operatorText` |
| Input length limit | `operatorText` capped at 1,000 characters; empty input rejected with 400 |
| Prompt-injection safety | Operator text treated as plain user data; system prompt is not modifiable by request body |
| Single provider call | Exactly one Anthropic call per `/api/draft` request; no automatic retries |
| No fallback | No fake draft; no alternative model; 503 on provider or config failure |
| Sanitized errors | Raw Anthropic errors caught in `AIDraftError`; only stable codes returned to browser |
| Server-only secrets | `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` never in response body, logs, or client bundle |
| Model selection | Fixed by `ANTHROPIC_MODEL` env var (server-only); never accepted from request body |

The AI subsystem **cannot** authorize execution, override policy, select trusted transaction fields, create or approve calldata, consume nonces, or access credentials.

## Known POC limitations

- In-memory nonce storage is not production-safe.
- `verifyingContract` absent — weaker deployment separation (add before production).
- API-layer Privy ownership check must be implemented and enforced.
- Universal Router nested calldata is not assumed to be fully decoded unless a tested decoder exists.
- Mainnet market evidence may drive a separately labelled testnet execution demonstration.
- The project is unaudited and must not custody assets of value.

Update this file whenever a trust boundary or authorization path changes.

