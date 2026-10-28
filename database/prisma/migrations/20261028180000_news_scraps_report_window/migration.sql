CREATE TABLE `stock_news_scraps` (
 `user_id` BIGINT UNSIGNED NOT NULL,
 `news_id` BIGINT UNSIGNED NOT NULL,
 `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`user_id`,`news_id`),
 INDEX `stock_news_scraps_news_id_idx` (`news_id`),
 CONSTRAINT `stock_news_scraps_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT `stock_news_scraps_news_id_fkey` FOREIGN KEY (`news_id`) REFERENCES `stock_news_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `collection_bug_reporting_window` (
 `id` INTEGER NOT NULL DEFAULT 1,
 `reporting_from` DATETIME(3) NOT NULL,
 PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
INSERT INTO `collection_bug_reporting_window` (`id`,`reporting_from`) VALUES (1,UTC_TIMESTAMP(3));
