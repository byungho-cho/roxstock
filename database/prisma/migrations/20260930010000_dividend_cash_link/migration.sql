ALTER TABLE `dividends` ADD COLUMN `cash_transaction_id` BIGINT UNSIGNED NULL;
CREATE UNIQUE INDEX `dividends_cash_transaction_id_key` ON `dividends`(`cash_transaction_id`);
ALTER TABLE `dividends` ADD CONSTRAINT `dividends_cash_transaction_id_fkey` FOREIGN KEY (`cash_transaction_id`) REFERENCES `cash_transactions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
