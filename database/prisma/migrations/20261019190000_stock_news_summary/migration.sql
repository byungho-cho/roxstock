-- Additive only. Keep existing summaries, items, relationships and collection history.
ALTER TABLE stock_news_items
 ADD COLUMN summary_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
 ADD COLUMN summary_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
 ADD COLUMN summary_checked_at DATETIME(3) NULL,
 ADD COLUMN summary_next_retry_at DATETIME(3) NULL,
 ADD COLUMN summary_source VARCHAR(2048) NULL,
 ADD COLUMN summary_reason VARCHAR(120) NULL;
UPDATE stock_news_items SET summary_status='READY' WHERE summary IS NOT NULL;
CREATE INDEX stock_news_summary_queue_idx ON stock_news_items(summary_status,summary_next_retry_at,id);
