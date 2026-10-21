#!/usr/bin/env bash
set -Eeuo pipefail
SHA="${1:?immutable SHA required}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
for entry in roxstock-backend:backend roxstock-dart-collector:collector roxstock-frontend:frontend; do
  container="${entry%%:*}"; component="${entry##*:}"
  [[ "$(docker inspect --format '{{.Config.Image}}' "$container")" == "newrox/roxstock-$component:sha-$SHA" ]] || exit 1
done
umask 077
source_root=/opt/roxstock
exec 8>"$source_root/.deploy/production.lock"
flock -w 300 8
marker="$source_root/.deploy/dart-status-backup-$SHA"
if [[ ! -f "$marker" ]]; then
  backup_id="roxstock-v0.2-$(date -u +%Y%m%dT%H%M%SZ)"
  backup_dir="$source_root/backups/$backup_id"
  install -d -m 700 "$backup_dir"
  backup_file="$backup_dir/$backup_id.sql.gz"
  timeout 300 docker exec roxstock-mariadb sh -c '
    export MYSQL_PWD="${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"
    test -n "$MYSQL_PWD" || exit 1
    exec mariadb-dump -uroot --single-transaction --quick --routines --events --triggers --hex-blob roxstock
  ' 2>"$backup_dir/database-backup.log" | gzip > "$backup_file.partial"
  test -s "$backup_file.partial"
  gzip -t "$backup_file.partial"
  mv "$backup_file.partial" "$backup_file"
  sha256sum "$backup_file" > "$backup_file.sha256"
  sha256sum -c "$backup_file.sha256" > /dev/null
  printf '%s\n' "$backup_dir" > "$marker"
fi
backup_dir="$(cat "$marker")"
[[ "$backup_dir" == "$source_root/backups/roxstock-v0.2-"* && -d "$backup_dir" ]] || exit 1
private_plan="$backup_dir/dart-status-plan.json"
container_plan="/tmp/dart-status-$SHA.json"
log="$backup_dir/dart-status-result.log"
run_private() {
  local attempt result
  for attempt in $(seq 1 24); do
    if docker exec roxstock-dart-collector node collector/dist/scripts/reconcile-dart-task-status.js "$@" >> "$log" 2>&1; then return 0; else result=$?; fi
    [[ "$result" == 75 ]] || return "$result"
    sleep 10
  done
  return 75
}
# Plan contains task snapshots, reasons and receipt history. Never emit or upload it.
if [[ ! -f "$private_plan" ]]; then
  if ! docker exec roxstock-dart-collector test -f "$container_plan"; then
    run_private plan "$container_plan" || { echo DART_STATUS_PLAN_NOT_CREATED; exit 1; }
  fi
  docker cp "roxstock-dart-collector:$container_plan" "$private_plan" >/dev/null
  chmod 600 "$private_plan"
  sha256sum "$private_plan" > "$private_plan.sha256"
fi
sha256sum -c "$private_plan.sha256" > /dev/null
# The host backup must be durable before any correction; compare-and-set skips intervening work.
docker cp "$private_plan" "roxstock-dart-collector:$container_plan" >/dev/null
docker exec --user root roxstock-dart-collector chown node:node "$container_plan"
run_private apply "$container_plan" || { echo DART_STATUS_APPLY_FAILED_INSPECT_PRIVATE_LOG; exit 1; }
# Only the explicitly sanitized numeric summary is public.
result="$(tail -n 2 "$log" | head -n 1)"
if [[ "$result" != *'"progress"'* ]]; then echo DART_STATUS_SUMMARY_MISSING; exit 1; fi
printf '%s\n' "$result"
echo DART_STATUS_CORRECTION_COMPLETED_NO_FINANCIAL_BATCH_RECOLLECTION
