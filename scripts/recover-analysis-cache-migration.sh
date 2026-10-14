#!/usr/bin/env bash
set -Eeuo pipefail
# Only repair the known first-trigger permission failure, before cache use.
# Called after the production backup and under the deployment lock.
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION=20261014060000_analysis_read_cache
DATABASE_CONTAINER="${1:-roxstock-mariadb}"
SQL_FILE="$PROJECT_DIR/database/prisma/migrations/$MIGRATION/migration.sql"
mysql_root() {
  docker exec -i "$DATABASE_CONTAINER" sh -c '
    export MYSQL_PWD="${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"
    test -n "$MYSQL_PWD" || exit 1
    exec mariadb -uroot --batch --skip-column-names roxstock
  '
}
query() { printf '%s\n' "$1" | mysql_root; }
metadata="$(query "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='roxstock' AND TABLE_NAME='_prisma_migrations';")"
if [[ "$metadata" == 0 ]]; then printf 'UNCHANGED\n'; exit 0; fi
applied="$(query "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='$MIGRATION' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
if [[ "$applied" != 0 ]]; then printf 'UNCHANGED\n'; exit 0; fi
checksum="$(sha256sum "$SQL_FILE" | cut -d ' ' -f 1)"
known="$(query "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='$MIGRATION' AND checksum='$checksum' AND finished_at IS NULL AND rolled_back_at IS NULL AND logs LIKE '%1142%' AND logs LIKE '%TRIGGER command denied%' AND logs LIKE '%financial_statements%';")"
if [[ "$known" == 0 ]]; then printf 'UNCHANGED\n'; exit 0; fi
# Fail closed for unexpected partial state; never erase a populated cache/revision.
columns="$(query "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='roxstock' AND ((TABLE_NAME='analysis_revisions' AND ((COLUMN_NAME='key' AND COLUMN_TYPE='varchar(64)' AND COLUMN_KEY='PRI') OR (COLUMN_NAME='revision' AND COLUMN_TYPE='bigint(20) unsigned') OR (COLUMN_NAME='updated_at' AND COLUMN_TYPE='datetime(3)'))) OR (TABLE_NAME='analysis_read_cache' AND ((COLUMN_NAME='key' AND COLUMN_TYPE='varchar(191)' AND COLUMN_KEY='PRI') OR (COLUMN_NAME='revision' AND COLUMN_TYPE='varchar(64)') OR (COLUMN_NAME='payload' AND DATA_TYPE='longtext') OR (COLUMN_NAME='generated_at' AND COLUMN_TYPE='datetime(3)'))));")"
total_columns="$(query "SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='roxstock' AND TABLE_NAME IN ('analysis_revisions','analysis_read_cache');")"
[[ "$columns" == 7 && "$total_columns" == 7 ]] || { echo 'Unexpected analysis cache schema; recovery stopped.' >&2; exit 1; }
empty_cache="$(query "SELECT COUNT(*) FROM analysis_read_cache;")"
initial_revision="$(query "SELECT COUNT(*) FROM analysis_revisions WHERE \`key\`='financial' AND revision=0;")"
revision_rows="$(query "SELECT COUNT(*) FROM analysis_revisions;")"
[[ "$empty_cache" == 0 && "$initial_revision" == 1 && "$revision_rows" == 1 ]] || { echo 'Refusing recovery over used analysis cache/revisions.' >&2; exit 1; }
# Admin-owned triggers execute without widening the application user's grants.
# Replacing only migration-owned triggers permits retry after partial DDL failure.
awk '
BEGIN { print "DELIMITER $$"; block=0 }
{
  line=$0
  sub(/^CREATE TABLE /,"CREATE TABLE IF NOT EXISTS ",line)
  if (!block) sub(/^INSERT INTO /,"INSERT IGNORE INTO ",line)
  sub(/^CREATE TRIGGER /,"CREATE OR REPLACE TRIGGER ",line)
  if (line ~ /^BEGIN$/) block=1
  if (block && line ~ /^END;$/) { sub(/;$/,"$$",line); block=0 }
  else if (!block) sub(/;$/,"$$",line)
  print line
}
END { print "DELIMITER ;" }
' "$SQL_FILE" | mysql_root >/dev/null
expected="$(awk '/^CREATE TRIGGER / {n++} END {print n}' "$SQL_FILE")"
actual="$(query "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='roxstock' AND TRIGGER_NAME LIKE 'arc\\_%' AND ACTION_TIMING='AFTER' AND EVENT_OBJECT_TABLE IN ('financial_statements','valuation_metrics','dart_financial_filings','period_valuations','dart_share_snapshots','annual_consensus_snapshots','securities','dart_backfill_tasks') AND ACTION_STATEMENT LIKE '%UPDATE \`analysis_revisions\`%' AND ACTION_STATEMENT LIKE '%security:%';")"
[[ "$expected" == 24 && "$actual" == 24 ]] || { echo 'Analysis cache trigger verification failed.' >&2; exit 1; }
# Caller resolves the original migration only after all DDL is verified.
printf 'RECOVERED\n'
