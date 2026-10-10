# Pending value-analysis UI release — 2026-10-09

- Value analysis accepts Korean initial-consonant and mixed literal/initial searches while preserving name/code matching.
- Remove selected-card border highlight; center market label with KOSPI yellow and KOSDAQ green.
- Financial refresh dialog uses 24px side margins and 16px vertical margins within the viewport.
- Latest main includes the definitive DART collector fix. The old local code-truncation experiment is excluded.

Validation: backend/frontend TypeScript and builds pass; search helper/API tests 5 pass; existing search and refresh-dialog browser regressions 4 pass at 370x465 and 725x396. Browser checks use mocked data, not live collection. Frontend build retains its existing bundle-size warning.

No collection policy, production data or draft analysis/operations PR changes. PR merge starts the existing automated deployment; production completion is not awaited per the user's standing instruction.

## 2026-10-11 value/stock-summary performance verification

- Baseline: local DEV API/DB, Vite, 1280×720, no CPU/network throttle; collector running; 3 direct-navigation samples median. Value list 4.048s, stock summary 1.779s. Browser cache remains enabled; document navigation recreates application query cache. Not a production or device benchmark.
- Intermediate optimized measurement: value list 1.928s (1.893/1.928/2.082), stock summary 1.377s (1.356/1.478/1.377), requests 15→12 for summary. Subsequent initial-account query deduplication is also tested; these timings precede that final change. Server cache residency varies and the small sample is descriptive, not an SLA.
- Real MariaDB read-only comparison: old/new list handlers executed within the same RepeatableRead transaction. All 2,590 rows for each of 2025 and 2026, including full response fields and ordering, match exactly. Existing live-source snapshot comparison without a shared transaction had 21 changing 2026 ROE/date rows while the collector ran; it is not treated as a regression.
- Targeted backend/domain and frontend unit tests initially 17 passed; full backend suite 180 passed. New raw-cache cancellation/invalidation, account isolation, capital skipping and source reuse tests verify mutation refresh without changing arithmetic.
- Browser fixture coverage: 370×465 and 725×396; all tabs/swipe, previous/next bounds, list ordering, search, stale response isolation, empty/error/retry, period selection, summary/profit/year links, both back paths and scroll restoration. New tests check zero current-stock Lot/trade-detail reads on summary, preserved neighbor prefetch, capital only on profit detail, shared full-trade source, and no value-list refetch within a fresh cache.
- Exploratory 54-case browser run found 10 existing failures (5 scenarios × 2 sizes): classification expects an absent button although main renders it disabled; list/home pull refresh; drag from a buy button. A one-time run with latest main frontend source reproduced all 10 failures. These are separate from the improvement regression scope, not reported as passing. Existing Q4 refresh-selector warning was also observed.
- No operating DB writes or user transaction submissions were performed. Real-device, operating deployment timing, network throttling and exhaustive all-account/all-year mutation UI verification remain untested. Automatic deployment is not awaited, per standing instructions.

Final local measurements after account-startup deduplication: value list 1.559/1.490/1.510s (median 1.510s), stock summary 1.171/1.128/1.123s (median 1.128s). Fresh-cache SPA value reentry 0.637s with zero value-analysis requests; the first menu transition was 1.237s and fetched the list/detail. Temporary probes are removed. These are Vite/DEV observations with normal browser/server caches, not a controlled production-speed claim.

Final regression subset: 44 passed across cover/tablet, excluding only the 10 failures separately reproduced on main. Run from repository root: `npm exec --workspace frontend -- playwright test --config playwright.performance.config.ts --grep-invert 'classification button|pull translates|home card pull|detail blank body'`. Full exploration including those scenarios is available by omitting the filter. Backend suite 180 passed; frontend focused unit suite 8 passed. Frontend/backend TypeScript and builds pass; the existing large frontend bundle warning remains.
