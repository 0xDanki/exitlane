# ExitLane product scope

**Authoritative definition.** Read this file before implementing any feature.
All agents, AI tools, and contributors must respect the boundaries below.

---

## What ExitLane is

ExitLane is a pre-authorized emergency exit system for onchain treasuries.

A treasury operator defines a narrowly constrained **Exit Mandate**: the asset,
maximum amount, destination asset, price trigger, approved exchange, and expiry.
The operator signs the mandate with EIP-712. After signing, the exact terms are
fixed — no parameter can change without a new signature.

When live market evidence satisfies all signed conditions, the ExitLane agent
may execute the mandate through a restricted Privy signer. The agent can invoke
the mandate; it cannot alter it.

---

## What ExitLane is not

| Category | Outside scope |
|----------|--------------|
| General trading | Portfolio management, market-making, stop-loss automation |
| Custody | Holding or moving funds beyond the signed mandate |
| Autonomous AI | AI selecting trusted fields, approving calldata, or authorizing execution |
| Multi-chain infrastructure | Generalized cross-chain bridging or routing |
| Organization admin | Team management, access control beyond a single treasury wallet |

Do not expand the product toward any of the categories above.

---

## ETHOnline 2026 delivery scope

This is a seven-hour hackathon build. Optimize in this order:

1. A reliable end-to-end vertical slice (mandate → evidence → policy → execution or clear block).
2. Deterministic authorization with visible rejection cases.
3. Clear, polished operator UX following `docs/DESIGN_SYSTEM.md`.
4. Real, honestly labeled partner integrations.
5. Submission documentation.

The demo uses mainnet evidence (The Graph on Base) to drive a clearly labeled
Base Sepolia execution. Both environments are always distinguished in the UI.

---

## AI trust boundary

ExitLane permits exactly two constrained application-level AI workflows:

### 1. Mandate draft generation

- **Input:** operator's plain-language description of their emergency plan.
- **Output:** an untrusted, schema-validated mandate draft.
- **Constraint:** missing or ambiguous values must remain unresolved;
  AI must not invent addresses, amounts, or thresholds.
- **Trust level:** untrusted. The operator reviews and signs; only the signed
  EIP-712 structure carries authorization weight.

### 2. Evidence explanation

- **Input:** normalized Graph evidence and the already-computed deterministic policy result.
- **Output:** plain-language summary for the operator.
- **Constraint:** AI receives only the result, not raw provider payloads.
  It cannot re-run or override the policy.
- **Trust level:** advisory. The deterministic engine is the sole authorization authority.

### What application AI cannot do

- Authorize execution or override a policy decision.
- Select trusted transaction fields (token, amount, router, recipient, calldata).
- Generate, approve, or modify calldata.
- Consume a nonce or submit a transaction.
- Access credentials, private keys, or authorization material.
- Produce a result that ExitLane treats as authoritative without deterministic verification.

### Development AI (Cursor Agent)

Cursor Agent with Claude is used as an implementation aid to write code,
generate specification drafts, and accelerate development. It operates under
the same boundaries defined in `CLAUDE.md` and this document.
See `docs/AI_USE.md` for the full distinction.

---

## Demo journey (canonical operator flow)

1. Log in and identify the treasury wallet (Privy authentication).
2. Enable the restricted ExitLane agent.
3. Review the exact permissions the agent will hold.
4. Create the mandate using human-readable units (AI draft optional).
5. Review the plain-language summary and the raw EIP-712 fields side by side.
6. Sign the mandate.
7. Observe live evidence and its freshness timestamp.
8. Preview the permitted exit (Uniswap quote; no execution yet).
9. See a truthful pending state during execution (step progress, not optimistic success).
10. Receive a verifiable receipt or an actionable blocking reason with "No funds moved".

Every step must answer within 15 seconds: what risk is being watched, what is
authorized, whether the agent can send funds elsewhere, whether this is live or
simulated, and what comes next.

---

## Key invariants

- The deterministic policy engine is the sole authorization authority.
- No execution path bypasses signature verification and live evidence freshness checks.
- "No funds moved" is stated explicitly on every blocked or failed execution surface.
- LIVE, TESTNET, SIMULATED, and FIXTURE labels are persistent and unmistakable.
- AI output is labeled and never presented as a policy decision.
