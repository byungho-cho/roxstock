-- DropForeignKey
ALTER TABLE `security_code_history` DROP FOREIGN KEY `security_code_history_security_id_fkey`;

-- CreateTable
CREATE TABLE `stock_news_items` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `provider` VARCHAR(40) NOT NULL,
    `provider_id` VARCHAR(160) NOT NULL,
    `canonical_hash` CHAR(64) NOT NULL,
    `fingerprint` CHAR(64) NOT NULL,
    `title` VARCHAR(500) NOT NULL,
    `original_url` VARCHAR(2048) NOT NULL,
    `source_name` VARCHAR(120) NOT NULL,
    `published_at` DATETIME(3) NOT NULL,
    `published_precision` VARCHAR(10) NOT NULL DEFAULT 'TIME',
    `material_type` VARCHAR(16) NOT NULL,
    `priority` TINYINT UNSIGNED NOT NULL,
    `access_condition` VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
    `summary` VARCHAR(300) NULL,
    `summary_method` VARCHAR(40) NOT NULL DEFAULT 'NONE',
    `collected_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `stock_news_items_canonical_hash_key`(`canonical_hash`),
    UNIQUE INDEX `stock_news_items_fingerprint_key`(`fingerprint`),
    INDEX `stock_news_order_idx`(`priority`, `published_at`, `id`),
    INDEX `stock_news_type_order_idx`(`material_type`, `priority`, `published_at`, `id`),
    UNIQUE INDEX `stock_news_items_provider_provider_id_key`(`provider`, `provider_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_news_securities` (
    `news_id` BIGINT UNSIGNED NOT NULL,
    `security_id` BIGINT UNSIGNED NOT NULL,

    INDEX `stock_news_securities_security_id_news_id_idx`(`security_id`, `news_id`),
    PRIMARY KEY (`news_id`, `security_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_news_state` (
    `id` VARCHAR(40) NOT NULL DEFAULT 'stock-news',
    `initial_date` CHAR(10) NOT NULL,
    `initial_completed_at` DATETIME(3) NULL,
    `completed_date` CHAR(10) NULL,
    `attempt_date` CHAR(10) NULL,
    `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `next_retry_at` DATETIME(3) NULL,
    `last_collected_at` DATETIME(3) NULL,
    `last_status` VARCHAR(20) NOT NULL DEFAULT 'NOT_COLLECTED',
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_news_provider_state` (
    `provider` VARCHAR(40) NOT NULL,
    `watermark` DATETIME(3) NULL,
    `last_success_at` DATETIME(3) NULL,
    `last_attempt_at` DATETIME(3) NULL,
    `last_error` VARCHAR(500) NULL,

    PRIMARY KEY (`provider`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_news_seen` (
    `key` CHAR(64) NOT NULL,
    `first_seen_at` DATETIME(3) NOT NULL,

    INDEX `stock_news_seen_first_seen_at_idx`(`first_seen_at`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `security_code_history` ADD CONSTRAINT `security_code_history_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_news_securities` ADD CONSTRAINT `stock_news_securities_news_id_fkey` FOREIGN KEY (`news_id`) REFERENCES `stock_news_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_news_securities` ADD CONSTRAINT `stock_news_securities_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

