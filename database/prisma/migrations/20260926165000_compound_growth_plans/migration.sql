-- Refactor compound growth data from one row per goal into one plan with many goals.
-- Existing rows are preserved as one plan with one default goal.

CREATE TABLE `compound_growth_plans` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `account_id` BIGINT UNSIGNED NOT NULL,
    `plan_name` VARCHAR(100) NOT NULL,
    `start_date` DATE NOT NULL,
    `end_date` DATE NOT NULL,
    `initial_asset_value` DECIMAL(19, 4) NOT NULL,
    `annual_contribution_amount` DECIMAL(19, 4) NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `display_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `memo` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `compound_growth_plans_account_id_start_date_end_date_idx`(`account_id`, `start_date`, `end_date`),
    INDEX `compound_growth_plans_account_id_is_active_display_order_idx`(`account_id`, `is_active`, `display_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `compound_growth_goals_v03` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `plan_id` BIGINT UNSIGNED NOT NULL,
    `goal_name` VARCHAR(100) NOT NULL,
    `annual_target_rate` DECIMAL(9, 4) NOT NULL,
    `display_color` VARCHAR(20) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `is_visible` BOOLEAN NOT NULL DEFAULT true,
    `display_order` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `compound_growth_goals_plan_id_goal_name_key`(`plan_id`, `goal_name`),
    INDEX `compound_growth_goals_plan_id_is_default_idx`(`plan_id`, `is_default`),
    INDEX `compound_growth_goals_plan_id_is_visible_display_order_idx`(`plan_id`, `is_visible`, `display_order`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `compound_growth_plans` (
    `id`, `account_id`, `plan_name`, `start_date`, `end_date`,
    `initial_asset_value`, `annual_contribution_amount`, `is_active`,
    `display_order`, `memo`, `created_at`, `updated_at`
)
SELECT
    `id`, `account_id`, `period_name`, `start_date`, `end_date`,
    `initial_asset_value`, `annual_contribution_amount`, true,
    `display_order`, `memo`, `created_at`, `updated_at`
FROM `compound_growth_goals`;

INSERT INTO `compound_growth_goals_v03` (
    `id`, `plan_id`, `goal_name`, `annual_target_rate`,
    `display_color`, `is_default`, `is_visible`, `display_order`,
    `created_at`, `updated_at`
)
SELECT
    `id`, `id`, `goal_name`, `annual_target_rate`,
    NULL, true, `is_visible`, 0, `created_at`, `updated_at`
FROM `compound_growth_goals`;

DROP TABLE `compound_growth_goals`;
RENAME TABLE `compound_growth_goals_v03` TO `compound_growth_goals`;

ALTER TABLE `compound_growth_plans`
    ADD CONSTRAINT `compound_growth_plans_account_id_fkey`
    FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `compound_growth_goals`
    ADD CONSTRAINT `compound_growth_goals_plan_id_fkey`
    FOREIGN KEY (`plan_id`) REFERENCES `compound_growth_plans`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
