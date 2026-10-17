-- CreateTable
CREATE TABLE `valuation_supplement_tasks` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `security_id` BIGINT UNSIGNED NOT NULL,
    `fiscal_year` SMALLINT UNSIGNED NOT NULL,
    `period_type` VARCHAR(10) NOT NULL,
    `kind` VARCHAR(20) NOT NULL DEFAULT 'PERIOD',
    `filing_id` BIGINT UNSIGNED NOT NULL,
    `source_version` CHAR(64) NOT NULL,
    `valuation_at` DATETIME(3) NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    `ready` BOOLEAN NOT NULL DEFAULT true,
    `priority` INTEGER NOT NULL DEFAULT 0,
    `attempts` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `next_attempt_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `owner_token` VARCHAR(64) NULL,
    `lease_until` DATETIME(3) NULL,
    `heartbeat_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `last_error` VARCHAR(64) NULL,
    `diagnostics` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `valuation_supplement_due_idx`(`ready`, `next_attempt_at`, `priority`, `id`),
    INDEX `valuation_supplement_recovery_idx`(`status`, `lease_until`, `id`),
    UNIQUE INDEX `valuation_supplement_logical_key`(`security_id`, `fiscal_year`, `period_type`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `valuation_supplement_scan` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `cursor` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `owner_token` VARCHAR(64) NULL,
    `lease_until` DATETIME(3) NULL,
    `heartbeat_at` DATETIME(3) NULL,
    `phase` VARCHAR(24) NOT NULL DEFAULT 'IDLE',
    `scanned` INTEGER NOT NULL DEFAULT 0,
    `last_automatic_at` DATETIME(3) NULL,
    `automatic_turn_until` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `valuation_supplement_budget` (
    `day` DATE NOT NULL,
    `reserved` INTEGER UNSIGNED NOT NULL DEFAULT 0,

    PRIMARY KEY (`day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `dart_filing_latest_idx` ON `dart_financial_filings`(`security_id`, `fiscal_year`, `period_type`, `is_withdrawn`, `receipt_date`, `collected_at`, `receipt_no`);
