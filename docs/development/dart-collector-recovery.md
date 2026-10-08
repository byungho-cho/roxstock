# DART collector recovery — 2026-10-09

This fix is independent of pending value-analysis UI work. Base: b7b7470. Analysis branch and draft PR #137 remain untouched. The reason mappings first became empty is not established.

## Storage and preservation

- Expand only dart_backfill_tasks.error_code VARCHAR(20) to VARCHAR(64), preserving existing rows, indexes, status and history. Keep full NOT_DART_LISTED_EQUITY, DART_CORP_CODE_NOT_MAPPED and SECURITY_TYPE_NOT_APPLICABLE codes. Other free-form error fields already have 1000-character capacity.
- All dynamic task error-code writes use one contract: valid identifiers up to 64 characters are intact; oversized/untrusted identifiers use a stable SHA-256-derived identity rather than a colliding prefix. No sql_mode changes.
- Corporation ZIP/XML rejects error status, empty/invalid rows, malformed content, ambiguous or zero matched lists. No raw remote messages are logged. Empty input cannot reach DELETE.
- Validated replacement and corpCodeSyncedAt update share one transaction. Any insertion/state-write failure rolls back both. Financial filing tables and successful/no-filing tasks are not reset.
- Diagnostics use controlled Korean messages, safe codes, exception categories, stage/run ID and collector source locations. Raw Error.message/stack/cause/Prisma query/meta are not serialized. Failure bookkeeping and lock-release errors are logged separately from the original error. Accumulated successes survive top-level failure.
- No automatic scheduling, budget, retry policy or manual-prototype scope change.

## Recovery procedure

1. Save a server-local full DB dump, gzip-check/hash it; record mapping, filing, valuation and task counts.
2. Merge after required CI; Production Deploy takes an additional backup and applies additive migration before backend/worker start.
3. Confirm error_code capacity=64 and migration success. Read current mapping counts; if already restored by the normal worker, do not duplicate recovery.
4. If mappings remain empty, execute `docker exec roxstock-backend node backend/dist/scripts/recover-dart-mappings.js --apply`. This operator command takes the existing collector lock and API budget, fetches one validated corporation response, then uses normal syncCorporations. It does not reset tasks or collect financial history. If the lock is busy, wait for the active cycle rather than deleting its lock.
5. Compare pre/post counts and saved filing fingerprints. Request two representative stocks for one reported period through the existing manual refresh API; inspect status/results. No full recollection.
6. Do not roll back to old code by narrowing error_code: keep the wider compatible column if app rollback is needed.

## Pre-deployment evidence

- Operating revision b7b74700cc05346185f5b335e04dd36448d48e3b confirmed from container images.
- Verified backup: /root/roxstock-backups/dart-recovery-20261009/pre-deploy-20261008T230226Z.sql.gz (server-local .sha256 saved).
- 2026-10-09 08:03:34 KST: mappings 0; filings 26640; financialStatements 0; valuationMetrics 0; periodValuations 5427; backfillTasks 124368.
- Deployment/recovery results are appended to the fix PR after execution.
