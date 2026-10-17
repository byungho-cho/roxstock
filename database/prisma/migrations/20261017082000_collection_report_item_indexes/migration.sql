CREATE INDEX collector_items_created_scan_idx ON collector_run_items(status,created_at,id);
CREATE INDEX collector_items_observed_scan_idx ON collector_run_items(status,observed_at,id);
