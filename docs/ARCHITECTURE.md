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

