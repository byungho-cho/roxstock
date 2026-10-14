CREATE TABLE `analysis_revisions` (`key` VARCHAR(64) NOT NULL, `revision` BIGINT UNSIGNED NOT NULL DEFAULT 0, `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`key`));
CREATE TABLE `analysis_read_cache` (`key` VARCHAR(191) NOT NULL, `revision` VARCHAR(64) NOT NULL, `payload` JSON NOT NULL, `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`key`));
INSERT INTO `analysis_revisions` (`key`,`revision`) VALUES ('financial',0);
CREATE TRIGGER `arc_financial_statements_insert` AFTER INSERT ON `financial_statements` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_financial_statements_update` AFTER UPDATE ON `financial_statements` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_financial_statements_delete` AFTER DELETE ON `financial_statements` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',OLD.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_valuation_metrics_insert` AFTER INSERT ON `valuation_metrics` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_valuation_metrics_update` AFTER UPDATE ON `valuation_metrics` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_valuation_metrics_delete` AFTER DELETE ON `valuation_metrics` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',OLD.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_dart_financial_filings_insert` AFTER INSERT ON `dart_financial_filings` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_dart_financial_filings_update` AFTER UPDATE ON `dart_financial_filings` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_dart_financial_filings_delete` AFTER DELETE ON `dart_financial_filings` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',OLD.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_period_valuations_insert` AFTER INSERT ON `period_valuations` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_period_valuations_update` AFTER UPDATE ON `period_valuations` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_period_valuations_delete` AFTER DELETE ON `period_valuations` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',OLD.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_dart_share_snapshots_insert` AFTER INSERT ON `dart_share_snapshots` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_dart_share_snapshots_update` AFTER UPDATE ON `dart_share_snapshots` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_dart_share_snapshots_delete` AFTER DELETE ON `dart_share_snapshots` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',OLD.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_annual_consensus_snapshots_insert` AFTER INSERT ON `annual_consensus_snapshots` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_annual_consensus_snapshots_update` AFTER UPDATE ON `annual_consensus_snapshots` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_annual_consensus_snapshots_delete` AFTER DELETE ON `annual_consensus_snapshots` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',OLD.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_securities_insert` AFTER INSERT ON `securities` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_securities_update` AFTER UPDATE ON `securities` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_securities_delete` AFTER DELETE ON `securities` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',OLD.`id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_dart_backfill_tasks_insert` AFTER INSERT ON `dart_backfill_tasks` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_dart_backfill_tasks_update` AFTER UPDATE ON `dart_backfill_tasks` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',NEW.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
CREATE TRIGGER `arc_dart_backfill_tasks_delete` AFTER DELETE ON `dart_backfill_tasks` FOR EACH ROW
BEGIN
UPDATE `analysis_revisions` SET `revision`=`revision`+1, `updated_at`=CURRENT_TIMESTAMP(3) WHERE `key`='financial';
INSERT INTO `analysis_revisions` (`key`, `revision`, `updated_at`) VALUES (CONCAT('security:',OLD.`security_id`),1,CURRENT_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE `revision`=`revision`+1,`updated_at`=CURRENT_TIMESTAMP(3);
END;
