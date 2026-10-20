-- AlterTable
ALTER TABLE `watchlist_items` ADD COLUMN `user_id` BIGINT UNSIGNED NULL;

-- CreateTable
CREATE TABLE `auth_retired_tokens` (
    `token_hash` CHAR(64) NOT NULL,
    `session_id` VARCHAR(64) NOT NULL,
    `grace_until` DATETIME(3) NOT NULL,

    INDEX `auth_retired_tokens_session_id_idx`(`session_id`),
    PRIMARY KEY (`token_hash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `watchlist_items` ADD CONSTRAINT `watchlist_items_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_retired_tokens` ADD CONSTRAINT `auth_retired_tokens_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `auth_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
