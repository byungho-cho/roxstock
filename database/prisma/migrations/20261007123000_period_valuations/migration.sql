CREATE TABLE `period_valuations` (
 `security_id` BIGINT UNSIGNED NOT NULL,
 `fiscal_year` SMALLINT UNSIGNED NOT NULL,
 `period_type` VARCHAR(10) NOT NULL,
 `status` VARCHAR(24) NOT NULL,
 `values` JSON NOT NULL,
 `provenance` JSON NOT NULL,
 `reasons` JSON NOT NULL,
 `supplemental` JSON NULL,
 `attempts` INTEGER NOT NULL DEFAULT 0,
 `next_attempt_at` DATETIME(3) NULL,
 `updated_at` DATETIME(3) NOT NULL,
 PRIMARY KEY (`security_id`,`fiscal_year`,`period_type`),
 INDEX `period_valuations_status_next_attempt_at_idx` (`status`,`next_attempt_at`),
 CONSTRAINT `period_valuations_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
