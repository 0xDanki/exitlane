# Architecture and product decisions

Record decisions that would otherwise be rediscovered or contradicted in a later AI session.

| ID | Date | Decision | Reason | Tradeoff/status |
|---|---|---|---|---|
| D-001 | YYYY-MM-DD | AI is advisory; deterministic policy authorizes execution. | Prevent model output from becoming wallet authority. | Accepted |
| D-002 | YYYY-MM-DD | Base mainnet data may drive a clearly labelled Base Sepolia execution demo. | Obtain real market evidence without risking mainnet funds. | POC only |
| D-003 | YYYY-MM-DD | Use native ETH input for the first swap. | Avoid Permit2 approval complexity in the initial demo. | Revisit after MVP |
| D-004 | YYYY-MM-DD | Keep one price-threshold trigger. | Preserve auditability and delivery speed. | Accepted |

For new entries include the rejected alternatives and the evidence that caused the decision.

