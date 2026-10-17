ALTER TABLE `collection_bug_occurrences`
 ADD COLUMN `resolved_at` DATETIME(3) NULL,
 ADD COLUMN `resolution` VARCHAR(100) NULL,
 ADD INDEX `collection_bug_occurrences_resolved_at_event_key_idx` (`resolved_at`,`event_key`);
