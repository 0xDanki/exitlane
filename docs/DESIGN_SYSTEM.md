# ExitLane design system

Status: provisional structure. Visual direction and final token values will be designed separately.

## Brand qualities

- Calm under pressure
- Precise rather than dramatic
- Protective without looking like generic cybersecurity software
- Financially credible
- Fast to understand during an incident

## Source of truth

All visual values must enter the application through semantic CSS variables in the global stylesheet. Components consume semantic roles, never raw color names or hardcoded hex values.

Required token groups:

```text
--surface-canvas
--surface-panel
--surface-elevated
--surface-inverse
--text-primary
--text-secondary
--text-muted
--text-inverse
--border-subtle
--border-strong
--action-primary
--action-primary-hover
--status-safe
--status-watch
--status-danger
--status-info
--focus-ring
--shadow-panel
--radius-control
--radius-panel
--space-*
--font-sans
--font-mono
--duration-fast
--duration-normal
--ease-standard
```

## Implementation contract

- No hardcoded colors in components.
- No arbitrary Tailwind spacing, radius, shadow, or color values when a token exists.
- Shared primitives own variant styling.
- Status must never rely on color alone; pair color with icon and text.
- Use one dominant accent. Reserve danger color for actual blocking/risk states.
- Monospace is limited to addresses, hashes, amounts requiring alignment, and raw evidence.
- Motion communicates state change; it is not decoration and must respect reduced motion.

## Required primitives

- Button
- IconButton
- Input
- Select
- Field
- Card
- Badge
- Alert
- Skeleton
- Dialog
- Disclosure
- DataRow
- StepIndicator
- TransactionStatus

Each interactive primitive requires hover, focus-visible, active, disabled, loading, success, and error behavior where relevant.

## Page hierarchy

1. Current treasury safety state
2. Live evidence and freshness
3. Exit Mandate constraints
4. Primary action
5. Execution progress or blocking reason
6. Expandable technical evidence

When final visual work begins, replace token values and component specifications here without changing the semantic contract.

