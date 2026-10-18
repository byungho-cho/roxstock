# Portfolio RIM input reconciliation · 2026-10-18

The requested active-account holding, watchlist and traded union contained 38 securities. Product exclusions and the unmapped fund were preserved; 34 ordinary stock securities were eligible for the valuation view.

## Data review

- Reconciled 25 annual rows across 10 securities against the exact stored DART receipt, parent profit, opening/closing parent equity, and common outstanding shares. BPS had to match the recomputed value exactly; ROE had to match its original provider precision (two decimals for the annual provider, four for DART). Every original metric value was preserved. Only per-metric evidence was repaired; inherited total-equity attribution was not treated as proof.
- Retrieved the existing bounded annual provider adapter for seven remaining securities, sequentially with a 2.1-second minimum interval. Saved five 2026 estimates and six final annual records for two securities (2023–2025). Final metric groups were refreshed together from one provider; previous values and provenance are retained in the review evidence and private before-image backup. No DART quota was increased or bypassed, and no raw DART financial statement was overwritten.
- After the data update, the 2026 view had 34 fair prices and 32 shareholder totals, versus 18 and 17 before this task. These are computed display counts, not positive-price or investment recommendations; the existing formula can return a negative value. Estimated and final periods remain labelled separately.

## Code

The same-provider parent-equity/ROE validation already used for estimates now also accepts a final annual record. Final and estimated kinds, year, CFS attribution, exact stored ROE and source must agree. Final capital comes from that final provider record, never an estimate or an older DART statement. Total value needs no share denominator. Adjusted-share reconciliation remains unavailable when not independently proven; no displayed share count is substituted and the existing per-share formula is unchanged.

Value projection schema 7 invalidates older totals, accepting old schema 6 for a rebuild that preserves the price snapshot. Database schema is unchanged. Both automatic and manual saved annual source records use the shared projection, without a new external call in GET requests.

## Validation and rollout

Relevant calculation tests: 36 passed. Backend route/cache/transport tests: 17 passed before the cache schema increment; the final cache regression also covers old schema 6. Shared compilation and backend TypeScript passed. CI must pass before merge.

Verified full backup and private row before-images reside under the existing protected deployment backup procedure, outside Git. Roll back application code with the previous 1.1.14 immutable images; extra JSON evidence remains backward compatible. Restore only the affected metric rows from the protected before-images under the common financial lease if a data rollback is needed. Avoid a full DB restore over subsequent trading or collection changes. No migration or native change; no APK deployment.

Expected after the code rollout: 34 fair prices and 34 shareholder totals in the current-year eligible scope. Confirm with the deployed API before reporting this as completed. Historical periods not covered by confirmed evidence retain their original unavailable reason.
