ALTER TABLE `collector_run_items`
  MODIFY `status` ENUM('SUCCESS', 'FAILED', 'STALE', 'SKIPPED', 'NO_DATA', 'NOT_APPLICABLE') NOT NULL;

CREATE TABLE `realtime_worker_state` (
  `id` VARCHAR(40) NOT NULL DEFAULT 'selected-prices',
  `worker_token` VARCHAR(64) NULL,
  `worker_status` VARCHAR(20) NOT NULL DEFAULT 'STOPPED',
  `started_at` DATETIME(3) NULL,
  `heartbeat_at` DATETIME(3) NULL,
  `market_session` VARCHAR(20) NOT NULL DEFAULT 'OUT_OF_SESSION',
  `last_cycle_started_at` DATETIME(3) NULL,
  `last_cycle_finished_at` DATETIME(3) NULL,
  `target_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `received_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `source_failure_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `stale_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `published_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `publish_failure_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `saved_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `save_failure_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `last_price_received_at` DATETIME(3) NULL,
  `last_source_price_at` DATETIME(3) NULL,
  `last_sse_published_at` DATETIME(3) NULL,
  `last_db_saved_at` DATETIME(3) NULL,
  `last_source_error` VARCHAR(1000) NULL,
  `last_publish_error` VARCHAR(1000) NULL,
  `last_save_error` VARCHAR(1000) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `realtime_cycle_aggregates` (
  `minute_started_at` DATETIME(3) NOT NULL,
  `cycle_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `target_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `received_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `source_failure_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `stale_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `published_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `publish_failure_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `saved_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `save_failure_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `last_cycle_finished_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`minute_started_at`),
  INDEX `realtime_cycle_aggregates_updated_at_idx` (`updated_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `realtime_collector_issues` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `occurred_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `stage` VARCHAR(20) NOT NULL,
  `symbol` VARCHAR(20) NULL,
  `message` VARCHAR(1000) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `realtime_collector_issues_occurred_at_idx` (`occurred_at`),
  INDEX `realtime_collector_issues_stage_occurred_at_idx` (`stage`, `occurred_at`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dart_corp_mappings` (
  `security_id` BIGINT UNSIGNED NOT NULL,
  `corp_code` CHAR(8) NOT NULL,
  `stock_code` CHAR(6) NOT NULL,
  `corp_name` VARCHAR(200) NOT NULL,
  `source_modified_at` CHAR(8) NULL,
  `synced_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`security_id`),
  UNIQUE INDEX `dart_corp_mappings_corp_code_key` (`corp_code`),
  UNIQUE INDEX `dart_corp_mappings_stock_code_key` (`stock_code`),
  INDEX `dart_corp_mappings_stock_code_idx` (`stock_code`),
  CONSTRAINT `dart_corp_mappings_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dart_security_state` (
  `security_id` BIGINT UNSIGNED NOT NULL,
  `backfill_started_at` DATETIME(3) NULL,
  `backfill_completed_at` DATETIME(3) NULL,
  `priority_checked_at` DATETIME(3) NULL,
  `universe_checked_at` DATETIME(3) NULL,
  `last_receipt_checked_at` DATETIME(3) NULL,
  `last_error` VARCHAR(1000) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`security_id`),
  INDEX `dart_security_state_backfill_started_at_backfill_completed_at_idx` (`backfill_started_at`, `backfill_completed_at`),
  INDEX `dart_security_state_priority_checked_at_idx` (`priority_checked_at`),
  INDEX `dart_security_state_universe_checked_at_idx` (`universe_checked_at`),
  CONSTRAINT `dart_security_state_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dart_backfill_tasks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `security_id` BIGINT UNSIGNED NOT NULL,
  `fiscal_year` SMALLINT UNSIGNED NOT NULL,
  `report_code` CHAR(5) NOT NULL,
  `period_type` ENUM('ANNUAL', 'Q1', 'Q2', 'Q3', 'Q4') NOT NULL,
  `status` ENUM('PENDING', 'PROCESSING', 'SUCCESS', 'NO_FILING', 'NOT_APPLICABLE', 'FAILED') NOT NULL DEFAULT 'PENDING',
  `attempts` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `selected_receipt_no` CHAR(14) NULL,
  `last_attempt_at` DATETIME(3) NULL,
  `next_attempt_at` DATETIME(3) NULL,
  `processed_at` DATETIME(3) NULL,
  `error_code` VARCHAR(20) NULL,
  `error_message` VARCHAR(1000) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `dart_backfill_tasks_security_id_fiscal_year_report_code_key` (`security_id`, `fiscal_year`, `report_code`),
  INDEX `dart_backfill_tasks_status_fiscal_year_security_id_idx` (`status`, `fiscal_year`, `security_id`),
  INDEX `dart_backfill_tasks_security_id_status_fiscal_year_idx` (`security_id`, `status`, `fiscal_year`),
  CONSTRAINT `dart_backfill_tasks_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dart_collector_state` (
  `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `phase` VARCHAR(20) NOT NULL DEFAULT 'BACKFILL',
  `backfill_start_year` SMALLINT UNSIGNED NOT NULL DEFAULT 2015,
  `backfill_end_year` SMALLINT UNSIGNED NULL,
  `backfill_initialized_at` DATETIME(3) NULL,
  `corp_code_synced_at` DATETIME(3) NULL,
  `backfill_completed_at` DATETIME(3) NULL,
  `phase2_started_at` DATETIME(3) NULL,
  `last_run_at` DATETIME(3) NULL,
  `last_error` VARCHAR(1000) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dart_api_daily_usage` (
  `usage_date` DATE NOT NULL,
  `api_call_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `company_check_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `no_data_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `error_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`usage_date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dart_daily_company_checks` (
  `usage_date` DATE NOT NULL,
  `security_id` BIGINT UNSIGNED NOT NULL,
  `phase` VARCHAR(20) NOT NULL,
  `checked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`usage_date`, `security_id`),
  INDEX `dart_daily_company_checks_usage_date_phase_idx` (`usage_date`, `phase`),
  CONSTRAINT `dart_daily_company_checks_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `dart_financial_filings` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `security_id` BIGINT UNSIGNED NOT NULL,
  `fiscal_year` SMALLINT UNSIGNED NOT NULL,
  `period_type` ENUM('ANNUAL', 'Q1', 'Q2', 'Q3', 'Q4') NOT NULL,
  `report_code` CHAR(5) NOT NULL,
  `fs_division` CHAR(3) NOT NULL,
  `receipt_no` CHAR(14) NOT NULL,
  `supersedes_receipt_no` CHAR(14) NULL,
  `report_name` VARCHAR(300) NOT NULL,
  `period_end_date` DATE NOT NULL,
  `receipt_date` DATE NOT NULL,
  `collected_at` DATETIME(3) NOT NULL,
  `source` VARCHAR(30) NOT NULL DEFAULT 'OPEN_DART',
  `is_withdrawn` BOOLEAN NOT NULL DEFAULT false,
  `revenue_quarter` DECIMAL(24,0) NULL,
  `revenue_ytd` DECIMAL(24,0) NULL,
  `operating_profit_quarter` DECIMAL(24,0) NULL,
  `operating_profit_ytd` DECIMAL(24,0) NULL,
  `net_income_quarter` DECIMAL(24,0) NULL,
  `net_income_ytd` DECIMAL(24,0) NULL,
  `total_assets` DECIMAL(24,0) NULL,
  `total_liabilities` DECIMAL(24,0) NULL,
  `total_equity` DECIMAL(24,0) NULL,
  `operating_cash_flow_quarter` DECIMAL(24,0) NULL,
  `operating_cash_flow_ytd` DECIMAL(24,0) NULL,
  `capital_expenditure_quarter` DECIMAL(24,0) NULL,
  `capital_expenditure_ytd` DECIMAL(24,0) NULL,
  `account_sources` JSON NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `dart_financial_filings_receipt_no_key` (`receipt_no`),
  INDEX `dart_financial_filings_security_id_fiscal_year_period_type_receipt_date_idx` (`security_id`, `fiscal_year`, `period_type`, `receipt_date`),
  INDEX `dart_financial_filings_fiscal_year_period_type_idx` (`fiscal_year`, `period_type`),
  CONSTRAINT `dart_financial_filings_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
