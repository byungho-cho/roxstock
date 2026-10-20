-- Additive only: legacy states and every existing task/filing remain intact.
ALTER TABLE dart_backfill_tasks MODIFY status ENUM('PENDING','PROCESSING','SUCCESS','NO_FILING','NOT_APPLICABLE','FAILED','NOT_DUE','DATA_UNAVAILABLE','EXCLUDED') NOT NULL DEFAULT 'PENDING';
CREATE INDEX dart_backfill_tasks_status_next_attempt_at_id_idx ON dart_backfill_tasks(status,next_attempt_at,id);
CREATE INDEX dart_backfill_tasks_error_code_status_id_idx ON dart_backfill_tasks(error_code,status,id);

CREATE TABLE dart_task_decisions (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 task_id BIGINT UNSIGNED NOT NULL,
 reason VARCHAR(64) NOT NULL,
 `previous` JSON NOT NULL,
 `next` JSON NOT NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY(id), INDEX dart_task_decisions_task_id_created_at_idx(task_id,created_at),
 CONSTRAINT dart_task_decisions_task_id_fkey FOREIGN KEY(task_id) REFERENCES dart_backfill_tasks(id) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
