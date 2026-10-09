CREATE TABLE `dart_share_snapshots` (
 `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 `security_id` BIGINT UNSIGNED NOT NULL,
 `fiscal_year` SMALLINT UNSIGNED NOT NULL,
 `report_code` CHAR(5) NOT NULL,
 `receipt_no` VARCHAR(14) NOT NULL,
 `stock_kind` VARCHAR(100) NOT NULL,
 `share_class` VARCHAR(16) NOT NULL,
 `issued_shares` DECIMAL(24,0) NULL,
 `treasury_shares` DECIMAL(24,0) NULL,
 `outstanding_shares` DECIMAL(24,0) NULL,
 `period_end_date` DATE NOT NULL,
 `collected_at` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`),
 UNIQUE INDEX `dart_share_snapshots_security_id_receipt_no_stock_kind_key` (`security_id`,`receipt_no`,`stock_kind`),
 INDEX `dart_share_snapshots_security_id_fiscal_year_period_end_date_idx` (`security_id`,`fiscal_year`,`period_end_date`),
 CONSTRAINT `dart_share_snapshots_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
