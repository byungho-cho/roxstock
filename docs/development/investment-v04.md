# C1500 / T1500 investment v0.4 — 2026-10-05

> 2026-10-07: 평가금액 아래 차액을 연간 매도 실현손익/누적투자금 비율로 교체한다. 분기 필터와 평가금액 원본은 유지한다. [후속 계약/검증](./improvements-12-20261007.md) 참조.

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

Implementation checkpoint: ae255eb20bc3670e467b5dca18fe426f884d414d, PR #84.
Frontend Check run 37242532687: TypeScript job 111553955231 and Build job 111553955247 both passed.
Investment run 37242532696: 18 passed, 6 failed. Four synthetic swipe checks omitted TouchInit identifier; one tablet nav selection was a product defect (cover value applied, tablet value missed); tall tablet left column has no overflow and should not expect scrolling. Fixed event construction, tablet active item and conditional scroll expectation, retaining the short-tablet and all long-list scroll checks. Also checked pure monetary cases: exact flow precision, separate net dividend, zero denominator, large amount rounding and unavailable edited historical principal.
Cash pagination rejects changing total counts and repeated IDs rather than silently double-counting during a concurrent update. Chart card adjusted to 230px. Re-run only after these related source/test changes.

Broad regression/Figma comparison QA intentionally not launched. Existing stock/journal workflows also start automatically because common navigation changed; their executions are preserved. Tests cover pagination, quarter/year boundaries, Seoul current quarter, summary invariance, row geometry/clipping/clearance, independent scrolling, delayed account requests, refresh/error retention, retry and missing/empty states at 370×465, 400×640, 725×396, 816×616.

Correction checkpoint: 8563acc4793b70e560f97b02e878f1b1e2731af5. Investment run 37242844267: all 24 cases passed. Frontend Check 37242844349: TypeScript and build passed again after related source changes.

Final refinement: query key keeps the same account/year on a Seoul date rollover, retaining the last successful snapshot during refresh. Historical flow dates/amounts are parsed once per transaction, not once per snapshot; cash-history uses the existing DEPOSIT/WITHDRAWAL/DIVIDEND type filter to avoid paging irrelevant trades. Final 28-case scope adds the largest Decimal(19,4) value, zero principal, modified historical deposits and changing pagination totals. Previous successful results remain recorded; only these related changes need validation.

Final application SHA: 91c326cfa2b31ec77ce4790bb2bc575ce07667a6. Frontend Check 37243070165: TypeScript and build both passed.
Investment run 37243070077: 25 passed, 3 failed. All 24 core tests passed on the final application. The extra scenario passed on 816×616 in 25.5s; three smaller-size copies ran out of their overall 30s budget after multiple reloads, rather than failing a function assertion. Increase only that journey's overall test budget to 60s; preserve each assertion's 5s wait and every check.

The next workflow will repeat those four related cases only if application inputs/configuration are identical to 91c326c and the entire test diff is solely the added timeout metadata. This explicit, recorded reuse preserves the 24 passing cases without masking any failed scenario; all other source/test differences run the whole requested-scope suite. TypeScript/build inputs are unchanged and their prior success is reused.

Production API smoke read: accounts, asset-history and filtered cash-transactions all returned HTTP 200; snapshot updatedAt and cash createdAt exist. No operating financial values were logged.

Validation completed:
- Final application inputs: 91c326cfa2b31ec77ce4790bb2bc575ce07667a6.
- Test metadata/scope checkpoint: dafc91e3b8ec4d09d635b93c79e2f2b7f562236d.
- Investment run 37243523037, job 111556796014: only the four changed journeys ran; 4 passed (1.4m). Combined with the unchanged 24 core cases from 37243070077, all 28 requested-scope cases pass on the same application input.
- Frontend Check 37243523131: TypeScript/build success via verified cache; npm/typecheck/build steps were skipped, confirming no duplicate execution.
- Existing automatic stock check passed; journal check status is tracked through the PR. No formal whole-app QA was dispatched.
- No unresolved failure in the requested feature scope. Known data limits above remain explicit.

Next: merge PR #84 and verify automatic frontend deployment. Final deployment SHA/run/result will be recorded in the PR body, linked at https://github.com/byungho-cho/roxstock/pull/84. No further app changes or user screen confirmation are required.
