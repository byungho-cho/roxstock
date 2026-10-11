CREATE TABLE account_profit_revisions (
 account_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
 revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
 CONSTRAINT profit_revision_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;
CREATE TABLE investment_year_aggregates (
 account_id BIGINT UNSIGNED NOT NULL,
 year SMALLINT UNSIGNED NOT NULL,
 calculation_version INT UNSIGNED NOT NULL,
 source_revision BIGINT UNSIGNED NOT NULL,
 basis_date DATE NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'DIRTY',
 payload JSON NOT NULL,
 calculated_at DATETIME(3) NOT NULL,
 PRIMARY KEY(account_id, year),
 CONSTRAINT profit_aggregate_account_fk FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;
INSERT INTO account_profit_revisions(account_id) SELECT id FROM accounts;
CREATE TRIGGER profit_account_insert AFTER INSERT ON accounts FOR EACH ROW
 INSERT INTO account_profit_revisions(account_id) VALUES(NEW.id);
CREATE TRIGGER profit_buy_trades_insert AFTER INSERT ON buy_trades FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(NEW.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=NEW.account_id AND year>=YEAR(DATE_ADD(NEW.bought_at, INTERVAL 9 HOUR));
END;
CREATE TRIGGER profit_buy_trades_delete AFTER DELETE ON buy_trades FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(OLD.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=OLD.account_id;
END;
CREATE TRIGGER profit_buy_trades_update AFTER UPDATE ON buy_trades FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(OLD.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=OLD.account_id AND year>=LEAST(YEAR(DATE_ADD(OLD.bought_at, INTERVAL 9 HOUR)),COALESCE((SELECT MIN(YEAR(DATE_ADD(sold_at, INTERVAL 9 HOUR))) FROM sell_trades WHERE buy_trade_id=NEW.id),YEAR(DATE_ADD(OLD.bought_at, INTERVAL 9 HOUR))));
INSERT INTO account_profit_revisions(account_id,revision) VALUES(NEW.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=NEW.account_id AND year>=LEAST(YEAR(DATE_ADD(NEW.bought_at, INTERVAL 9 HOUR)),COALESCE((SELECT MIN(YEAR(DATE_ADD(sold_at, INTERVAL 9 HOUR))) FROM sell_trades WHERE buy_trade_id=NEW.id),YEAR(DATE_ADD(NEW.bought_at, INTERVAL 9 HOUR))));
END;
CREATE TRIGGER profit_cash_transactions_insert AFTER INSERT ON cash_transactions FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(NEW.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=NEW.account_id AND year>=YEAR(DATE_ADD(NEW.transaction_date, INTERVAL 9 HOUR));
END;
CREATE TRIGGER profit_cash_transactions_delete AFTER DELETE ON cash_transactions FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(OLD.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=OLD.account_id AND year>=YEAR(DATE_ADD(OLD.transaction_date, INTERVAL 9 HOUR));
END;
CREATE TRIGGER profit_cash_transactions_update AFTER UPDATE ON cash_transactions FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(OLD.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=OLD.account_id AND year>=YEAR(DATE_ADD(OLD.transaction_date, INTERVAL 9 HOUR));
INSERT INTO account_profit_revisions(account_id,revision) VALUES(NEW.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=NEW.account_id AND year>=YEAR(DATE_ADD(NEW.transaction_date, INTERVAL 9 HOUR));
END;
CREATE TRIGGER profit_dividends_insert AFTER INSERT ON dividends FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(NEW.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=NEW.account_id AND year>=LEAST(YEAR(NEW.received_date),COALESCE((SELECT YEAR(DATE_ADD(transaction_date, INTERVAL 9 HOUR)) FROM cash_transactions WHERE id=NEW.cash_transaction_id),YEAR(NEW.received_date)));
END;
CREATE TRIGGER profit_dividends_delete AFTER DELETE ON dividends FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(OLD.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=OLD.account_id AND year>=LEAST(YEAR(OLD.received_date),COALESCE((SELECT YEAR(DATE_ADD(transaction_date, INTERVAL 9 HOUR)) FROM cash_transactions WHERE id=OLD.cash_transaction_id),YEAR(OLD.received_date)));
END;
CREATE TRIGGER profit_dividends_update AFTER UPDATE ON dividends FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(OLD.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=OLD.account_id AND year>=LEAST(YEAR(OLD.received_date),COALESCE((SELECT YEAR(DATE_ADD(transaction_date, INTERVAL 9 HOUR)) FROM cash_transactions WHERE id=OLD.cash_transaction_id),YEAR(OLD.received_date)));
INSERT INTO account_profit_revisions(account_id,revision) VALUES(NEW.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=NEW.account_id AND year>=LEAST(YEAR(NEW.received_date),COALESCE((SELECT YEAR(DATE_ADD(transaction_date, INTERVAL 9 HOUR)) FROM cash_transactions WHERE id=NEW.cash_transaction_id),YEAR(NEW.received_date)));
END;
CREATE TRIGGER profit_daily_account_snapshots_insert AFTER INSERT ON daily_account_snapshots FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(NEW.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=NEW.account_id AND year>=YEAR(NEW.snapshot_date);
END;
CREATE TRIGGER profit_daily_account_snapshots_delete AFTER DELETE ON daily_account_snapshots FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(OLD.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=OLD.account_id AND year>=YEAR(OLD.snapshot_date);
END;
CREATE TRIGGER profit_daily_account_snapshots_update AFTER UPDATE ON daily_account_snapshots FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(OLD.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=OLD.account_id AND year>=YEAR(OLD.snapshot_date);
INSERT INTO account_profit_revisions(account_id,revision) VALUES(NEW.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=NEW.account_id AND year>=YEAR(NEW.snapshot_date);
END;
CREATE TRIGGER profit_daily_position_snapshots_insert AFTER INSERT ON daily_position_snapshots FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(NEW.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=NEW.account_id AND year>=YEAR(NEW.snapshot_date);
END;
CREATE TRIGGER profit_daily_position_snapshots_delete AFTER DELETE ON daily_position_snapshots FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(OLD.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=OLD.account_id AND year>=YEAR(OLD.snapshot_date);
END;
CREATE TRIGGER profit_daily_position_snapshots_update AFTER UPDATE ON daily_position_snapshots FOR EACH ROW BEGIN
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(OLD.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=OLD.account_id AND year>=YEAR(OLD.snapshot_date);
INSERT INTO account_profit_revisions(account_id,revision) VALUES(NEW.account_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=NEW.account_id AND year>=YEAR(NEW.snapshot_date);
END;
CREATE TRIGGER profit_sell_trades_insert AFTER INSERT ON sell_trades FOR EACH ROW BEGIN
 DECLARE owner_id BIGINT UNSIGNED;
 SELECT account_id INTO owner_id FROM buy_trades WHERE id=NEW.buy_trade_id;
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(owner_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=owner_id AND year>=YEAR(DATE_ADD(NEW.sold_at, INTERVAL 9 HOUR));
END;
CREATE TRIGGER profit_sell_trades_delete AFTER DELETE ON sell_trades FOR EACH ROW BEGIN
 DECLARE owner_id BIGINT UNSIGNED;
 SELECT account_id INTO owner_id FROM buy_trades WHERE id=OLD.buy_trade_id;
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(owner_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=owner_id AND year>=YEAR(DATE_ADD(OLD.sold_at, INTERVAL 9 HOUR));
END;
CREATE TRIGGER profit_sell_trades_update AFTER UPDATE ON sell_trades FOR EACH ROW BEGIN
 DECLARE owner_id BIGINT UNSIGNED;
 SELECT account_id INTO owner_id FROM buy_trades WHERE id=NEW.buy_trade_id;
 INSERT INTO account_profit_revisions(account_id,revision) VALUES(owner_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=owner_id AND year>=YEAR(DATE_ADD(NEW.sold_at, INTERVAL 9 HOUR));
SELECT account_id INTO owner_id FROM buy_trades WHERE id=OLD.buy_trade_id;
INSERT INTO account_profit_revisions(account_id,revision) VALUES(owner_id,1) ON DUPLICATE KEY UPDATE revision=revision+1;
 UPDATE investment_year_aggregates SET state='DIRTY' WHERE account_id=owner_id AND year>=YEAR(DATE_ADD(OLD.sold_at, INTERVAL 9 HOUR));
END;
CREATE TRIGGER profit_security_name_update AFTER UPDATE ON securities FOR EACH ROW BEGIN
 IF NOT (OLD.name <=> NEW.name) THEN
 UPDATE account_profit_revisions r SET revision=revision+1 WHERE EXISTS(SELECT 1 FROM buy_trades b WHERE b.account_id=r.account_id AND b.security_id=NEW.id) OR EXISTS(SELECT 1 FROM dividends d WHERE d.account_id=r.account_id AND d.security_id=NEW.id);
 UPDATE investment_year_aggregates a SET state='DIRTY' WHERE EXISTS(SELECT 1 FROM buy_trades b WHERE b.account_id=a.account_id AND b.security_id=NEW.id) OR EXISTS(SELECT 1 FROM dividends d WHERE d.account_id=a.account_id AND d.security_id=NEW.id);
 END IF;
END;
