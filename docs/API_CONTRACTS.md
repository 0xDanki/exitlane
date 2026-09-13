# API contracts

This file defines behavior, not final implementation syntax. Zod schemas in code are authoritative and must remain consistent with this document.

## Common response

```ts
type ApiResult<T> =
  | { ok: true; data: T; requestId: string }
  | { ok: false; error: { code: string; message: string; retryable: boolean }; requestId: string };
```

Never return secrets, raw authorization headers, stack traces, or entire vendor error objects.

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

