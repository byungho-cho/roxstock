-- Keep every historical event; retire only duplicate pending representations.
CREATE TEMPORARY TABLE rox_target_duplicate_ids AS
 SELECT id FROM (
  SELECT id,ROW_NUMBER() OVER (
   PARTITION BY user_id,account_id,security_id
   ORDER BY target_rate DESC,created_at DESC,id DESC
  ) AS row_rank
  FROM app_notification_events
  WHERE kind='TARGET' AND security_id IS NOT NULL AND read_at IS NULL AND dismissed_at IS NULL
 ) ranked WHERE row_rank>1;
UPDATE app_notification_events e JOIN rox_target_duplicate_ids d ON e.id=d.id
 SET e.dismissed_at=CURRENT_TIMESTAMP(3);
UPDATE app_push_deliveries d JOIN rox_target_duplicate_ids e ON e.id=d.event_id
 SET d.status='CANCELLED',d.error_code='HIGHER_TARGET' WHERE d.status='PENDING';
DROP TEMPORARY TABLE rox_target_duplicate_ids;
