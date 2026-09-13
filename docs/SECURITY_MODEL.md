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

## Known POC limitations

- In-memory nonce storage is not production-safe.
- Universal Router nested calldata is not assumed to be fully decoded unless a tested decoder exists.
- Mainnet market evidence may drive a separately labelled testnet execution demonstration.
- The project is unaudited and must not custody assets of value.

Update this file whenever a trust boundary or authorization path changes.

