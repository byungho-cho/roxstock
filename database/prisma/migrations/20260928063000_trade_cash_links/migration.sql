ALTER TABLE `cash_transactions`
  ADD COLUMN `buy_trade_id` BIGINT UNSIGNED NULL,
  ADD COLUMN `sell_trade_id` BIGINT UNSIGNED NULL,
  ADD UNIQUE INDEX `cash_transactions_buy_trade_id_key` (`buy_trade_id`),
  ADD UNIQUE INDEX `cash_transactions_sell_trade_id_key` (`sell_trade_id`),
  ADD CONSTRAINT `cash_transactions_buy_trade_id_fkey`
    FOREIGN KEY (`buy_trade_id`) REFERENCES `buy_trades` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `cash_transactions_sell_trade_id_fkey`
    FOREIGN KEY (`sell_trade_id`) REFERENCES `sell_trades` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
