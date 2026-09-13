# Definition of done

A change is complete only when all applicable statements are true.

## Behavior

- Acceptance criteria are demonstrably satisfied.
- Loading, empty, success, recoverable error, terminal error, and uncertain states are handled.
- No placeholder success data remains on a live path.

## Architecture

- Dependency direction is preserved.
- Domain rules are not duplicated in routes or components.
- New external behavior is isolated behind a typed adapter.
- Architectural changes are recorded in `docs/DECISIONS.md`.

## Security

- Inputs are authenticated and validated at boundaries.
- Authorization is enforced server-side.
- Negative and boundary tests exist.
- Secrets and sensitive values are absent from client code and logs.
- Failure is closed and transaction retry behavior is safe.

## Frontend and UX

- Semantic design tokens are used.
- Keyboard, focus, labels, contrast, reduced motion, and screen-reader behavior are considered.
- Critical values and network/live-state labels are visible.
- Success is not shown optimistically for irreversible operations.

## Performance

- No unnecessary client boundary or large dependency was added.
- External requests have timeouts and duplicate protection.
- Loading does not cause major layout shift.

## Verification

- Relevant narrow tests pass.
- `pnpm check` passes.
- Documentation and `docs/STATUS.md` are current.
- Claims are backed by command output, provider response, or public transaction evidence.

