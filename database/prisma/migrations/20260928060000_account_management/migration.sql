ALTER TABLE `accounts`
  ADD COLUMN `normalized_account_number` VARCHAR(50) NULL,
  ADD COLUMN `is_default` BOOLEAN NOT NULL DEFAULT false;

UPDATE `accounts`
SET `normalized_account_number` = NULLIF(
  REPLACE(REPLACE(REPLACE(TRIM(`account_number`), '-', ''), ' ', ''), CHAR(9), ''),
  ''
);

UPDATE `accounts`
SET `is_default` = true
WHERE `id` = (
  SELECT `selected_id`
  FROM (
    SELECT `id` AS `selected_id`
    FROM `accounts`
    WHERE `is_active` = true
    ORDER BY `display_order`, `id`
    LIMIT 1
  ) AS `first_active_account`
);

CREATE UNIQUE INDEX `accounts_broker_name_normalized_account_number_key`
  ON `accounts`(`broker_name`, `normalized_account_number`);
CREATE INDEX `accounts_is_active_is_default_idx`
  ON `accounts`(`is_active`, `is_default`);
