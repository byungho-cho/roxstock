ALTER TABLE dart_financial_filings ADD COLUMN source_validation JSON NULL;
ALTER TABLE dart_backfill_tasks ADD COLUMN diagnostics JSON NULL;
ALTER TABLE collector_run_items ADD COLUMN diagnostics JSON NULL;
