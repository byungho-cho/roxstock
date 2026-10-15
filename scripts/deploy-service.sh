#!/usr/bin/env bash
# Called only under deploy-production-component's server-wide lock.
set -Eeuo pipefail
ROLE="${1:-}"
TAG="${2:-}"
[[ "$ROLE" =~ ^(backend|collector)$ && "$TAG" =~ ^sha-[0-9a-f]{40}$ ]] || exit 2
[[ "${ROXSTOCK_DEPLOY_LOCKED:-}" == true ]] || { echo 'Use the locked production component wrapper'; exit 2; }
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${ROXSTOCK_STATE_DIR:-/opt/roxstock/.deploy}"
exec 9>"$STATE_DIR/$ROLE-deploy.lock"
flock -n 9 || { echo "Another $ROLE deployment is running"; exit 1; }
COMPOSE=(docker compose --project-name roxstock-backend --file "$PROJECT_DIR/infra/docker/compose.prod-backend.yml")
export BACKEND_IMAGE="$(docker inspect --format '{{.Config.Image}}' roxstock-backend)"
export COLLECTOR_IMAGE="$(docker inspect --format '{{.Config.Image}}' roxstock-collector)"
export COLLECTOR_ENTRY_ROOT=collector/dist
[[ "$COLLECTOR_IMAGE" != newrox/roxstock-backend:* ]] || export COLLECTOR_ENTRY_ROOT=backend/dist/collector
if [[ "$ROLE" == backend ]]; then
  export BACKEND_IMAGE="newrox/roxstock-backend:$TAG"
  services=(backend)
  untouched=(roxstock-collector roxstock-realtime-collector roxstock-dart-collector)
else
  export COLLECTOR_IMAGE="newrox/roxstock-collector:$TAG" COLLECTOR_ENTRY_ROOT=collector/dist
  services=(collector realtime-collector dart-collector)
  untouched=(roxstock-backend)
fi
for network in roxstock_app roxstock-db_default; do docker network inspect "$network" >/dev/null; done
test "$(stat -c '%a' "$PROJECT_DIR/backend/.env.production")" = 600
"${COMPOSE[@]}" config --quiet
# Never emit interpolated Compose: env_file may contain secrets. Restricted server record only.
record="$STATE_DIR/history/$(date -u +%Y%m%dT%H%M%S%N)-$ROLE-$TAG"
install -d -m 700 "$record"
umask 077
"${COMPOSE[@]}" config > "$record/compose.yml"
cp "$PROJECT_DIR/infra/docker/compose.prod-backend.yml" "$record/compose-template.yml"
# Includes the actual pre-deployment commands, mounts and environment, server-local only.
docker inspect roxstock-backend roxstock-collector roxstock-realtime-collector roxstock-dart-collector > "$record/before-containers.json"
for s in backend collector realtime-collector dart-collector; do
  docker inspect --format '{{.Name}} {{.Config.Image}} {{.Image}} {{.Id}} {{.State.StartedAt}}' "roxstock-$s" >> "$record/before.txt"
done
for c in "${untouched[@]}"; do docker inspect --format '{{.Id}} {{.State.StartedAt}}' "$c"; done > "$record/untouched.txt"
for s in "${services[@]}"; do
  image="$(docker inspect --format '{{.Config.Image}}' "roxstock-$s")"
  [[ "$image" =~ ^newrox/roxstock-(backend|collector):sha-[0-9a-f]{7,40}$ ]] || { echo 'Previous image is not immutable'; exit 1; }
  printf '%s %s\n' "$s" "$image" >> "$record/previous-images.txt"
done
already=true
for s in "${services[@]}"; do
  expected="$BACKEND_IMAGE"; [[ "$ROLE" == backend ]] || expected="$COLLECTOR_IMAGE"
  actual="$(docker inspect --format '{{.Config.Image}} {{.State.Health.Status}}' "roxstock-$s")"
  [[ "$actual" == "$expected healthy" ]] || already=false
done
if [[ "$already" == true ]]; then echo "Healthy $ROLE already at $TAG; duplicate recreation skipped"; exit 0; fi
"${COMPOSE[@]}" pull "${services[@]}"
if [[ "$ROLE" == backend && ! -f "$STATE_DIR/migrated-$TAG" ]]; then
  # Backup is performed by the locked wrapper before reaching this point.
  recovery="$(bash "$PROJECT_DIR/scripts/recover-profit-migration.sh")"
  if [[ "$recovery" == RECOVERED ]]; then
    "${COMPOSE[@]}" run --rm --no-deps backend npx --no-install prisma migrate resolve --applied 20261011010000_profit_year_aggregates --schema database/prisma/schema.prisma
  fi
  recovery="$(bash "$PROJECT_DIR/scripts/recover-analysis-cache-migration.sh")"
  if [[ "$recovery" == RECOVERED ]]; then
    "${COMPOSE[@]}" run --rm --no-deps backend npx --no-install prisma migrate resolve --applied 20261014060000_analysis_read_cache --schema database/prisma/schema.prisma
  fi
  "${COMPOSE[@]}" run --rm --no-deps backend npx --no-install prisma migrate deploy --schema database/prisma/schema.prisma
  "${COMPOSE[@]}" run --rm --no-deps backend npx --no-install prisma migrate status --schema database/prisma/schema.prisma
  touch "$STATE_DIR/migrated-$TAG"
fi
healthy() {
  local s status deadline=$((SECONDS+180))
  while ((SECONDS<deadline)); do
    local all=true
    for s in "${services[@]}"; do
      status="$(docker inspect --format '{{if .State.Running}}{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}{{else}}exited{{end}}' "roxstock-$s")"
      [[ "$status" == healthy ]] || all=false
      [[ ! "$status" =~ ^(exited|unhealthy)$ ]] || return 1
    done
    [[ "$all" == true ]] && return 0
    sleep 2
  done
  return 1
}
failed=false
"${COMPOSE[@]}" up -d --force-recreate --no-deps --pull never "${services[@]}" || failed=true
if [[ "$failed" == false ]]; then healthy || failed=true; fi
if [[ "$failed" == false && "$ROLE" == backend ]]; then
  docker exec roxstock-backend node -e "fetch('http://127.0.0.1:3300/health/db').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" || failed=true
fi
if [[ "$failed" == true ]]; then
  echo "Deployment failed; restoring previous $ROLE images. Record: $record"
  while read -r s image; do
    if [[ "$ROLE" == backend ]]; then export BACKEND_IMAGE="$image"; else
      export COLLECTOR_IMAGE="$image" COLLECTOR_ENTRY_ROOT=collector/dist
      [[ "$image" != newrox/roxstock-backend:* ]] || export COLLECTOR_ENTRY_ROOT=backend/dist/collector
    fi
    "${COMPOSE[@]}" up -d --force-recreate --no-deps --pull never "$s"
  done < "$record/previous-images.txt"
  healthy || echo 'Rollback health failed: manual intervention required'
  exit 1
fi
for c in "${untouched[@]}"; do docker inspect --format '{{.Id}} {{.State.StartedAt}}' "$c"; done > "$record/untouched-after.txt"
cmp "$record/untouched.txt" "$record/untouched-after.txt" || { echo 'Unrelated container changed during deployment'; exit 1; }
for s in "${services[@]}"; do
  docker inspect --format '{{.Name}} {{.Config.Image}} {{.Image}}' "roxstock-$s" >> "$record/after.txt"
done
cp "$record/after.txt" "$STATE_DIR/$ROLE-images.txt"
printf '%s\n' "$record" > "$STATE_DIR/$ROLE-last-deploy"
echo "Healthy $ROLE deployed; independent container identity verified. Record: $record"
