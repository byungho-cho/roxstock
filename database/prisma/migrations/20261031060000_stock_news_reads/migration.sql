CREATE TABLE `stock_news_reads` (
 `user_id` BIGINT UNSIGNED NOT NULL,
 `news_id` BIGINT UNSIGNED NOT NULL,
 `read_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (`user_id`, `news_id`),
 INDEX `stock_news_reads_news_id_idx` (`news_id`),
 CONSTRAINT `stock_news_reads_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `auth_users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
 CONSTRAINT `stock_news_reads_news_id_fkey` FOREIGN KEY (`news_id`) REFERENCES `stock_news_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
