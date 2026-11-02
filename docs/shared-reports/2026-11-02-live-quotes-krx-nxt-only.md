# KRX/NXT pair subscriptions and internal automatic view

Release: 1.2.60. Replaces the 1.2.59 physical TOTAL/fallback subscription policy.

## Behavior

- Registration stays limited to 20 symbols. Every requested symbol has one shared KRX/NXT pair, irrespective of screen market or alert market. Twenty distinct symbols consume 40 of the 41 global slots. An entire additional pair is rejected explicitly; a partial pair is never silently admitted.
- Provider TOTAL subscriptions are forbidden at the socket command boundary. The UI TOTAL value is an internal alias of one complete physical quote, with its source market and genuine timestamp preserved.
- Regular session prefers fresh KRX; extended session prefers fresh NXT. A fresh alternate venue can fill an unavailable/stale preferred venue. Without a fresh trade, keep the most recent genuine trade and its status; do not relabel old values as live.
- Direct KRX/NXT views retain their exact market values. Switching views or crossing a session boundary does not recreate physical subscriptions. Physical sequence counters are never compared across venues.
- Alert conditions keep their saved logical market; automatic conditions follow the same quote selection. No tick history or additional per-second DB writes.

## Local verification

- Shared, backend and collector TypeScript checks passed; frontend production build passed.
- Policy, socket, API and alert domain tests: 22 passed. Includes 40-slot budget, no physical TOTAL command, reconnect, replay protection, direct-view isolation and session selection.
- Alert DB integration: 1 passed using the dedicated local test database.
- Cover/tablet browser regression results and production verification will be recorded after completion.

## Deployment protection

No schema, credentials, user investment data or historical collection policy change. Before deployment, preserve the previous runtime configuration/image references and compare collection boundaries, retired task counts and alert configuration digests. The deployment pipeline creates and verifies a server-local SQL.GZ backup. Code rollback uses prior images/configuration without restoring the DB over new records.

Production deployment and live reception are pending at the time of this implementation record.
