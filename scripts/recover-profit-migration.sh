#!/usr/bin/env bash
set -Eeuo pipefail
# Recover only the known Phase18 TRIGGER-permission failure. Runtime grants stay unchanged.
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION=20261011010000_profit_year_aggregates
DATABASE_CONTAINER="${1:-roxstock-mariadb}"
SQL_FILE="$PROJECT_DIR/database/prisma/migrations/$MIGRATION/migration.sql"
mysql_root() {
  docker exec -i "$DATABASE_CONTAINER" sh -c '
    export MYSQL_PWD="${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"
    test -n "$MYSQL_PWD" || exit 1
    exec mariadb -uroot --batch --skip-column-names roxstock
  '
}
metadata="$(printf "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='roxstock' AND TABLE_NAME='_prisma_migrations';\n" | mysql_root)"
if [[ "$metadata" == 0 ]]; then printf 'UNCHANGED\n'; exit 0; fi
applied="$(printf "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='%s' AND finished_at IS NOT NULL AND rolled_back_at IS NULL;\n" "$MIGRATION" | mysql_root)"
if [[ "$applied" != 0 ]]; then printf 'UNCHANGED\n'; exit 0; fi
known="$(printf "SELECT COUNT(*) FROM _prisma_migrations WHERE migration_name='%s' AND finished_at IS NULL AND rolled_back_at IS NULL AND logs LIKE '%%1142%%' AND logs LIKE '%%TRIGGER command denied%%';\n" "$MIGRATION" | mysql_root)"
if [[ "$known" == 0 ]]; then printf 'UNCHANGED\n'; exit 0; fi
# The failed migration stopped before application replacement. Never replay over populated aggregates.
rows="$(printf 'SELECT COUNT(*) FROM investment_year_aggregates;\n' | mysql_root)"
[[ "$rows" == 0 ]] || { echo 'Refusing migration recovery over populated aggregates.' >&2; exit 1; }
awk -f "$PROJECT_DIR/scripts/profit-migration-replay.awk" "$SQL_FILE" | mysql_root >/dev/null
names="$(awk '/^CREATE TRIGGER / {printf "%s\047%s\047", sep, $3; sep=","}' "$SQL_FILE")"
expected="$(awk '/^CREATE TRIGGER / {n++} END {print n}' "$SQL_FILE")"
actual="$(printf "SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='roxstock' AND TRIGGER_NAME IN (%s);\n" "$names" | mysql_root)"
[[ "$actual" == "$expected" ]] || { echo 'Phase18 trigger verification failed.' >&2; exit 1; }
# Caller resolves Prisma's original checksum only after the complete DDL has been verified.
printf 'RECOVERED\n'
