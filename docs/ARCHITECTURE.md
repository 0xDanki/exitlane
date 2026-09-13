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

## Approved exceptions

None. Add exceptions with rationale, risk, owner, and removal plan to `docs/DECISIONS.md`.

