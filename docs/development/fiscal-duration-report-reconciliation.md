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

## Follow-up: premature warnings and local-only history

The imported production snapshot contained 1,956 bug occurrence keys. Compare exact keys against that private snapshot before removing local-only records; report IDs and occurrence timestamps alone are insufficient after reclassification.

A first-pass financial calculation does not prove that supplemental shares, accounts or historical-price collection was attempted. Warning generation now checks the relevant component evidence, saved source errors or explicit collection-attempt metadata. Missing PER/PBR that merely depend on missing EPS/BPS do not create another warning. Pending jobs remain in the durable supplement queue. The same checks retire legacy premature warnings while preserving their production-origin history.

Local-only resolved/transient occurrences and redundant local repeats are detached as replay tombstones, so the overlap scanner cannot recreate them. Original imported occurrence keys are never removed. Genuine still-missing source evidence remains reviewable. Financial figures are not deleted by report cleanup.

The follow-up also found a daily API budget defect: MariaDB matched-row semantics can return a positive count for a no-op `INSERT ... ON DUPLICATE KEY UPDATE`. Reservations now initialize an empty day separately and atomically increment with `WHERE api_call_count < limit`. A native state upsert avoids a concurrently reproduced MariaDB 1020 in the reservation progress update. This isolated reproduction does not establish the cause of any older manual-request database incident. Real-DB concurrency tests verify that only two of twelve simultaneous reservations succeed against a cap of two, with no API calls.

The detail dialog uses compact, aligned full-width controls: three equal 32px-high actions, muted memo save, green review and blue resolve. Controls retain their identifying colors when disabled; only the history list scrolls.

### Follow-up completion, 2026-10-18

Additional recovery filled 362 metric values: 50 from stored evidence, 249 from KIS-only historical prices, 60 using reconciled voting-label share totals as reference-only BPS, and three after reviewing the remaining official annual filing. Voting rights are not interpreted as ordinary-share classification; reference-only totals remain excluded from RIM.

The remaining annual duration was verified against the exact official DART receipt section, matching balance-sheet anchors and current flows. Its six-month period and adjacent parent-equity opening balance are stored with the source URL and content hash. This supersedes the earlier 170/171 result: all 171 duration targets now have verified evidence. No general public-page crawler was added.

Cleanup removed 498 local transient/duplicate occurrences and no imported production occurrence keys. Sixty-one periods still require source evidence or validation; they remain queued rather than fabricated. DART daily usage was already at its configured cap and was not reset. The local collector is not running, so queued work awaits a subsequent collection run.

Final verification passed 213 combined collector/shared/report unit tests and three isolated MariaDB integration tests. Shared, collector and backend compilation and frontend typechecking passed. Browser inspection confirmed aligned memo controls and equal 32px action heights. Production was not changed.

## Highest-count BPS review, 2026-10-18

The next focused review reduced BPS unresolved targets from 26 to seven. It filled 38 formerly null values: BPS 19, PBR 18 and ROE one. Nineteen exact-receipt periods were reviewed: four SK Hynix quarterly notes, fourteen dated common/preferred/total share tables, and Samsung Electronics 2019 consolidated capital. Reviewed source sections and target-level before-images are retained privately outside Git; no production data changed.

The SK Hynix quarter share-summary section explicitly omits the disclosure. The same receipt's notes provide a dated period-end outstanding-share table. Both current and comparative listed-minus-treasury totals must reconcile, the unit must be shares, and ordinary-share context must be explicit. Listed totals are not written as legal issued shares. Stored source URL/hash and receipt/date evidence allow manual and automatic loaders and queue completion to reuse verified notes without repeatedly calling the omitted summary endpoint.

Preferred-share tables require explicit common/preferred/total columns and reconciliation for each issued, treasury and outstanding row. Their combined-class BPS/PBR remains reference-only and excluded from RIM. Samsung 2019 capital was checked against stored total equity, revenue and net income before adding parent-equity and comparative opening-capital evidence.

Resolved values retire their warnings through normal reconciliation; underlying EPS/price-basis warnings remain independent. Remaining gaps include pre-listing or mismatched-receipt share data and unverified denominators, rather than inferred current stock counts. The first combined regression run passed 217 tests; after adding shared reuse to automatic queue completion, all 141 collector/share tests passed again. Shared/collector compilation, backend and frontend typechecking passed.

## Separate closing-date PBR evidence from EPS basis review, 2026-10-18

The next focused recovery added 17 metric values: ten PBR, six PER and one EPS. Sixteen price-basis targets were checked sequentially against KIS, with zero uncaught processing failures; six reviewed annual EPS notes were then applied without additional network requests. Target-level before-images and downloaded public sections remain private outside Git.

PBR may use a symbol-verified original KIS close within seven days of the actual period end, together with matching-receipt, matching-date share rows and reconciled book-share counts. Subsequent rights issues or later correction dates do not alter that historical balance/share denominator. Undated legacy quantities, mismatched ordinary/total rows and unquantified positive other share classes remain rejected. This does not approve EPS automatically.

PER additionally permits reviewed ordinary-share evidence when the actual fiscal duration is verified, disclosed weighted-average ordinary shares equal the independently disclosed period-end ordinary count, and stored owner/total profit divided by those shares reproduces disclosed basic EPS within its rounding precision. Source receipt, division, URL and hash are retained. Preferred allocations, conflicting owner profit, wrong units, missing duration and ambiguous duplicate tables remain rejected. A missing EPS or missing CFS owner-profit field is recoverable only when the reviewed table and independent stored profit agree. Verified supplemental EPS fields survive an otherwise valid later account response that omits them.

Lotte REIT, D&D Platform REIT, Mirae Asset Maps REIT, ESR Kendall Square REIT, Mastern Premier REIT and IGIS Value Plus REIT gained PER; IGIS also gained EPS. Mirae Asset Global REIT remains blocked because the note's common-share profit differs from the stored owner-profit source. Actual six-month annualization was retained rather than substituted with a twelve-month assumption.

Reconciliation resolved repaired targets. Cleanup detached 42 local resolved/duplicate occurrences, including 20 local duplicates; no imported production occurrence keys were removed. Remaining active metric occurrence counts after cleanup are EPS 16, PER 13, PBR two, BPS seven, ROE seven and shared price basis seven. Other fiscal-source warnings remain independent.

Validation: 222 combined collector/shared/report unit tests passed, with shared/collector compilation and backend/frontend typechecking passing. No production write, API quota reset or deployment occurred. KIS price queries retain their existing throttle and token reuse; this change does not enlarge the existing disclosure-window limit. The official KIS example documents the original/adjusted price modes and 100-row response limit: https://github.com/koreainvestment/open-trading-api/blob/main/examples_llm/domestic_stock/inquire_daily_itemchartprice/inquire_daily_itemchartprice.py .

## Remaining EPS, shares and opening capital, 2026-10-18

This continuation filled 74 formerly null metrics: EPS 16, BPS six, PER 34, PBR ten and ROE eight. It separately corrected thirteen legacy KIS EPS values using exact-receipt DART common-share evidence; corrections are not counted as newly filled values. Every applied target has a private before-image. The finite repair batches recorded no processing failures. Production was not changed.

Quarterly EPS selects the cumulative current-period column by matching stored profit, rather than taking the first three-month column. Total EPS is derived from disclosed common profit and weighted shares when necessary, never by adding rounded continuing/discontinued EPS. Actual three-, six- and nine-month fiscal periods remain annualized on their verified basis. Missing owner profit requires an independently reconciled consolidated statement, including assets, liabilities, equity, consolidated profit and non-controlling components.

Opening capital must be dated exactly one day before the verified fiscal start. A statement's actual comparative balance is retained even when its date is not the previous calendar December. Source units and the assets-minus-liabilities equation must reconcile for both dates. Formation periods without a genuine opening balance remain incomplete; zero capital is not invented.

Common-share EPS reviews reconcile parent profit, explicit ordinary allocation, weighted ordinary shares and disclosed EPS. Monetary units and thousands of shares are independently scaled. The verified projection can supersede an ambiguous raw EPS without rewriting the original filing. The repair path corrects only a matching-receipt, matching-division calendar annual legacy KIS EPS whose PER is still missing; it retains previous EPS/provenance in a bounded correction history. Wrong receipts and existing DART values remain protected. Manual and automatic loaders reuse saved source evidence and do not discard it when a later account response omits the field.

One explicitly reviewed exception is Hyundai Mobis 2019: both the primary statement and EPS note disclose KRW 24,234, while the rounded component amounts divide to approximately KRW 24,233.3021. The published EPS is retained with an explicit one-won maximum arithmetic tolerance and recorded difference. This is not the default rounding rule; larger or fractional exceptions are rejected. All other disclosed reviews use the EPS precision's ordinary half-unit rounding tolerance.

Four more dated capital tables supplied missing historical share-class evidence. An unnamed class column is accepted only if issued, treasury and outstanding quantities are all explicitly zero and totals reconcile. It is recorded as OTHER rather than relabeled as preferred. PBR uses verified period-end quantities independently of a later corrected disclosure. PER retains its additional ordinary-share/restatement checks; negative EPS itself does not make a collection failure.

After reconciliation, EPS missing targets fell from sixteen to zero and BPS from seven to one. The active metric-report audit has six remaining security/period targets. These include unavailable historical quotes, the formation opening balance, an omitted share summary and unverified EPS/share basis. Additional negative-PER basis gaps and older fiscal/source/manual-storage warnings require separate evidence; this result does not claim every report is solved. In particular, Atem's September 2023 notes disclose issued and weighted shares but no explicit treasury/outstanding table, so those quantities were not treated as equivalent. Mirae Asset Global REIT's common-profit discrepancy remains on review.

Cleanup detached 52 local resolved/duplicate occurrences, including six local duplicates, while preserving all 1,943 imported financial-report occurrence keys (1,956 imported keys across all features). Originals and review notes remain intact. No daily API quota was reset; no automatic public-page crawler or background collector was started. Public HTML parsing is offline and requires explicitly reviewed receipt sections.

Final checks passed 238 collector/shared/report unit tests and three isolated MariaDB integration tests. Shared and collector compilation, backend/frontend typechecking and diff checks passed. The private fixtures, public HTML sections, repair plans, before-images and result logs are kept outside Git. No schema migration, production write, push or deployment was performed.

## Review every remaining report and present one backlog, 2026-10-18

The complete active-report audit covered 64 occurrences across financial collection, legacy KIS fundamentals and market prices. Twenty-seven closing-period warnings referred to the correct receipt but an obsolete requested fiscal-year/quarter label. Reconciliation now follows the exact occurrence-to-run-item hash and selected receipt, then requires the same security, a non-withdrawn filing, newer valuation evidence, matching receipt/end date and a verified fiscal duration. It resolves the warning without rewriting the original requested period or treating a newer unrelated filing as proof.

Twenty-six already recovered receipts met those conditions. The remaining Prestige Biologics receipt 20241114002692 had a stored financial filing but no valuation row. Its public statement proves 2024-07-01 through 2024-09-30, with identical current three-month and cumulative columns. All stored flows and closing equity reconcile. The reviewed dated share table and KIS closing price then supplied five values: EPS -416, BPS 2002.7743, PER -14.3029, PBR 2.9709 and ROE -23.0019. The original filing is unchanged, and the negative PER remains a valid signed ratio. The offline period parser now permits Q1 only when the three-month/YTD columns agree and the verified span is exactly three months; other quarters remain rejected by this selector.

Six exact NO_FUNDAMENTAL_DATA occurrences were reclassified to KIS_FUNDAMENTAL_NO_DATA warnings, preserving their original event keys. Other historical run/storage failures were not declared fixed merely because current figures exist. In particular, older manual records lack detailed Prisma diagnostics. KCC/Green Resource correction contents and Apton's original/correction relationship still need source verification. A KIS recheck for Hanchang returned the existing 2026-10-14 close of 11, not a newer quote, so no fresh current-price timestamp was invented. Current market-price exclusions for Suseong Webtoon and DA Technology were honored; they were not bypassed for external calls.

After review, 37 remaining occurrences in thirteen cause reports represent 23 distinct security/period or unscoped-run targets. Their source reasons and user notes are retained and reviewed notes were appended without truncating existing notes. They are marked REVIEWING and presented as one virtual review-pending summary in the unresolved/reviewing lists. The original reports and history remain available under ALL and through the summary's cause entries. There is no schema migration, physical report merge, event deletion or blanket resolution. Summary counts exclude resolved historical occurrences and deduplicate a target across causes. An unresolved ERROR keeps the summary's ERROR severity; source absence is WARNING. The summary cannot bulk-resolve its children. A genuinely new occurrence after a reviewed report's last occurrence reopens that report separately, while replayed old events do not reopen it.

The summary's cause list is paged at fifty and its recent unresolved history is capped at fifty; the existing per-report memo/actions remain available after selecting a cause. The UI keeps internal scrolling and prevents horizontal overflow. A rollback of presentation code simply shows the existing REVIEWING reports individually; no data conversion is needed. Target before-images, the report/state backup, source checks and review notes are saved privately outside Git. No imported occurrence key was removed.

Verification passed 239 related unit tests and five isolated MariaDB integration tests. The added integration tests cover exact-receipt period reconciliation, preservation of requested-period history, summary deduplication, existing notes/codes/severity, repaired-event exclusion, blocked summary bulk resolution and fresh-incident separation. Two live-API browser checks at 390x844 and 768x1024 confirmed one summary card, cause navigation, retained memo content and inner scrolling (402px viewport for 1499px history content). Collector compilation and backend/frontend typechecks and diff checks passed. Production was not changed and no background collector was started.
