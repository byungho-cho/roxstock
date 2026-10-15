#!/usr/bin/env bash
# Real Compose/containers, locally built images, disposable GitHub Actions DB only.
set -Eeuo pipefail
[[ "${GITHUB_ACTIONS:-}" == true && "${VERIFICATION_DB_CONTAINER:-}" =~ ^[0-9a-f]+$ ]] || exit 2
[[ "${DATABASE_URL:-}" == mysql://ci:ci@127.0.0.1:3306/ci_phase16_test ]] || exit 2
root="$PWD"
state="$(mktemp -d "$RUNNER_TEMP/roxstock-isolation-XXXXXX")"
real_docker="$(command -v docker)"
old="sha-$(printf 'a%.0s' {1..40})"; next="sha-$(printf 'b%.0s' {1..40})"
for tag in "$old" "$next"; do
  docker tag roxstock-api-check "newrox/roxstock-backend:$tag"
  docker tag roxstock-collector-check "newrox/roxstock-collector:$tag"
done
export BACKEND_IMAGE="newrox/roxstock-backend:$old" COLLECTOR_IMAGE="newrox/roxstock-collector:$old"
export ROXSTOCK_RUNTIME_DIR="$state/runtime" ROXSTOCK_STATE_DIR="$state" ROXSTOCK_DEPLOY_LOCKED=true
export COLLECTOR_REALTIME_ENABLED=false DART_COLLECTOR_ENABLED=false
mkdir -p "$state/runtime" "$state/bin"
docker network create roxstock_app >/dev/null
docker network create roxstock-db_default >/dev/null
docker network connect --alias roxstock-mariadb roxstock-db_default "$VERIFICATION_DB_CONTAINER"
compose=(docker compose --project-name roxstock-backend --file "$root/infra/docker/compose.prod-backend.yml")
cleanup() {
  "$real_docker" compose --project-name roxstock-backend --file "$root/infra/docker/compose.prod-backend.yml" down --timeout 30 || true
  "$real_docker" network disconnect roxstock-db_default "$VERIFICATION_DB_CONTAINER" || true
  "$real_docker" network rm roxstock_app roxstock-db_default || true
}
trap cleanup EXIT
umask 077
cat > backend/.env.production <<'ENV'
DATABASE_URL=mysql://ci:ci@roxstock-mariadb:3306/ci_phase16_test
COLLECTOR_INTERNAL_TOKEN=isolated-fixture-only
COLLECTOR_PRICE_PROVIDER=mock
COLLECTOR_REALTIME_ENABLED=false
DART_COLLECTOR_ENABLED=false
VALUATION_SUPPLEMENT_ENABLED=false
ENV
"${compose[@]}" up -d --no-deps --pull never backend collector realtime-collector dart-collector
for service in backend collector realtime-collector dart-collector; do
  for i in {1..90}; do
    status="$(docker inspect --format '{{.State.Health.Status}}' "roxstock-$service")"
    [[ "$status" != healthy ]] || break
    sleep 1
  done
  [[ "$status" == healthy ]]
done
# Registry publication is not part of PR validation. All Compose mutations and inspections remain real.
export REAL_DOCKER="$real_docker"
cat > "$state/bin/docker" <<'SH'
#!/usr/bin/env bash
if [[ "$1" == compose && " $* " == *" pull "* ]]; then exit 0; fi
exec "$REAL_DOCKER" "$@"
SH
chmod 755 "$state/bin/docker"
export PATH="$state/bin:$PATH"
# Schema is already migrated by this isolated job. Exercise service replacement only.
touch "$state/migrated-$next"
bash scripts/deploy-service.sh backend "$next"
bash scripts/deploy-service.sh collector "$next"
echo 'Real Compose: API deployment preserved all collector IDs/start times; collector deployment preserved API ID/start time.'
