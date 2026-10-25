ALTER TABLE `financial_statements`
  ADD COLUMN `source` VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN `source_metadata` JSON NULL;
