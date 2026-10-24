CREATE TABLE account_notification_preferences (
 user_id BIGINT UNSIGNED NOT NULL, account_id BIGINT UNSIGNED NOT NULL,
 enabled BOOLEAN NOT NULL DEFAULT false, buy_enabled BOOLEAN NOT NULL DEFAULT false,
 sell_enabled BOOLEAN NOT NULL DEFAULT false, dividend_enabled BOOLEAN NOT NULL DEFAULT false,
 news_enabled BOOLEAN NOT NULL DEFAULT false, target_enabled BOOLEAN NOT NULL DEFAULT false,
 target_baseline BOOLEAN NOT NULL DEFAULT false,
 news_enabled_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL,
 PRIMARY KEY(user_id,account_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE app_push_devices ADD COLUMN policy_version INTEGER NOT NULL DEFAULT 2;
INSERT INTO account_notification_preferences
 (user_id,account_id,enabled,buy_enabled,sell_enabled,dividend_enabled,news_enabled,target_enabled,target_baseline,news_enabled_at,updated_at)
 SELECT a.user_id,a.id,(p.trade_enabled OR p.news_enabled OR p.target_enabled),p.trade_enabled,p.trade_enabled,p.trade_enabled,p.news_enabled,p.target_enabled,p.target_baseline,COALESCE(p.news_enabled_at,CURRENT_TIMESTAMP(3)),CURRENT_TIMESTAMP(3)
 FROM accounts a JOIN app_notification_preferences p ON p.user_id=a.user_id;
ALTER TABLE app_notification_events ADD COLUMN security_id BIGINT UNSIGNED NULL,
 ADD COLUMN news_id BIGINT UNSIGNED NULL, ADD COLUMN target_rate DECIMAL(9,4) NULL;
UPDATE app_notification_events SET
 security_id=CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(identity_key,':',4),':',-1) AS UNSIGNED),
 target_rate=CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(identity_key,':',6),':',-1) AS DECIMAL(9,4))
 WHERE kind='TARGET' AND identity_key REGEXP '^[0-9]+:TARGET:[0-9]+:[0-9]+:[0-9]+:[0-9]+([.][0-9]+)?:[0-9]{4}-[0-9]{2}-[0-9]{2}$';
CREATE TABLE app_target_daily_maxima (
 user_id BIGINT UNSIGNED NOT NULL,account_id BIGINT UNSIGNED NOT NULL,security_id BIGINT UNSIGNED NOT NULL,
 day CHAR(10) NOT NULL,rate DECIMAL(9,4) NOT NULL,
 PRIMARY KEY(user_id,account_id,security_id,day)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO app_target_daily_maxima(user_id,account_id,security_id,day,rate)
 SELECT user_id,account_id,security_id,SUBSTRING_INDEX(identity_key,':',-1),MAX(target_rate)
 FROM app_notification_events WHERE kind='TARGET' AND security_id IS NOT NULL AND account_id IS NOT NULL AND target_rate IS NOT NULL
 GROUP BY user_id,account_id,security_id,SUBSTRING_INDEX(identity_key,':',-1);
