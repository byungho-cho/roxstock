# C1500 / T1500 investment v0.4 — 2026-10-05

Branch: codex/investment-v04-20261005. Base main: b1cc75fd77a26c68adf0719f4e2ff2dc34e86e16.
Preserved other work: open PR #83 (user-test fixes), no modifications to that branch.

Figma FINAL: cover 3382:2, tablet 3383:2 in HFguP6QYb6xnO9FRsjYlc2.
Implement year, current evaluation, three-column summary, chart/quarter controls and descending daily investment history. Cover body scroll; tablet independent columns; 8px gutters/gap, 44px header/navigation, 80px clearance, existing 4px overlay scrollbars. Reuse common nav assets, download exact 32px year arrow assets. No pull-to-refresh added.

## Existing data contract and limits

Investment route was a placeholder, not an implemented screen. There is no investment-specific API or persisted initial investment field in Account or DailyAccountSnapshot. Reuse asset-history and cash-transactions APIs, fetching all 100-row pages before publishing a combined result.

Annual card/summary use the last successful selected-year daily account snapshot (totalAssetValue and updatedAt), never a Figma example or a live valuation mixed with daily rows. Current year ends at Seoul today; historical year ends December 31. Quarter filters chart/table only and includes endpoints. Existing Figma 2010–current year cycling is implemented on arrows/swipe.

Initial investment: null / —, with an unregistered caption; no first deposit, first snapshot or compound-plan amount is inferred. Future initial-investment registration requires an explicit persisted field and baseline rule.

Cumulative investment: recorded DEPOSIT amounts minus WITHDRAWAL amounts from all account history through each snapshot's Seoul date and collection timestamp. BUY/SELL/DIVIDEND are excluded. Decimal(19,4) arithmetic uses scaled bigint; round only at display. There is no automatic adjustment for manual balance correction or missing opening deposits. Displayed principal is based on registered external flows, not a fabricated opening amount.

Dividend: selected-year DIVIDEND netAmount through the last snapshot cutoff. Gross dividend never substitutes for a missing net value. No dividend is added to principal.

Cash created after a snapshot does not enter that snapshot. Records modified after a historical cutoff cannot reconstruct their former value; affected principal/dividend values are unavailable rather than retroactively estimated. Deleted transactions cannot be reconstructed by these APIs; full historical auditing needs a separate immutable flow snapshot/version history. Existing edits/deletes and cash rules are untouched.

Evaluation minus cumulative investment gives the card difference; rate is unavailable when principal <= 0 or either input is missing. All summary values stay unfiltered by quarter. Query keys isolate account/year, AbortSignal cancels old fetches, and one query publishes snapshot/flow result atomically. Refresh/errors retain the last successful data for that same query, never substitute another account/year.

## Validation / restart checkpoint

Implementation completed; TypeScript, build and 24 targeted browser cases pending. Broad regression/Figma comparison QA intentionally not run. Tests cover pagination, quarter/year boundaries, Seoul current quarter, summary invariance, row geometry/clipping/clearance, independent scrolling, delayed account requests, refresh/error retention, retry and missing/empty states at 370×465, 400×640, 725×396, 816×616.

Next: push implementation checkpoint, open PR, record individual TypeScript/build/function run IDs/results. Merge only after required checks, then verify automatic frontend deployment. Preserve passed checks unless corresponding input changes.
