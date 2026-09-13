# ExitLane design system — v1.5

**Status: final visual reference.**
All values below are locked for implementation. Never substitute raw color names,
hardcoded hex values, or arbitrary utility classes when a semantic token exists.

---

## Trust model

Three principles frame every interface decision:

| # | Principle | Meaning |
|---|-----------|---------|
| 1 | **Permission is clear** | Show what can be sold, how much, where it goes, and when permission ends. |
| 2 | **Proof comes first** | Make the price, signature, time, and one-use code easy to check. |
| 3 | **Software checks; AI explains** | AI can explain what is happening. It cannot approve or change a transaction. |

---

## Brand qualities

- Calm under pressure — never urgent while simply monitoring
- Precise rather than dramatic
- Protective without looking like generic cybersecurity software
- Financially credible
- Fast to understand during an incident

**Identity phrase:** "A safe path, planned early."

**Avoid in all design work:** charts, glow, gradients, visual promises of speed or
profit, trading language (alpha, opportunity, winning), or alarming color while a
mandate is simply watching the market.

---

## Source of truth

All visual values must enter the application through semantic CSS variables in the
global stylesheet. Components consume semantic roles, never primitive names or
hardcoded hex values.

---

## Color

### Primitives

Five values cover the entire palette. They are defined once and used only to
populate semantic tokens — never referenced directly in component styles.

| Name | Role | Hex |
|------|------|-----|
| **Midnight** | Foundation | `#011627` |
| **Paper** | Surface | `#FDFFFC` |
| **Aqua** | Verified | `#41EAD4` |
| **Magenta** | Armed | `#B91372` |
| **Red** | Critical | `#FF0022` |

### Semantic tokens

Default (light) mode. Dark-mode override swaps surface and text primitives;
status and action colors remain constant.

```css
/* ── Surfaces ──────────────────────────────────────────────── */
--surface-canvas:   #FDFFFC;                          /* Paper — page background      */
--surface-panel:    #FDFFFC;                          /* Paper — panels use border,   */
                                                      /*   not a different fill        */
--surface-elevated: #FFFFFF;                          /* Cards, modals, popovers      */
--surface-inverse:  #011627;                          /* Midnight — reversed sections */

/* ── Text ───────────────────────────────────────────────────── */
--text-primary:     #011627;                          /* Midnight                     */
--text-secondary:   #4B6275;                          /* Midnight ~60 % on Paper      */
--text-muted:       #8899A6;                          /* Midnight ~40 % on Paper      */
--text-inverse:     #FDFFFC;                          /* Paper — on Midnight surfaces */

/* ── Borders ────────────────────────────────────────────────── */
--border-subtle:    rgba(1, 22, 39, 0.10);            /* ~10 % Midnight               */
--border-strong:    rgba(1, 22, 39, 0.28);            /* ~28 % Midnight               */

/* ── Actions ────────────────────────────────────────────────── */
--action-primary:       #41EAD4;                      /* Aqua                         */
--action-primary-hover: #2BC4AF;                      /* Aqua darkened ~10 %          */

/* ── Status ─────────────────────────────────────────────────── */
--status-safe:    #41EAD4;   /* Aqua    — Verified, Monitoring, Authorized, Executed  */
--status-armed:   #B91372;   /* Magenta — Armed, Triggered; attention, not danger     */
--status-watch:   #B91372;   /* Magenta — alias for watch/triggered states            */
--status-danger:  #FF0022;   /* Red     — Blocked, Critical; always + "No funds moved"*/
--status-info:    #011627;   /* Midnight — neutral informational                      */

/* ── Focus ──────────────────────────────────────────────────── */
--focus-ring: #41EAD4;       /* 2 px solid ring, 2 px offset, on all :focus-visible  */

/* ── Shadow ─────────────────────────────────────────────────── */
--shadow-panel: 0 1px 3px rgba(1, 22, 39, 0.08),
                0 1px 2px rgba(1, 22, 39, 0.04);

/* ── Radius ─────────────────────────────────────────────────── */
--radius-control: 6px;       /* Inputs, buttons, badges, chips                       */
--radius-panel:   12px;      /* Cards, modals, disclosure panels                     */

/* ── Motion ─────────────────────────────────────────────────── */
--duration-fast:   120ms;
--duration-normal: 220ms;
--ease-standard:   cubic-bezier(0.2, 0, 0, 1);
```

**Color-use rules**

- Use one dominant accent. Aqua is the primary accent and the verified-state color.
- Magenta appears only for Armed and Triggered mandate states.
- Red appears only for genuinely blocking or critical states.
- Never use Red for warnings or caution while a mandate is monitoring normally.
- Status must never rely on color alone — always pair color with an icon and a text label.

---

## Typography

Three typefaces, each with a single job.

| Typeface | Source | Job |
|----------|--------|-----|
| **Literata** | Google Fonts | Display headings and section titles |
| **Hanken Grotesk** | Google Fonts | All body copy, labels, and UI text |
| **Fragment Mono** | Google Fonts | Prices, addresses, hashes, and signed values only |

```css
--font-serif: 'Literata', Georgia, serif;
--font-sans:  'Hanken Grotesk', system-ui, sans-serif;
--font-mono:  'Fragment Mono', 'Fira Code', monospace;
```

### Type scale

| Step | Typeface | Size / Line-height | Usage |
|------|----------|--------------------|-------|
| Display | Literata | 72 px / 70 px | Hero, marketing cover |
| Heading | Literata | 42 px / 44 px | Page and section titles |
| Body | Hanken Grotesk | 20 px / 30 px | Explanatory and instructional copy |
| Label | Hanken Grotesk | 13 px / 16 px | Field labels, captions, badge text |
| Data | Fragment Mono | 14 px / 21 px | Prices, IDs, addresses, signed values |

**Monospace restriction:** `--font-mono` is limited to prices, token amounts,
contract addresses, transaction hashes, block numbers, one-use codes, and raw
signed values. Prose and UI labels always use `--font-sans`.

---

## Spacing

4-point scale. No in-between values. Use tokens; do not reach for arbitrary numbers.

```css
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-6:  24px;
--space-8:  32px;
--space-12: 48px;
--space-20: 80px;
```

**Logo clear space:** leave one full mark-width of empty space around the ExitLane
lockup on all sides.

---

## Required primitives

Every component below must define these interaction states where applicable:
default, hover, focus-visible, active, disabled, loading, success, error.

Minimum touch / click target: **44 px** for all buttons and interactive controls.

### Button

| Variant | Appearance | Typical use |
|---------|------------|-------------|
| Primary | Aqua fill, Midnight text | One per page — the decisive action ("Sign & arm mandate") |
| Secondary | `--border-strong` border, `--text-primary` | Supporting actions ("Save draft", "Review evidence") |
| Destructive | Red border, Red text | Irreversible removals ("Revoke mandate") |
| Ghost | No border, `--text-secondary` | Low-emphasis inline actions |
| Disabled | Muted fill, muted text, `cursor: not-allowed` | Must explain why via tooltip or inline note |

### IconButton

Same size and state requirements as Button. Label provided via `aria-label`.

### Badge — mandate states

Pair each badge with an icon. Color alone is never sufficient.

| State | Color token | What it means |
|-------|-------------|---------------|
| Draft | `--text-muted` | Being configured, not yet signed |
| Armed | `--status-armed` (Magenta) | Signed; waiting for trigger conditions |
| Monitoring | `--status-safe` (Aqua) | Watching market price against trigger |
| Triggered | `--status-safe` (Aqua) | Conditions met; running permission checks |
| Authorized | `--status-safe` (Aqua) | All checks passed; execution queued |
| Executed | `--text-secondary` (neutral) | Completed successfully; show receipt |
| Blocked | `--status-danger` (Red) | Execution stopped — must show "No funds moved" |
| Expired | `--text-muted` (neutral) | Time window closed before trigger |

### Input

- Label above the field — never placeholder-only.
- Helper text below the field states the constraint in plain language.
- Error text replaces helper text; must say what happened, whether funds moved,
  and the safest next step.

### Select

- Show a "Fixed by the plan" caption when options are constrained by the signed mandate.
- List non-approved options as visually unavailable with a one-line reason.

### Field

Wraps Input or Select with label, helper/error text, and optional prefix/suffix.

### Card

Uses `--surface-elevated`, `--shadow-panel`, `--radius-panel`. Never nest cards.

### Alert

Variants: info, safe (Aqua), armed (Magenta), danger (Red). Always includes icon + text.

### Skeleton

For predictable-shape content that loads asynchronously. Never pulse Aqua or Red.

### Dialog

One primary action; one secondary or dismiss action. Destructive action is right-aligned
and always labeled with what it destroys.

### Disclosure

Raw JSON, provider responses, and transaction calldata live inside a Disclosure.
Default state: collapsed. Label states what is inside ("Show raw transaction").

### DataRow

Key-value pair. Key uses `--font-sans` Label; value uses `--font-mono` Data for
addresses, amounts, and hashes.

### StepIndicator

Horizontal sequence showing mandate lifecycle:
**Signed → Armed → Monitoring → Triggered → Authorized | Blocked | Expired**

Only the current and completed steps are filled. Future steps are outlined and muted.

### TransactionStatus

Shows live execution state with step progress. Never shows success before chain
confirmation. Pending states use a spinner; multi-step signing uses StepIndicator.

---

## Safety-check summary

Display as `n / n` (e.g. `8 / 8`) with the label "Signed rules checked".
When not all checks pass, show each failing rule individually before the count.
The count itself uses `--font-mono`.

---

## Blocked state

Every blocked state must contain all four of these elements:

1. A persistent **"No funds moved"** badge using `--status-danger`
2. A title: "Execution blocked"
3. A plain-language explanation that names the signed constraint and the observed value
4. A "View mismatch" Disclosure containing the full evidence for technical review

---

## Evidence table (DataRow grid)

Used to prove that each signed rule was evaluated. Column order is fixed:

| Check | Signed constraint | Observed evidence | Result | Effect |
|-------|-------------------|-------------------|--------|--------|
| Market trigger | ETH ≤ $2,150 | $2,143 · 12s old | Match | Continue |
| Maximum amount | ≤ 25.000 ETH | 25.000 ETH | Match | Continue |
| Exchange + sale details | Uniswap V3 · approved | Exact match | Match | Continue |
| One-use code | 0x7C…91A | Unused | Valid | Allow sale |

- "Result" and "Effect" cells use `--status-safe` for Match / Continue,
  `--status-danger` for Mismatch / Blocked.
- Amounts and addresses use `--font-mono`.
- Evidence age must appear next to observed values (e.g. `$2,143 · 12s old`).

---

## Patterns

### Exit Mandate card

Display in this order:

1. Mandate ID (`EL-2048`) in `--font-mono` and human name
2. Intent line: "Sell up to {amount} {asset} for {destination asset}" — amount in `--font-mono`
3. Activation price in `--font-mono`
4. StepIndicator at current state
5. Permission-check summary (`8 / 8 signed rules checked`)
6. Evidence freshness label
7. Signature and one-use code status

### Data freshness

Always show evidence age next to its value. Stale data applies `--status-watch` to
the timestamp only — not to the amount or price value itself. Define "stale" per
the mandate's expiry and the product specification.

### Persistent environment labels

One of these labels must be visible at all times in a fixed position that does not
scroll away:

| Label | When shown |
|-------|-----------|
| **LIVE** | Connected to mainnet with real funds |
| **TESTNET** | Connected to a public test network |
| **SIMULATED** | Running against mocked or forked data |
| **FIXTURE** | Static test data, no network calls |

---

## Page hierarchy

Every screen must answer these five questions, in this order, within 15 seconds:

1. What risk is ExitLane watching?
2. What action is currently authorized?
3. Can the agent send funds somewhere else?
4. Is this live, testnet, or simulated?
5. What is the next action?

Translated into layout priority:

1. Current treasury safety state
2. Live evidence and freshness
3. Exit Mandate constraints
4. Primary action
5. Execution progress or blocking reason
6. Expandable technical evidence

---

## Accessibility

- Status signals require color + icon + text. Color alone is never sufficient.
- All interactive elements must display a visible `--focus-ring` on `:focus-visible`.
- Motion must respect `prefers-reduced-motion` — disable transitions, not content.
- Minimum contrast: 4.5:1 for body text; 3:1 for large text and UI components (WCAG 2.2 AA).
- "No funds moved" text must remain in the DOM during blocked states — not only visually rendered.
- Use semantic landmarks (`<main>`, `<nav>`, `<section>`, `<aside>`).
- Provide accessible names for all icon-only controls (`aria-label`).
- Never collapse approval and execution into ambiguous wording.

---

## Voice and writing

### Write this way

- "The plan is armed. Nothing can be sold until ETH is at or below $2,150."
- Name the rule, the expected value, and what was found: "Signed maximum is 25 ETH. Requested amount was 42 ETH."
- Say **"No funds moved"** whenever execution is blocked, before anything else.
- Describe AI as an explanation tool, not a decision-maker: "The AI has summarized the evidence below."
- Use plain language first; put protocol detail inside a Disclosure.
- Preserve entered values after recoverable errors.

### Avoid

- "AI approved the trade" or any phrasing that implies AI authorizes transactions.
- Trading language: alpha, opportunity, winning, upside, returns.
- Raw transaction calldata or ABI when a plain summary is available.
- Urgent color or language (Red, alarming phrasing) while a mandate is simply monitoring.
- Unexplained abbreviations in primary copy.
- Optimistic success states before provider or chain confirmation.

---

## Implementation contract

- No hardcoded colors in components.
- No arbitrary Tailwind spacing, radius, shadow, or color values when a semantic token exists.
- Shared primitives own variant styling; one-off overrides are a code smell.
- Status never relies on color alone — always pair with an icon and a text label.
- One dominant accent: Aqua. Magenta is reserved for Armed/Triggered states only. Red is reserved for genuinely blocking or critical states.
- `--font-mono` is limited to addresses, hashes, amounts, prices, one-use codes, and signed values. All other text uses `--font-sans` or `--font-serif`.
- Motion communicates state change; it is not decoration. Respect `prefers-reduced-motion`.
- "No funds moved" is required on every blocked-state surface.
- "Software checks; AI explains" is the trust model — the interface must never invert it.

When final visual token values change, replace them in this file without altering
the semantic contract or the implementation-contract section above.
