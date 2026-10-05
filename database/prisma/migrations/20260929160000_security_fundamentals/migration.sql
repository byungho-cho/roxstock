CREATE TABLE `security_fundamentals` (
  `security_id` BIGINT UNSIGNED NOT NULL,
  `controlling_profit` DECIMAL(24,0) NULL,
  `issued_shares` DECIMAL(24,0) NULL,
  `treasury_shares` DECIMAL(24,0) NULL,
  `previous_equity` DECIMAL(24,0) NULL,
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`security_id`),
  CONSTRAINT `security_fundamentals_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
