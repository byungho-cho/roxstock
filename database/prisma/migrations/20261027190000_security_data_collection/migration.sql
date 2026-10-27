CREATE TABLE security_data_cursor (
 id INTEGER NOT NULL, failures INTEGER NOT NULL DEFAULT 0, fromDate CHAR(8) NOT NULL, throughDate CHAR(8) NOT NULL, page INTEGER NOT NULL DEFAULT 1,
 next_check_at DATETIME(3) NOT NULL, last_completed_at DATETIME(3) NULL, updated_at DATETIME(3) NOT NULL,
 PRIMARY KEY(id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE security_data_receipts (
 receipt_no CHAR(14) NOT NULL, corp_code CHAR(8) NOT NULL, disclosed_date CHAR(8) NOT NULL, report JSON NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'PENDING', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 result JSON NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL,
 PRIMARY KEY(receipt_no), INDEX security_data_receipts_status_next_attempt_at_idx(status,next_attempt_at)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE security_data_edits (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, security_id BIGINT UNSIGNED NOT NULL, fiscal_year SMALLINT UNSIGNED NOT NULL,
 period_type VARCHAR(10) NOT NULL, field VARCHAR(40) NOT NULL, `before` JSON NOT NULL, `after` JSON NOT NULL,
 user_id BIGINT UNSIGNED NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY(id),
 INDEX security_data_edits_security_id_fiscal_year_period_type_idx(security_id,fiscal_year,period_type)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
