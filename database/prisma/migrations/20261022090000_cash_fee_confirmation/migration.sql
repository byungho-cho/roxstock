-- Preserve all existing amounts. Legacy zero/nonzero costs have unknown confirmation provenance.
ALTER TABLE cash_transactions
 ADD COLUMN fee_tax_status VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
 ADD COLUMN fee_tax_basis_count TINYINT UNSIGNED NULL,
 ADD INDEX cash_fee_history_idx (account_id, transaction_type, fee_tax_status, transaction_date, id);
