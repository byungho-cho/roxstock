CREATE TABLE `app_notification_preferences` (
    `user_id` BIGINT UNSIGNED NOT NULL,
    `target_enabled` BOOLEAN NOT NULL DEFAULT false,
    `news_enabled` BOOLEAN NOT NULL DEFAULT false,
    `target_baseline` BOOLEAN NOT NULL DEFAULT false,
    `news_cursor` BIGINT UNSIGNED NOT NULL DEFAULT 0,
    `target_epoch` INTEGER NOT NULL DEFAULT 0,
    `news_epoch` INTEGER NOT NULL DEFAULT 0,
    `news_enabled_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `app_push_devices` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `session_id` VARCHAR(64) NOT NULL,
    `token` VARCHAR(2048) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `binding` VARCHAR(64) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `app_push_devices_token_hash_key`(`token_hash`),
    INDEX `app_push_devices_user_id_session_id_idx`(`user_id`, `session_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `app_target_notification_states` (
    `user_id` BIGINT UNSIGNED NOT NULL,
    `lot_id` BIGINT UNSIGNED NOT NULL,
    `epoch` INTEGER NOT NULL,
    `matched` BOOLEAN NOT NULL,
    `false_since` DATETIME(3) NULL,
    `last_observed_at` DATETIME(3) NOT NULL,
    `last_event_at` DATETIME(3) NULL,
    `generation` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`user_id`, `lot_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `app_notification_events` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `kind` VARCHAR(16) NOT NULL,
    `identity_key` VARCHAR(160) NOT NULL,
    `epoch` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `app_notification_events_identity_key_key`(`identity_key`),
    INDEX `app_notification_events_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `app_push_deliveries` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `event_id` VARCHAR(64) NOT NULL,
    `device_id` VARCHAR(64) NOT NULL,
    `binding` VARCHAR(64) NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `next_attempt_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `error_code` VARCHAR(40) NULL,
    `sent_at` DATETIME(3) NULL,

    INDEX `app_push_deliveries_status_next_attempt_at_id_idx`(`status`, `next_attempt_at`, `id`),
    UNIQUE INDEX `app_push_deliveries_event_id_device_id_key`(`event_id`, `device_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_user_read_audits` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `actor_id` BIGINT UNSIGNED NOT NULL,
    `subject_id` BIGINT UNSIGNED NULL,
    `action` VARCHAR(16) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `admin_user_read_audits_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `auth_users_created_at_id_idx` ON `auth_users`(`created_at`, `id`);

ALTER TABLE `stock_news_items` ADD COLUMN `notification_security_ids` JSON NULL;
