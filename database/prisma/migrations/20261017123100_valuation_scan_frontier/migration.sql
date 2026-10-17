-- Freeze each bounded sweep's frontier; inserts cannot indefinitely postpone revisiting corrections.
ALTER TABLE `valuation_supplement_scan` ADD COLUMN `upper_id` BIGINT UNSIGNED NOT NULL DEFAULT 0;
