# Live quote colors, target alert management and menu notifications

Release 1.2.61. Implementation and local verification completed; production verification is pending.

- Price, daily change and rate keep their daily rise/fall/flat color before and after sessions. Genuine live timestamps use the green token; closed, waiting, retained and delayed values use muted timestamps. Unknown REST quote timestamps display a dash, and a REST seed cannot overwrite a genuine last trade.
- Target alert manager has a right-aligned symbol filter. Card bells open the selected symbol; the toolbar bell-plus opens all conditions and lets the user choose a displayed/saved-condition symbol for a new alert. The title announcement icon opens arrivals. Monitor notices moved to the existing clickable explanation component; action errors remain visible.
- Both bottom navigation and More use Home, Dashboard, Stocks, Live Quotes, Journal, Stock News, Cash, followed by the remaining existing entries. The static live-menu red dot is removed. Bottom Live Quotes and Stock News show a 7px red dot only for real unacknowledged arrivals/unread news.
- Alert status shares the existing user-scoped query/cache. News status uses a private, account-scoped boolean endpoint that selects at most one unread ID, without loading article bodies or triggering collection. Confirmed read actions invalidate this status. No schema or tick-history storage change.
- The temporary preview override and query-parameter handler were removed entirely. Old preview URLs cannot force indicators.

## Validation

- Quote browser suite: 64 passed, cover/tablet.
- Target alert browser suite: 26 passed, cover/tablet, including scoped manager/addition and real-arrival menu-dot clearing.
- News read/layout browser suite: 20 passed, cover/tablet, including menu-dot clearing after confirmed bulk reads.
- Policy/socket/API/alert domain tests: 22 passed.
- Shared, backend and collector TypeScript checks; frontend production build; diff checks passed.
- Dedicated local news-read DB integration passed, including unread status, ownership isolation and persistence. Existing alert DB integration also passed during this change set.

## Deployment preparation

Previous image/runtime references and before-state digests were preserved privately. Required CI and the production pipeline must finish before recording success. The pipeline verifies its server-local SQL.GZ backup. Rollback uses the preserved images/configuration, without overwriting subsequent valid DB writes. Historical collection boundaries/retired queues and existing alert configuration/event digests will be compared after deployment. No past collection is resumed.
