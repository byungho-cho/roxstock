ALTER TABLE `compound_growth_plans` ADD COLUMN `display_color` VARCHAR(20) NULL;

-- Preserve the original first goal's registration color independently of the default goal.
UPDATE `compound_growth_plans` AS p
SET p.`display_color` = (
  SELECT g.`display_color` FROM `compound_growth_goals` AS g
  WHERE g.`plan_id` = p.`id`
  ORDER BY g.`display_order` ASC, g.`id` ASC LIMIT 1
);
