# ExitLane repository instructions

ExitLane lets a treasury owner sign a bounded, expiring Exit Mandate that an automated agent may invoke but may not alter.

## Read before editing

Read these files before any multi-file change:

1. `docs/STATUS.md`
2. `docs/ARCHITECTURE.md`
3. `docs/SECURITY_MODEL.md`
4. The task-relevant specification under `docs/`

Treat those documents and `.cursor/rules/*.mdc` as the repository's source of truth. If code and documentation conflict, stop and identify the conflict rather than silently choosing one.

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

