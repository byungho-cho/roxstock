ALTER TABLE app_notification_preferences ADD COLUMN trade_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_notification_events ADD COLUMN read_at DATETIME(3) NULL, ADD COLUMN dismissed_at DATETIME(3) NULL, ADD COLUMN title VARCHAR(160) NULL, ADD COLUMN detail VARCHAR(500) NULL;
CREATE INDEX app_notification_inbox ON app_notification_events(user_id, read_at, dismissed_at, created_at);
-- Establish a fresh baseline when switching from the previous rearm policy.
UPDATE app_notification_preferences SET target_baseline = FALSE WHERE target_enabled = TRUE;
