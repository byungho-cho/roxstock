CREATE TABLE `dart_report_cache` (
  `corp_code` CHAR(8) NOT NULL,
  `fiscal_year` SMALLINT UNSIGNED NOT NULL,
  `reports` JSON NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`corp_code`, `fiscal_year`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
