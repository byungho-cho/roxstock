# 현행 구조·테이블 기준 · 2026.10.30

대조 main `daa6ac25`. 구조 원본은 코드이며 테이블 분리 신설계는 아직 미확정이다.

| 디렉터리 | 책임 |
|---|---|
| frontend/ | React·Vite·TypeScript 화면·상태·시세 표시 |
| backend/ | Fastify 인증·소유권·API·편집 |
| collector/ | 공시·시세·소식 등 수집 실행 |
| shared/ | 공통 Prisma·계산·검증·타입 |
| database/prisma/ | 스키마·마이그레이션 원본 |
| infra/ / scripts/ | 운영 Compose·배포·보조 도구 |
| android-app/ | 운영 웹을 여는 Android 앱·네이티브 알림 연계 |

기존 MariaDB를 유지한다. 디렉터리·이미지 분리는 DB 물리 분리와 다르다. 스키마 변경 시 기존 데이터·수기·감사·오류 이력·사용자 소유권을 보호한다. 공용 데이터와 사용자 데이터를 구분하는 현재 백업 범위는 `backend/src/domain/backup-scope.ts`와 v1.2.46 보고서를 따른다. 사용자 백업은 별도 DB 분리 완료를 의미하지 않는다.

현재 시세 worker는 `collector/src/realtime-worker.ts`에서 Naver/Mock 제공자를 사용한다. 한투 재무/과거 종가 제공자 존재가 한투 실시간 웹소켓 구현 완료를 의미하지 않는다. 외부 수집과 API→화면 SSE는 서로 다른 연결이다.

현재 추가 계약: `/api/accounts/:accountId/investment-profit/statistics`, `/entries`는 각각 종목 전체기간 통계·거래별 상세다. 개인 스크랩은 `/api/accounts/:accountId/stock-news/:newsId/scrap` PUT으로 저장한다. 구체 형식은 `backend/src/routes/investment-profit-details.ts`, `stock-news.ts`가 원본이다.

## Prisma 모델·실제 테이블 매핑

다음 표는 스키마에서 생성한 전체 모델 목록이다. 논리 테이블 분리 제안이 아니다. 컬럼·인덱스·관계는 [schema.prisma](../database/prisma/schema.prisma), 적용 이력은 [migrations](../database/prisma/migrations)를 따른다. 운영 DB의 현재 구조를 이번에 직접 introspection한 결과는 아니다.

| Prisma 모델 | 테이블 |
|---|---|
| `InvestorFlowDaily` | `investor_flow_daily` |
| `Account` | `accounts` |
| `Security` | `securities` |
| `CollectorLock` | `collector_locks` |
| `CollectorRun` | `collector_runs` |
| `CollectorRunItem` | `collector_run_items` |
| `RealtimeWorkerState` | `realtime_worker_state` |
| `RealtimeCycleAggregate` | `realtime_cycle_aggregates` |
| `RealtimeCollectorIssue` | `realtime_collector_issues` |
| `DartCorpMapping` | `dart_corp_mappings` |
| `DartSecurityState` | `dart_security_state` |
| `DartBackfillTask` | `dart_backfill_tasks` |
| `DartCollectorState` | `dart_collector_state` |
| `DartApiDailyUsage` | `dart_api_daily_usage` |
| `DartDailyCompanyCheck` | `dart_daily_company_checks` |
| `DartFinancialFiling` | `dart_financial_filings` |
| `WatchlistItem` | `watchlist_items` |
| `AccountWatchlistItem` | `account_watchlist_items` |
| `TradeRequest` | `trade_requests` |
| `BuyTrade` | `buy_trades` |
| `SellTrade` | `sell_trades` |
| `CashTransaction` | `cash_transactions` |
| `Dividend` | `dividends` |
| `MarketPrice` | `market_prices` |
| `DailyAccountSnapshot` | `daily_account_snapshots` |
| `DailyPositionSnapshot` | `daily_position_snapshots` |
| `FinancialStatement` | `financial_statements` |
| `ValuationMetric` | `valuation_metrics` |
| `SecurityFundamentals` | `security_fundamentals` |
| `FundamentalSnapshot` | `kis_fundamental_snapshots` |
| `DartShareSnapshot` | `dart_share_snapshots` |
| `CompoundGrowthPlan` | `compound_growth_plans` |
| `CompoundGrowthGoal` | `compound_growth_goals` |
| `DartReportCache` | `dart_report_cache` |
| `PeriodValuation` | `period_valuations` |
| `ValuationSupplementTask` | `valuation_supplement_tasks` |
| `ValuationSupplementScan` | `valuation_supplement_scan` |
| `ValuationSupplementBudget` | `valuation_supplement_budget` |
| `AnnualConsensusSnapshot` | `annual_consensus_snapshots` |
| `AccountProfitRevision` | `account_profit_revisions` |
| `InvestmentYearAggregate` | `investment_year_aggregates` |
| `SecurityCodeHistory` | `security_code_history` |
| `AnalysisRevision` | `analysis_revisions` |
| `AnalysisReadCache` | `analysis_read_cache` |
| `CollectionBugReport` | `collection_bug_reports` |
| `CollectionBugOccurrence` | `collection_bug_occurrences` |
| `CollectionBugScanState` | `collection_bug_scan_state` |
| `StockNewsItem` | `stock_news_items` |
| `StockNewsSecurity` | `stock_news_securities` |
| `StockNewsState` | `stock_news_state` |
| `StockNewsProviderState` | `stock_news_provider_state` |
| `StockNewsSeen` | `stock_news_seen` |
| `StockNewsSchedule` | `stock_news_schedule` |
| `StockNewsSlot` | `stock_news_slots` |
| `StockNewsCandidate` | `stock_news_candidates` |
| `AuthUser` | `auth_users` |
| `StockNewsScrap` | `stock_news_scraps` |
| `CollectionBugReportingWindow` | `collection_bug_reporting_window` |
| `AuthSession` | `auth_sessions` |
| `AuthEmailToken` | `auth_email_tokens` |
| `AuthInvitation` | `auth_invitations` |
| `AuthRateLimit` | `auth_rate_limits` |
| `AuthRetiredToken` | `auth_retired_tokens` |
| `DartTaskDecision` | `dart_task_decisions` |
| `AppNotificationPreference` | `app_notification_preferences` |
| `AppPushDevice` | `app_push_devices` |
| `AppTargetNotificationState` | `app_target_notification_states` |
| `AppNotificationEvent` | `app_notification_events` |
| `AccountNotificationPreference` | `account_notification_preferences` |
| `AppTargetDailyMaximum` | `app_target_daily_maxima` |
| `AppPushDelivery` | `app_push_deliveries` |
| `AdminUserReadAudit` | `admin_user_read_audits` |
| `SecurityDataCursor` | `security_data_cursor` |
| `SecurityDataReceipt` | `security_data_receipts` |
| `SecurityDataEdit` | `security_data_edits` |
