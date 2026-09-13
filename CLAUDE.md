# ExitLane repository instructions

ExitLane lets a treasury owner sign a bounded, expiring Exit Mandate that an automated agent may invoke but may not alter.

## Product and delivery priority

Read `docs/PRODUCT_SCOPE.md` before implementation. It is authoritative for
ExitLane's purpose, scope, AI boundaries, and demo journey.

This is a seven-hour ETHOnline 2026 build. Prioritize, in order:

1. A reliable end-to-end vertical slice.
2. Deterministic authorization and visible rejection cases.
3. Clear, polished operator UX using `docs/DESIGN_SYSTEM.md`.
4. Real, honestly labeled partner integrations.
5. Submission documentation.

Do not expand the product into generalized trading, portfolio management,
multi-chain infrastructure, or organization administration.

1. `docs/PRODUCT_SCOPE.md`
2. `docs/STATUS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/SECURITY_MODEL.md`
5. `docs/DESIGN_SYSTEM.md` for user-interface work
6. The task-relevant specification under `docs/`

Treat those documents and `.cursor/rules/*.mdc` as the repository's source of truth. If code and documentation conflict, stop and identify the conflict rather than silently choosing one.

## AI boundary

ExitLane permits exactly two application-level AI workflows:

1. Convert an operator's plain-language emergency plan into an untrusted,
   schema-validated mandate draft. Missing values must remain unresolved.
2. Explain normalized Graph evidence and an already-computed deterministic
   policy result in plain language.

AI cannot authorize execution, override policy, select trusted transaction
fields, generate or approve calldata, consume a nonce, or access credentials.
The deterministic policy engine is the sole authorization authority.

- Never read, print, modify, or request the contents of `.env.local`, PEM files,
  private keys, authorization headers, or credentials. You may ask the operator
  to confirm whether a specifically named environment variable is present.


## Working method

- For multi-file work, first state the intended behavior, affected files, trust boundaries, and verification plan.
- Make the smallest coherent change that satisfies the current acceptance criteria.
- Follow existing patterns. Do not introduce a second architecture for the same concern.
- Do not install a dependency until you explain why the platform or existing dependencies cannot solve the problem.
- Inspect current official documentation and installed TypeScript definitions before using external SDK methods.
- Never invent API fields, contract addresses, router addresses, Subgraph fields, transaction receipts, or successful external responses.
- Never weaken types, validation, policies, or tests merely to make a build pass.
- Do not use `any`, non-null assertions, silent catches, placeholder success responses, or unsafe type casts without a documented reason.
- Keep secrets server-side. Never read, print, modify, or ask for `.env.local`, PEM files, private keys, authorization headers, or credentials.
- Run relevant tests during implementation and the complete `pnpm check` before declaring a phase complete.
- Update `docs/STATUS.md` after every completed phase or newly discovered blocker.
- Add durable architectural/security decisions to `docs/DECISIONS.md`.

## Definition of complete

A task is complete only when behavior, validation, failure states, tests, documentation, accessibility, and performance implications have been addressed. See `docs/DEFINITION_OF_DONE.md`.

## Verification and phase completion

- Run the checks relevant to the files changed.
- Before declaring an implementation phase complete, run `pnpm check` if that
  script exists; otherwise run lint, typecheck, tests, and build separately.
- A phase is complete when its stated acceptance criteria, security-relevant
  failure states, tests, and required documentation are addressed.
- Do not add unrelated work merely to satisfy the full-project definition of done.
