-- CreateTable
CREATE TABLE `accounts` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `broker_name` VARCHAR(100) NOT NULL,
    `account_number` VARCHAR(50) NULL,
    `cash_balance` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `display_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `securities` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `symbol` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `market_type` ENUM('KOSPI', 'KOSDAQ', 'KONEX', 'OTHER') NOT NULL,
    `security_type` ENUM('STOCK', 'ETF', 'ETN', 'REIT', 'OTHER') NOT NULL DEFAULT 'STOCK',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `securities_market_type_symbol_key`(`market_type`, `symbol`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `watchlist_items` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `security_id` BIGINT UNSIGNED NOT NULL,
    `list_type` ENUM('WATCHLIST', 'HOLDING', 'RECOMMENDED') NOT NULL DEFAULT 'WATCHLIST',
    `target_buy_price` DECIMAL(19, 4) NULL,
    `priority` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `memo` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `watchlist_items_security_id_key`(`security_id`),
    INDEX `watchlist_items_list_type_priority_idx`(`list_type`, `priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `buy_trades` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` BIGINT UNSIGNED NOT NULL,
    `security_id` BIGINT UNSIGNED NOT NULL,
    `bought_at` DATETIME(3) NOT NULL,
    `quantity` DECIMAL(18, 6) NOT NULL,
    `unit_price` DECIMAL(19, 4) NOT NULL,
    `memo` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `buy_trades_account_id_bought_at_idx`(`account_id`, `bought_at`),
    INDEX `buy_trades_account_id_security_id_bought_at_idx`(`account_id`, `security_id`, `bought_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sell_trades` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `buy_trade_id` BIGINT UNSIGNED NOT NULL,
    `sold_at` DATETIME(3) NOT NULL,
    `quantity` DECIMAL(18, 6) NOT NULL,
    `unit_price` DECIMAL(19, 4) NOT NULL,
    `memo` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sell_trades_buy_trade_id_sold_at_idx`(`buy_trade_id`, `sold_at`),
    INDEX `sell_trades_sold_at_idx`(`sold_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cash_transactions` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` BIGINT UNSIGNED NOT NULL,
    `transaction_type` ENUM('BUY', 'SELL', 'DEPOSIT', 'WITHDRAWAL', 'DIVIDEND') NOT NULL,
    `transaction_date` DATETIME(3) NOT NULL,
    `amount` DECIMAL(19, 4) NOT NULL,
    `fee_tax_amount` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `balance_after` DECIMAL(19, 4) NOT NULL,
    `memo` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `cash_transactions_account_id_transaction_date_idx`(`account_id`, `transaction_date`),
    INDEX `cash_transactions_account_id_transaction_type_transaction_da_idx`(`account_id`, `transaction_type`, `transaction_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dividends` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` BIGINT UNSIGNED NOT NULL,
    `security_id` BIGINT UNSIGNED NOT NULL,
    `received_date` DATE NOT NULL,
    `gross_amount` DECIMAL(19, 4) NOT NULL,
    `net_amount` DECIMAL(19, 4) NOT NULL,
    `memo` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `dividends_account_id_received_date_idx`(`account_id`, `received_date`),
    INDEX `dividends_security_id_received_date_idx`(`security_id`, `received_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `market_prices` (
    `security_id` BIGINT UNSIGNED NOT NULL,
    `current_price` DECIMAL(19, 4) NOT NULL,
    `previous_close_price` DECIMAL(19, 4) NULL,
    `price_updated_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`security_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_account_snapshots` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` BIGINT UNSIGNED NOT NULL,
    `snapshot_date` DATE NOT NULL,
    `cash_balance` DECIMAL(19, 4) NOT NULL,
    `stock_value` DECIMAL(19, 4) NOT NULL,
    `total_asset_value` DECIMAL(19, 4) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `daily_account_snapshots_account_id_snapshot_date_key`(`account_id`, `snapshot_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `daily_position_snapshots` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` BIGINT UNSIGNED NOT NULL,
    `security_id` BIGINT UNSIGNED NOT NULL,
    `snapshot_date` DATE NOT NULL,
    `quantity` DECIMAL(18, 6) NOT NULL,
    `purchase_amount` DECIMAL(19, 4) NOT NULL,
    `market_price` DECIMAL(19, 4) NOT NULL,
    `market_value` DECIMAL(19, 4) NOT NULL,
    `unrealized_profit_loss` DECIMAL(19, 4) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `daily_position_snapshots_account_id_security_id_snapshot_dat_key`(`account_id`, `security_id`, `snapshot_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `financial_statements` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `security_id` BIGINT UNSIGNED NOT NULL,
    `fiscal_year` SMALLINT UNSIGNED NOT NULL,
    `period_type` ENUM('ANNUAL', 'Q1', 'Q2', 'Q3', 'Q4') NOT NULL,
    `period_end_date` DATE NOT NULL,
    `revenue` DECIMAL(24, 0) NULL,
    `operating_profit` DECIMAL(24, 0) NULL,
    `net_income` DECIMAL(24, 0) NULL,
    `total_assets` DECIMAL(24, 0) NULL,
    `total_liabilities` DECIMAL(24, 0) NULL,
    `total_equity` DECIMAL(24, 0) NULL,
    `operating_cash_flow` DECIMAL(24, 0) NULL,
    `capital_expenditure` DECIMAL(24, 0) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `financial_statements_security_id_fiscal_year_period_type_key`(`security_id`, `fiscal_year`, `period_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `valuation_metrics` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `security_id` BIGINT UNSIGNED NOT NULL,
    `metric_date` DATE NOT NULL,
    `eps` DECIMAL(19, 4) NULL,
    `bps` DECIMAL(19, 4) NULL,
    `per` DECIMAL(19, 4) NULL,
    `pbr` DECIMAL(19, 4) NULL,
    `roe` DECIMAL(9, 4) NULL,
    `dividend_per_share` DECIMAL(19, 4) NULL,
    `dividend_yield` DECIMAL(9, 4) NULL,
    `market_cap` DECIMAL(24, 0) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `valuation_metrics_security_id_metric_date_key`(`security_id`, `metric_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `compound_growth_goals` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` BIGINT UNSIGNED NOT NULL,
    `period_name` VARCHAR(50) NOT NULL,
    `goal_name` VARCHAR(100) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `initial_asset_value` DECIMAL(19, 4) NOT NULL,
    `annual_target_rate` DECIMAL(9, 4) NOT NULL,
    `annual_contribution_amount` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `is_visible` BOOLEAN NOT NULL DEFAULT true,
    `display_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `memo` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `compound_growth_goals_account_id_start_date_end_date_idx`(`account_id`, `start_date`, `end_date`),
    INDEX `compound_growth_goals_account_id_is_visible_display_order_idx`(`account_id`, `is_visible`, `display_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `watchlist_items` ADD CONSTRAINT `watchlist_items_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `buy_trades` ADD CONSTRAINT `buy_trades_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `buy_trades` ADD CONSTRAINT `buy_trades_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sell_trades` ADD CONSTRAINT `sell_trades_buy_trade_id_fkey` FOREIGN KEY (`buy_trade_id`) REFERENCES `buy_trades`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cash_transactions` ADD CONSTRAINT `cash_transactions_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dividends` ADD CONSTRAINT `dividends_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dividends` ADD CONSTRAINT `dividends_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `market_prices` ADD CONSTRAINT `market_prices_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_account_snapshots` ADD CONSTRAINT `daily_account_snapshots_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_position_snapshots` ADD CONSTRAINT `daily_position_snapshots_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `daily_position_snapshots` ADD CONSTRAINT `daily_position_snapshots_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `financial_statements` ADD CONSTRAINT `financial_statements_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `valuation_metrics` ADD CONSTRAINT `valuation_metrics_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `compound_growth_goals` ADD CONSTRAINT `compound_growth_goals_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
