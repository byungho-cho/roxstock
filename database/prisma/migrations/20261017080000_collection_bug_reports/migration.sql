CREATE TABLE collection_bug_reports (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, fingerprint CHAR(64) NOT NULL,
 feature VARCHAR(100) NOT NULL, code VARCHAR(80) NOT NULL, severity VARCHAR(16) NOT NULL,
 summary VARCHAR(300) NOT NULL, state VARCHAR(16) NOT NULL DEFAULT 'OPEN', occurrences INT UNSIGNED NOT NULL DEFAULT 0,
 first_seen_at DATETIME(3) NOT NULL, last_seen_at DATETIME(3) NOT NULL, review_note VARCHAR(1000) NULL, resolved_at DATETIME(3) NULL,
 PRIMARY KEY(id), UNIQUE KEY collection_bug_reports_fingerprint_key(fingerprint), KEY collection_bug_reports_state_last_seen_at_id_idx(state,last_seen_at,id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE collection_bug_occurrences (
 event_key CHAR(64) NOT NULL, report_id BIGINT UNSIGNED NULL, observed_at DATETIME(3) NOT NULL,
 security_id BIGINT UNSIGNED NULL, symbol VARCHAR(20) NULL, fiscal_year SMALLINT UNSIGNED NULL, period_type VARCHAR(10) NULL,
 run_id BIGINT UNSIGNED NULL, metric VARCHAR(20) NULL, PRIMARY KEY(event_key), KEY collection_bug_occurrences_report_id_observed_at_idx(report_id,observed_at),
 CONSTRAINT collection_bug_occurrences_report_id_fkey FOREIGN KEY(report_id) REFERENCES collection_bug_reports(id) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE collection_bug_scan_state (`key` VARCHAR(40) NOT NULL, scanned_at DATETIME(3) NOT NULL, PRIMARY KEY(`key`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
