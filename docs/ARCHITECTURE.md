# Architecture

Status: baseline; update only through an explicit decision recorded in `docs/DECISIONS.md`.

## Product boundary

ExitLane verifies and invokes a signed emergency exit mandate. It is not a general portfolio manager, arbitrary transaction signer, trading strategy platform, or custody system.

## Layers

```text
UI components
    ↓ typed requests/view models
Next.js API routes
    ↓ authentication and boundary parsing
Application services / execution orchestrator
    ↓
Pure domain modules
    ├── mandate schema and EIP-712 verification
    ├── risk calculation
    ├── quote/transaction policy
    └── nonce/idempotency rules
    ↓ typed ports
External adapters
    ├── The Graph
    ├── Anthropic
    ├── Uniswap
    ├── Privy
    └── EVM RPC
```

## Dependency rules

- Domain code imports no framework or vendor SDK.
- Adapters implement narrow interfaces owned by the application/domain layer.
- API routes contain no duplicated authorization logic.
- UI components never receive secrets or raw provider responses.
- Authorization-relevant values use integer representations.

## Execution sequence

1. Authenticate the user.
2. Parse the request.
3. Verify the mandate signature and wallet ownership.
4. Verify validity, nonce, chain, tokens, amount, slippage, router, and recipient.
5. Refresh live Graph evidence and verify freshness.
6. Evaluate the deterministic trigger.
7. Request structured AI analysis.
8. Apply the disagreement policy.
9. Fetch a fresh Uniswap quote and execution payload.
10. Validate the response against the mandate and current router discovery.
11. Submit through the restricted Privy signer.
12. Resolve the transaction outcome and consume the nonce safely.
13. Produce an execution receipt.

## Privy authentication flow (Phase 4)

```
Browser
  │  1. PrivyProvider initialized with NEXT_PUBLIC_PRIVY_APP_ID
  │  2. User logs in (email / external wallet)
  │  3. Privy issues an access token (JWT) client-side
  │  4. Client sends: Authorization: Bearer <access-token>
  ↓
src/app/api/draft/route.ts  (Next.js API route, Node runtime)
  │  5. Extracts bearer token from Authorization header
  ↓
src/server/auth/privy.ts
  │  6. verifyPrivyToken(token) via singleton PrivyClient (@privy-io/node)
  │     - Client initialized with PRIVY_APP_ID + PRIVY_APP_SECRET (server-only)
  │     - Calls client.utils().auth().verifyAccessToken(token)
  │     - Returns { userId } on success
  │     - Throws PrivyAuthError (sanitized) on any failure
  │  7. Route returns 401 on PrivyAuthError — no raw error surfaced
  ↓
Request proceeds to input validation → Anthropic call
```

**Security properties:**
- Access tokens are never logged or returned.
- Raw Privy SDK errors are never surfaced; only `PrivyAuthError("Invalid or expired access token")`.
- `PRIVY_APP_SECRET` is server-only; never in client bundle or API response.
- Privy ownership check (mandate.owner == Privy wallet) is required before production (D-007).

## AI mandate-draft flow (Phase 4)

```
src/app/api/draft/route.ts
  │  1. Auth verified (see above)
  │  2. operatorText validated: 1–1000 chars, non-empty
  │  3. ANTHROPIC_API_KEY + ANTHROPIC_MODEL read from server env
  ↓
src/server/ai/mandate-draft.ts
  │  4. System prompt establishes: output is untrusted draft; AI cannot authorize execution;
  │     model cannot select trusted config (addresses, chain IDs, router, etc.)
  │  5. Anthropic messages.create (claude-sonnet-5, max_tokens=600, effort="low")
  │     with output_config.format = JSON schema derived from MandateDraftSchema via z.toJSONSchema()
  │  6. Model output → JSON.parse → MandateDraftSchema.safeParse (strict, no extra props)
  │  7. verifySourceSpans: every non-null sourceSpan must appear verbatim in operatorText
  │  8. Throws AIDraftError on: JSON parse failure, Zod validation failure, span mismatch,
  │     or Anthropic client error (all sanitized — raw provider errors never propagated)
  ↓
POST /api/draft  → { ok: true, draft: MandateDraft }
```

**AI trust boundary:**
- AI output is an untrusted draft. It cannot authorize execution.
- The schema rejects: token addresses, chain IDs, router/recipient/wallet addresses,
  timestamps, nonce, calldata, execution hash, policy outcome, authorization status.
- Source spans are deterministically verified against the original operator text.
- One Anthropic call per click; no retries; no fallback models; no fake drafts.
- `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` are server-only and never appear in responses.

## The Graph trust boundary

The Graph is an evidence source, not an authorization authority.

```
The Graph gateway
  │  POST https://gateway.thegraph.com/api/subgraphs/id/<ID>
  │  Authorization: Bearer <THE_GRAPH_API_KEY>   ← server-only header
  ↓
src/server/graph/client.ts
  │  - 8 s timeout, AbortController
  │  - Typed error: GraphFetchError (HTTP_ERROR | GRAPHQL_ERRORS | TIMEOUT | ...)
  ↓
src/server/graph/evidence.ts
  │  - Zod schema validates raw response (shape, types, regex)
  │  - Token identity check: token0=WETH, token1=USDC (exact address + decimals)
  │  - Price orientation: token1Price = USDC per WETH (verified live, D-011)
  │  - priceStringToScaled: BigInt-only arithmetic, truncation rounding (D-012)
  │  - observedAtMs = _meta.block.timestamp × 1000 (chain-derived, not Date.now())
  │  - Throws EvidenceFetchError on any validation failure — never returns
  │    stale or fake evidence
  ↓
MarketEvidence (domain type, pure BigInt)
  │  - inputToken: WETH address
  │  - outputToken: USDC address
  │  - price: bigint × 10^8
  │  - observedAtMs: number (ms)
  │  - indexedBlock: bigint
  ↓
GET /api/evidence
  │  - Returns serialized evidence + provenance
  │  - No API key, no raw upstream data, no stack traces in response
  │  - evaluatePolicy() is NOT called here (evidence ≠ authorization)
  ↓
evaluatePolicy() in src/domain/policy.ts   ← separate call, separate concern
```

**What The Graph provides:** evidence (price, block, timestamp, provenance).
**What The Graph does not provide:** authorization. The policy engine alone authorizes.

## Approved exceptions

None. Add exceptions with rationale, risk, owner, and removal plan to `docs/DECISIONS.md`.

