# Fiscal duration verification and report reconciliation

This change is local development work following the 2026-10-18 receipt-period recovery.
It does not reinterpret every annual report as a twelve-month financial year.

## Verification and calculation

- The official DART major-account endpoint `fnlttSinglAcnt.json` supplies dated flows and balances. See [DART documentation](https://opendart.fss.or.kr/guide/detail.do?apiGrpCd=DS003&apiId=2019016).
- Match the stored receipt, API year/report code, stock code, CFS/OFS division and KRW currency. Closing total equity and cumulative net income must equal the stored filing. When the net-income account is unavailable, both revenue and operating income must independently reconcile instead; one unrelated flow is insufficient.
- Match interim cumulative income (`thstrm_add_amount`) when supplied, rather than the standalone quarter amount. Complete calendar months use a 12/month-count factor. Irregular formation periods retain the exact inclusive days and explicitly use ACT/365 annualization; they are never rounded to a quarter. The span is bounded to at most twelve touched months and 366 days, ending on the stored filing date.
- Preserve the evidence in `period_valuations.supplemental.fiscalDuration`. The source filing and raw reported amounts are unchanged.
- Use the verified span to annualize disclosed basic EPS and ROE. PER uses that EPS and the separately validated historical price/share basis. These are annualized period ratios, not TTM ratios.
- Opening equity is accepted only when the same receipt's comparative balance date is exactly the day before the verified start. A previous calendar year's capital is not substituted for a short fiscal year's opening balance.
- BPS/PBR are period-end measures and can be calculated independently of flow-duration verification. Missing shares, owner equity, prices, or corporate-action evidence still prevent their calculation.
- Retain existing non-null values. Unproven periods remain warnings; no correction-chain or currency safeguards are relaxed.
- Manual and automatic collection reuse `loadPeriodSupplement`. The durable queue adds a duration-policy version only for reviewed fiscal sources, preserving unrelated terminal jobs and existing bounded scans/quotas.
- Chart notes show the actual date range, month count and annualization basis. Calendar-quarter subtraction and calendar-year growth remain disabled for reviewed nonstandard periods.

## Reports

`collection_bug_occurrences` gains nullable `resolved_at` and `resolution` fields. Every original event key and timestamp remains available.

Reconciliation reads at most 50 occurrences per page, checks current period evidence, and conditionally marks repaired occurrences resolved. A report is automatically resolved only when none of its occurrences remains active. It does not treat unrelated API/storage failures as repaired.

Receipt/end-period reviews and duration reviews have different completion criteria. Verified receipt/period evidence resolves the former; verified duration resolves the latter. Missing EPS/ROE caused by duration review is superseded by the duration warning, preserving its history. A later genuine missing metric can still generate a new occurrence.

PER/PBR reports with the same price/basis error share one canonical fingerprint. Legacy groups are moved in batches of at most 50 events, retaining event keys and counts. Differing human review notes are retained rather than silently discarded; such groups require manual review instead of an automatic merge.

Cards distinguish distinct unresolved stock/period targets from historical occurrence counts. Recent detail entries fold repeated targets while retaining their repeat count. Manual resolution records an occurrence-level review decision; genuine subsequent failures can reopen the report.

## Local execution, migration and rollback

- Back up the local DB before applying `20261018000000_bug_occurrence_resolution` or running recovery. Recovery helpers, checkpoints, dumps and credentials stay outside Git.
- Both migrations are additive: `20261018000000_bug_occurrence_resolution` adds the fields; `20261018000100_preserve_reviewed_bug_occurrences` carries existing human-resolved report states into their occurrences. Old application images ignore the nullable columns. Deploy migrations before new code.
- Code rollback can leave these columns in place. To remove them later, stop the new reporter, drop the `collection_bug_occurrences_resolved_at_event_key_idx` index and the two added columns. This discards resolution metadata, so back it up first.
- Reversing financial supplementation requires the pre-run backup or a targeted reviewed restore, not simply reversing the schema migration.
- Recovery is local-only and sequential under the existing financial lease/heartbeat/fencing and API budgets. No production data or deployment is changed by this procedure.

## Validation

Tests cover three-month annual reports, cumulative interim amounts, exact receipt/identity/amount matching, opening-date rejection, annualization, independent BPS/PBR, source-version behavior, partial report resolution, common price-cause consolidation and preserved history. Real MariaDB integration runs against the isolated `roxstock_bugreports_test` database. Mobile and tablet browser checks cover report detail/review/resolution/deletion.

Execution counts and remaining source limitations are reported from the private local recovery checkpoint, not inferred from warning occurrence counts.

### Local results, 2026-10-18

171 recovered periods were examined. Duration was verified for 170; the 2021 annual CFS filing of IGIS Value Plus REIT (receipt 20211111000322) had dated balances but no dated income-statement rows in the major-account response, so flow annualization remains on review. Its period-end BPS/PBR are available independently.

708 formerly null metric values were filled: EPS 152, BPS 135, PER 138, PBR 125 and ROE 158. Recovery had no uncaught collection/storage failures. Missing source fields, prices or opening capital remain explicitly incomplete rather than invented.

Final checks: 132 collector tests, 42 shared financial-domain tests, two isolated MariaDB report integration tests and two mobile/tablet report browser checks passed. Shared/collector/backend compilation and frontend typechecking passed. The live local API showed one remaining duration-review target out of 171; its 210 historical occurrences were retained. An irregular 225-day formation period exposed its ACT/365 basis together with a signed PER in the live API.

No production DB write, source push or deployment was performed.
