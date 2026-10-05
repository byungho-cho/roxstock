CREATE TABLE `account_watchlist_items` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_id` BIGINT UNSIGNED NOT NULL,
  `security_id` BIGINT UNSIGNED NOT NULL,
  `list_type` ENUM('WATCHLIST','HOLDING','RECOMMENDED') NOT NULL DEFAULT 'WATCHLIST',
  `target_buy_price` DECIMAL(19,4) NULL,
  `priority` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `memo` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `account_watchlist_items_account_id_security_id_key` (`account_id`,`security_id`),
  KEY `account_watchlist_items_security_id_idx` (`security_id`),
  KEY `account_watchlist_items_account_id_list_type_priority_idx` (`account_id`,`list_type`,`priority`),
  CONSTRAINT `account_watchlist_items_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `account_watchlist_items_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `trade_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_id` BIGINT UNSIGNED NOT NULL,
  `request_id` VARCHAR(64) NOT NULL,
  `operation` VARCHAR(8) NOT NULL,
  `request_hash` CHAR(64) NOT NULL,
  `response` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `trade_requests_account_id_request_id_key` (`account_id`,`request_id`),
  CONSTRAINT `trade_requests_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Legacy classifications had no account owner. Preserve the original table unchanged.
-- Manual watch/recommend entries belong to the first/default active account only;
-- never broadcast them to every account. A legacy HOLDING belongs to its trade owners.
INSERT INTO `account_watchlist_items`
  (`account_id`,`security_id`,`list_type`,`target_buy_price`,`priority`,`memo`,`created_at`,`updated_at`)
SELECT a.id,w.security_id,w.list_type,w.target_buy_price,w.priority,w.memo,w.created_at,w.updated_at
FROM watchlist_items w
JOIN accounts a ON a.id=(SELECT id FROM accounts WHERE is_active=TRUE ORDER BY is_default DESC,display_order,id LIMIT 1)
WHERE w.list_type <> 'HOLDING'
   OR NOT EXISTS (SELECT 1 FROM buy_trades bt WHERE bt.security_id=w.security_id);

INSERT INTO `account_watchlist_items`
  (`account_id`,`security_id`,`list_type`,`target_buy_price`,`priority`,`memo`,`created_at`,`updated_at`)
SELECT DISTINCT bt.account_id,w.security_id,w.list_type,w.target_buy_price,w.priority,w.memo,w.created_at,w.updated_at
FROM watchlist_items w JOIN buy_trades bt ON bt.security_id=w.security_id
WHERE w.list_type='HOLDING';
