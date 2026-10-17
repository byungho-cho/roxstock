-- Existing human-resolved reports remain resolved when occurrence-level tracking starts.
UPDATE `collection_bug_occurrences` e
JOIN `collection_bug_reports` r ON r.id=e.report_id
SET e.resolved_at=COALESCE(r.resolved_at,r.last_seen_at), e.resolution='MANUAL_REVIEW'
WHERE r.state='RESOLVED' AND e.resolved_at IS NULL;
