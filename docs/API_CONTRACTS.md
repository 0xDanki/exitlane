# API contracts

This file defines behavior, not final implementation syntax. Zod schemas in code are authoritative and must remain consistent with this document.

## Common response

```ts
type ApiResult<T> =
  | { ok: true; data: T; requestId: string }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; requestId: string };
```

Never return secrets, raw authorization headers, stack traces, or entire vendor error objects.

## Domain shapes (implemented in `src/domain/`)

These types are authoritative.  Zod schemas in source code are the final
definition; the shapes below are kept in sync.

### `ExitMandate` (src/domain/mandate.ts)

```ts
type ExitMandate = {
  mandateVersion: "1";
  owner: Address;                // checksummed EIP-55
  treasuryWallet: Address;
  inputToken: Address;
  outputToken: Address;
  maxInputAmount: bigint;        // wei, uint256 string at boundary
  triggerComparator: "lte";      // only supported comparator in v1
  triggerThreshold: bigint;      // price × 10^8, uint256 string at boundary
  maxSlippageBps: number;        // integer 0–10 000 (JSON number)
  approvedChainId: bigint;       // safe integer range (≤ Number.MAX_SAFE_INTEGER); decimal string at boundary
  approvedRouter: Address;
  outputRecipient: Address;
  validAfter: bigint;            // Unix seconds, uint64 [0, 2^64-1]; decimal string at boundary
  expiry: bigint;                // Unix seconds, uint64 [0, 2^64-1]; must be > validAfter; decimal string at boundary
  nonce: Hex;                    // 32-byte hex (0x + 64 chars)
};
```

Serialized boundaries: all `bigint` fields travel as decimal strings.
`maxSlippageBps` travels as a JSON number.
`approvedChainId`, `validAfter`, and `expiry` are validated with strict schemas:
- `approvedChainId` — `SafeChainIdSchema`: positive, ≤ `Number.MAX_SAFE_INTEGER`
- `validAfter` / `expiry` — `Uint64StringSchema`: [0, 18 446 744 073 709 551 615]

### `MarketEvidence` (src/domain/evidence.ts)

```ts
type MarketEvidence = {
  inputToken: Address;
  outputToken: Address;
  price: bigint;          // inputToken price in outputToken units, × 10^8
  observedAtMs: number;   // wall-clock ms
  indexedBlock: bigint;   // block number from The Graph
};
```

### `ExecutionIntent` (src/domain/execution.ts)

```ts
type ExecutionIntent = {
  chainId: bigint;
  target: Address;           // approved router address
  calldata: Hex;             // encoded swap call
  nativeValue: bigint;       // ETH in wei (0 for ERC-20 swaps)
  inputToken: Address;
  outputToken: Address;
  exactInputAmount: bigint;
  minOutputAmount: bigint;
  recipient: Address;
  slippageBps: number;       // integer 0–10 000
  deadline: bigint;          // Unix seconds, uint64 [0, 2^64-1]
};
```

Canonical execution hash: `keccak256(abi.encode(chainId, target, calldata,
nativeValue, inputToken, outputToken, exactInputAmount, minOutputAmount,
recipient, slippageBps, deadline))`.

`deadline` is validated with `Uint64StringSchema` at the serialized boundary.

### `AuthorizationEnvelope` (src/domain/policy.ts)

Server-side audit record produced by every `evaluatePolicy` call (AUTHORIZED or BLOCKED).
**Never user-signed.** The API layer must persist this and use `executionHash` as
the trusted value before actual execution — never accept `executionHash` from the browser.

```ts
type AuthorizationEnvelope = {
  policyVersion: "1";
  mandateHash: Hex;       // EIP-712 hash of the signed mandate
  evidenceHash: Hex;      // canonical hash of the evidence snapshot
  executionHash: Hex;     // canonical hash of the execution intent (trusted)
  evaluatedAtMs: number;
  outcome: "AUTHORIZED" | "BLOCKED";
  envelopeHash: Hex;      // keccak256(abi.encode(all of the above))
};
```

### `PolicyDecision` (src/domain/policy.ts)

```ts
type PolicyDecision = {
  outcome: "AUTHORIZED" | "BLOCKED";
  reasonCode: PolicyReasonCode;
  checks: CheckResult[];        // 17 checks, always complete
  executionHash: Hex | null;    // non-null only when AUTHORIZED
  envelope: AuthorizationEnvelope; // always present; persist server-side
};

type CheckResult = {
  name: string;
  reasonCode: PolicyReasonCode;
  expected: string;
  observed: string;
  passed: boolean;
  explanation: string;
};
```

---

---

## GET /api/evidence

Returns normalized WETH/USDC market evidence from The Graph (Uniswap v3, Base mainnet).

**The Graph supplies evidence. It does NOT authorize execution.**
Authorization is performed exclusively by `evaluatePolicy()` in `src/domain/policy.ts`.

Runtime: Node.js. Caching: none (`force-dynamic`).

### Success response (HTTP 200)

```ts
{
  ok: true;
  evidence: {
    /** Checksummed WETH address on Base mainnet. */
    inputToken: string;
    /** Checksummed native USDC address on Base mainnet. */
    outputToken: string;
    /**
     * ETH price in USDC, scaled by 10^8.
     * Decimal string (BigInt serialized).
     * Example: "247643879727" = $2476.43879727
     */
    price: string;
    /**
     * Market observation time in milliseconds.
     * Derived from _meta.block.timestamp × 1000 (chain data, NOT Date.now()).
     */
    observedAtMs: number;
    /**
     * Last indexed block number at query time. Decimal string.
     */
    indexedBlock: string;
    /** Always 100000000 (10^8). The denominator for price. */
    priceScale: number;
  };
  provenance: {
    provider: "TheGraph";
    sourceChainId: 8453;                        // Base mainnet
    subgraphId: string;                         // Uniswap v3 Base subgraph ID
    poolAddress: string;                        // WETH/USDC 0.05% pool
    indexedBlock: number;
    observedTimestampSec: number;               // Unix seconds from block
  };
  /** ISO 8601 server-side fetch time (not the market observation time). */
  fetchedAt: string;
}
```

### Error response (non-200)

```ts
{
  ok: false;
  error: {
    /** Stable machine-readable code. */
    code:
      | "CONFIGURATION_ERROR"   // THE_GRAPH_API_KEY missing — 500
      | "GRAPH_UNAVAILABLE"     // timeout, HTTP error, network failure — 503
      | "GRAPH_QUERY_ERROR"     // GraphQL errors array — 502
      | "SCHEMA_INVALID"        // response doesn't match Zod schema — 502
      | "POOL_NOT_FOUND"        // pool absent from subgraph — 502
      | "UNEXPECTED_TOKEN_ADDRESS"  // token identity mismatch — 502
      | "UNEXPECTED_TOKEN_DECIMALS" // token decimal mismatch — 502
      | "PRICE_ZERO"            // price normalized to zero — 502
      | "INTERNAL_ERROR";       // unexpected — 500
    /** Human-readable. Never contains secrets or raw upstream data. */
    message: string;
  };
}
```

**Guarantees:**
- Never returns fake or stale evidence with HTTP 200.
- Never includes the API key, raw upstream response, or stack traces.
- The `evaluatePolicy` function is never called in this route.

---

## POST /api/draft

Generates an untrusted AI mandate draft from an operator's plain-language plan text.
Requires Privy authentication. Calls Anthropic exactly once per request.

**AI output is an untrusted draft. It cannot authorize execution or select trusted fields.**

Runtime: Node.js. Caching: none (`force-dynamic`).

### Request

```http
POST /api/draft
Authorization: Bearer <privy-access-token>
Content-Type: application/json

{ "operatorText": "<1–1000 character plain-language plan>" }
```

### Success response (HTTP 200)

```ts
{
  ok: true;
  draft: {
    /** Each economic field is either { value, sourceSpan } or { value: null, sourceSpan: null }. */
    inputAssetSymbol:         { value: string | null; sourceSpan: string | null };
    outputAssetSymbol:        { value: string | null; sourceSpan: string | null };
    maxInputAmount:           { value: string | null; sourceSpan: string | null }; // decimal string
    triggerComparator:        { value: "lte" | null;  sourceSpan: string | null };
    triggerThresholdUsd:      { value: string | null; sourceSpan: string | null }; // USD decimal string
    maxSlippagePercent:       { value: string | null; sourceSpan: string | null }; // decimal string
    validityDurationMinutes:  { value: string | null; sourceSpan: string | null }; // decimal string
    /** Enum of field names that the model could not extract. */
    missingFields: Array<
      | "inputAssetSymbol" | "outputAssetSymbol" | "maxInputAmount"
      | "triggerComparator" | "triggerThresholdUsd" | "maxSlippagePercent"
      | "validityDurationMinutes"
    >;
    /** Concise operator-facing summary (≤ 300 chars). */
    summary: string;
  };
}
```

**Schema invariants:**
- A non-null `value` must have a non-null `sourceSpan` (the verbatim phrase from `operatorText`).
- Every `sourceSpan` is deterministically verified to appear in the submitted `operatorText`.
- The draft never contains: token addresses, chain IDs, router/target/recipient/wallet addresses,
  timestamps, nonce, calldata, execution hash, policy outcome, or authorization status.
- `triggerComparator.value` is either `"lte"` or `null` — no other comparator is accepted.

### Error responses

```ts
{
  ok: false;
  error: {
    code:
      | "UNAUTHENTICATED"   // 401 — missing, malformed, expired, or invalid token
      | "INVALID_INPUT"     // 400 — empty operatorText or > 1000 chars
      | "AI_UNAVAILABLE"    // 503 — ANTHROPIC_API_KEY or ANTHROPIC_MODEL not configured; or provider failure
      | "AI_SCHEMA_INVALID" // 422 — model output failed Zod validation or source-span verification
      | "INTERNAL_ERROR";   // 500 — unexpected
    message: string;
  };
}
```

**Guarantees:**
- Returns `401` for missing, malformed, expired, or invalid Privy tokens.
- The Anthropic API key and model are never included in any response.
- Raw Anthropic errors are never surfaced — only stable public codes.
- Exactly one Anthropic call per operator click; no automatic retries.
- No fallback to another model or a fake draft.
- The route never calls `evaluatePolicy()` — it produces only an untrusted draft.

---

## GET /api/health

Returns configuration booleans and service names only. It never performs a transaction or reveals values.

## GET /api/risk

Returns normalized live Graph evidence, indexed block, observation time, freshness, signed threshold when supplied, and deterministic decision.

## POST /api/analyze

Accepts normalized evidence and public mandate constraints. Returns validated structured analysis. It has no execution authority.

## POST /api/quote

Accepts a verified signed mandate reference or the signed mandate plus signature. The server constructs the Uniswap request. Caller-provided transaction targets/calldata are forbidden.

## POST /api/execute

Accepts the signed mandate, owner signature, explicit confirmation, and idempotency key. It performs the fixed execution sequence in `docs/ARCHITECTURE.md` and returns a stage-aware receipt.

## Error codes

Use stable codes such as:

```text
UNAUTHENTICATED
INVALID_REQUEST
INVALID_SIGNATURE
WALLET_MISMATCH
MANDATE_NOT_ACTIVE
MANDATE_EXPIRED
NONCE_REUSED
GRAPH_UNAVAILABLE
EVIDENCE_STALE
TRIGGER_NOT_MET
AI_UNAVAILABLE
AI_REVIEW_REQUIRED
QUOTE_UNAVAILABLE
QUOTE_INVALID
POLICY_DENIED
TRANSACTION_PENDING_UNKNOWN
TRANSACTION_REVERTED
INTERNAL_ERROR
```

