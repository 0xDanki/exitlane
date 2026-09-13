# UX specification

## Primary user

A technically literate treasury operator who needs to understand and authorize an emergency plan quickly without reading raw calldata.

## Primary journey

1. Log in and identify the treasury wallet.
2. Enable the restricted ExitLane agent.
3. Review the exact permissions granted.
4. Create the mandate using human units.
5. Review a plain-language summary and technical details.
6. Sign the mandate.
7. Observe live evidence and freshness.
8. Preview the permitted exit.
9. See a truthful pending state during execution.
10. Receive a verifiable receipt or actionable blocking reason.

## UX rules

- One obvious primary action per state.
- Explain why disabled actions are disabled.
- Never collapse approval and execution into ambiguous wording.
- Repeat critical amount, asset, destination, slippage, network, and expiry at confirmation.
- Display user units and exact raw units where verification matters.
- Preserve entered values after recoverable errors.
- Use skeletons for predictable content, spinners for short actions, and step progress for signing/execution.
- Never show success before provider or chain confirmation.
- Provide copy buttons and explorer links for addresses, hashes, blocks, and transactions.
- Make LIVE, TESTNET, SIMULATED, and FIXTURE labels persistent.
- Put raw JSON and provider details behind disclosures.
- Errors state what happened, whether funds moved, and the safest next step.
- An uncertain transaction outcome must say not to retry until status is resolved.

## Essential usability test

A first-time viewer should answer these within 15 seconds:

1. What risk is ExitLane watching?
2. What action is currently authorized?
3. Can the agent send funds somewhere else?
4. Is this live, testnet, or simulated?
5. What is the next action?

