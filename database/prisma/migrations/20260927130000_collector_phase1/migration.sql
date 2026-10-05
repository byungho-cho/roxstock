CREATE TABLE `collector_locks` (
  `job_name` VARCHAR(100) NOT NULL,
  `owner_token` VARCHAR(64) NOT NULL,
  `locked_until` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`job_name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `collector_runs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `job_type` VARCHAR(100) NOT NULL,
  `provider` VARCHAR(100) NOT NULL,
  `status` ENUM('RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'RUNNING',
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `finished_at` DATETIME(3) NULL,
  `success_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `failure_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `stale_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `skipped_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `failure_reason` VARCHAR(1000) NULL,
  `metadata` JSON NULL,
  INDEX `collector_runs_job_type_started_at_idx` (`job_type`, `started_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `collector_run_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `run_id` BIGINT UNSIGNED NOT NULL,
  `security_id` BIGINT UNSIGNED NULL,
  `symbol` VARCHAR(100) NOT NULL,
  `status` ENUM('SUCCESS', 'FAILED', 'STALE', 'SKIPPED') NOT NULL,
  `message` VARCHAR(1000) NULL,
  `observed_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `collector_run_items_run_id_status_idx` (`run_id`, `status`),
  INDEX `collector_run_items_security_id_idx` (`security_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `collector_run_items` ADD CONSTRAINT `collector_run_items_run_id_fkey`
  FOREIGN KEY (`run_id`) REFERENCES `collector_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `collector_run_items` ADD CONSTRAINT `collector_run_items_security_id_fkey`
  FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
