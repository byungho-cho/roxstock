-- Cost basis plus cash, independent of market valuation. NULL means unknown.
ALTER TABLE `daily_account_snapshots` ADD COLUMN `investment_amount` DECIMAL(19,4) NULL;
