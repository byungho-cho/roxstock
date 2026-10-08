-- CreateTable
CREATE TABLE `annual_consensus_snapshots` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `security_id` BIGINT UNSIGNED NOT NULL,
    `fiscal_year` SMALLINT UNSIGNED NOT NULL,
    `source` VARCHAR(100) NOT NULL,
    `as_of` DATETIME(3) NOT NULL,
    `collected_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `state` VARCHAR(24) NOT NULL DEFAULT 'ESTIMATED',
    `data` JSON NOT NULL,
    `frozen_close` JSON NULL,
    `final_values` JSON NULL,
    `finalized_at` DATETIME(3) NULL,

    INDEX `annual_consensus_snapshots_security_id_fiscal_year_state_idx`(`security_id`, `fiscal_year`, `state`),
    UNIQUE INDEX `annual_consensus_snapshots_security_id_fiscal_year_source_as_key`(`security_id`, `fiscal_year`, `source`, `as_of`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `annual_consensus_snapshots` ADD CONSTRAINT `annual_consensus_snapshots_security_id_fkey` FOREIGN KEY (`security_id`) REFERENCES `securities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

