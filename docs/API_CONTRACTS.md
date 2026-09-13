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

