-- No origin is inferred from a prefix or a DART mapping. Old rows remain UNKNOWN.
-- This unique index deliberately fails on conflicting legacy codes; it never merges/deletes rows.
ALTER TABLE securities
 ADD COLUMN registration_source VARCHAR(20) NOT NULL DEFAULT 'UNKNOWN',
 ADD COLUMN collection_excluded BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN excluded_features JSON NULL,
 ADD COLUMN collection_revision INT NOT NULL DEFAULT 0,
 ADD COLUMN code_revision INT NOT NULL DEFAULT 0,
 ADD COLUMN code_changed_at DATETIME(3) NULL,
 ADD UNIQUE INDEX securities_symbol_key(symbol);
ALTER TABLE market_prices ADD COLUMN collection_symbol VARCHAR(20) NULL;
UPDATE market_prices d JOIN securities s ON s.id=d.security_id SET d.collection_symbol=s.symbol;
ALTER TABLE financial_statements ADD COLUMN collection_symbol VARCHAR(20) NULL;
UPDATE financial_statements d JOIN securities s ON s.id=d.security_id SET d.collection_symbol=s.symbol;
ALTER TABLE valuation_metrics ADD COLUMN collection_symbol VARCHAR(20) NULL;
UPDATE valuation_metrics d JOIN securities s ON s.id=d.security_id SET d.collection_symbol=s.symbol;
ALTER TABLE security_fundamentals ADD COLUMN collection_symbol VARCHAR(20) NULL;
UPDATE security_fundamentals d JOIN securities s ON s.id=d.security_id SET d.collection_symbol=s.symbol;
ALTER TABLE dart_financial_filings ADD COLUMN collection_symbol VARCHAR(20) NULL;
UPDATE dart_financial_filings d JOIN securities s ON s.id=d.security_id SET d.collection_symbol=s.symbol;
ALTER TABLE dart_share_snapshots ADD COLUMN collection_symbol VARCHAR(20) NULL;
UPDATE dart_share_snapshots d JOIN securities s ON s.id=d.security_id SET d.collection_symbol=s.symbol;
ALTER TABLE period_valuations ADD COLUMN collection_symbol VARCHAR(20) NULL;
UPDATE period_valuations d JOIN securities s ON s.id=d.security_id SET d.collection_symbol=s.symbol;
ALTER TABLE annual_consensus_snapshots ADD COLUMN collection_symbol VARCHAR(20) NULL;
UPDATE annual_consensus_snapshots d JOIN securities s ON s.id=d.security_id SET d.collection_symbol=s.symbol;
ALTER TABLE dart_corp_mappings ADD COLUMN collection_symbol VARCHAR(20) NULL;
UPDATE dart_corp_mappings d JOIN securities s ON s.id=d.security_id SET d.collection_symbol=s.symbol;
CREATE TABLE security_code_history (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 security_id BIGINT UNSIGNED NOT NULL, previous_symbol VARCHAR(20) NOT NULL, new_symbol VARCHAR(20) NOT NULL,
 code_revision INT NOT NULL, preserved_data JSON NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX security_code_history_security_id_code_revision_idx(security_id,code_revision),
 CONSTRAINT security_code_history_security_id_fkey FOREIGN KEY(security_id) REFERENCES securities(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
