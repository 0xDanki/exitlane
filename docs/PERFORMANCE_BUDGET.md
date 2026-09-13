# Performance budget

Measure on a production build using a mid-range mobile profile where practical.

## User-facing targets

- Largest Contentful Paint: under 2.5 seconds
- Interaction to Next Paint: under 200 milliseconds
- Cumulative Layout Shift: under 0.1
- Immediate visual response to clicks: under 100 milliseconds
- No long task above 200 milliseconds during the primary flow

## Application budgets

- Keep the initial client bundle minimal; vendor server SDKs must never enter it.
- Avoid adding any single client dependency above roughly 50 kB gzip without a written decision.
- Lazy-load Attack Lab and noncritical technical panels.
- No charting library for the MVP.
- Reserve image dimensions and use optimized formats.

## External operations

- Every external request requires a timeout and typed timeout error.
- Show progress by stage for operations longer than one second.
- Cache supported-router discovery briefly; do not cache authorization decisions.
- Live market evidence must include its freshness timestamp and must expire according to the security model.
- Deduplicate identical in-flight risk and quote requests.
- Pause polling when the document is hidden and back off after provider errors.

## Verification

Record production bundle information, Web Vitals, and obvious regressions in `docs/STATUS.md` before the final demo.

