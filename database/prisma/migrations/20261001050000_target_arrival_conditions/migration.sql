ALTER TABLE `accounts` ADD COLUMN `target_arrival_conditions` JSON NULL, ADD COLUMN `target_arrival_version` INTEGER UNSIGNED NOT NULL DEFAULT 0;
