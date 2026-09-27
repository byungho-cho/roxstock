#!/usr/bin/env bash
set -Eeuo pipefail

IMAGE_TAG="${1:-}"
PROJECT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${PROJECT_DIR}/infra/docker/compose.prod-backend.yml"
ENV_FILE="${PROJECT_DIR}/backend/.env.production"
CONTAINER_NAME="roxstock-backend"
COLLECTOR_CONTAINER_NAME="roxstock-collector"
HEALTH_TIMEOUT=120
COMPOSE=(docker compose --project-name roxstock-backend --file "${COMPOSE_FILE}")

if [[ $# -ne 1 || ! "${IMAGE_TAG}" =~ ^sha-[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 <sha-commit>"
  exit 1
fi

for dependency in docker curl flock; do
  command -v "${dependency}" >/dev/null 2>&1 || { echo "Missing dependency: ${dependency}"; exit 1; }
done

[[ -f "${ENV_FILE}" ]] || { echo "Missing backend production env file."; exit 1; }
perm="$(stat -c '%a' "${ENV_FILE}")"
[[ "${perm}" == "600" ]] || { echo "Backend production env file must have mode 600."; exit 1; }

for network in roxstock_app roxstock-db_default; do
  docker network inspect "${network}" >/dev/null 2>&1 || { echo "Missing Docker network: ${network}"; exit 1; }
done
docker container inspect roxstock-mariadb >/dev/null 2>&1 || { echo "MariaDB container is missing."; exit 1; }

cd "${PROJECT_DIR}"
export BACKEND_IMAGE_TAG="${IMAGE_TAG}"
exec 9>"${PROJECT_DIR}/.backend-deploy.lock"
flock -n 9 || { echo "Another backend deployment is running."; exit 1; }

"${COMPOSE[@]}" config --quiet
echo "[1/5] Pulling backend image"
"${COMPOSE[@]}" pull backend collector

echo "[2/5] Checking Prisma migration status with target image"
"${COMPOSE[@]}" run --rm --no-deps backend sh -lc 'npx --no-install prisma migrate status --schema database/prisma/schema.prisma'

echo "[3/5] Applying Prisma migrations safely (deploy is idempotent)"
"${COMPOSE[@]}" run --rm --no-deps backend sh -lc 'npx --no-install prisma migrate deploy --schema database/prisma/schema.prisma'

previous_image=""
if docker container inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
  previous_image="$(docker container inspect --format '{{.Config.Image}}' "${CONTAINER_NAME}")"
  if [[ "${previous_image}" =~ ^newrox/roxstock-backend:sha-[0-9a-f]{7,40}$ ]]; then
    printf '%s\n' "${previous_image}" > "${PROJECT_DIR}/.backend-last-good-image"
    chmod 600 "${PROJECT_DIR}/.backend-last-good-image"
    echo "Previous healthy backend image recorded for rollback."
  else
    echo "Previous backend image is not an immutable SHA tag; automatic rollback will be disabled."
    previous_image=""
  fi
fi

echo "[4/5] Starting backend"
"${COMPOSE[@]}" up -d --force-recreate --no-deps --pull never backend

echo "[5/5] Waiting for backend health"
deadline=$((SECONDS + HEALTH_TIMEOUT))
while (( SECONDS < deadline )); do
  status="$(docker container inspect --format '{{if ne .State.Status "running"}}{{.State.Status}}{{else if .State.Health}}{{.State.Health.Status}}{{else}}missing-healthcheck{{end}}' "${CONTAINER_NAME}" 2>/dev/null || true)"
  [[ "${status}" == "healthy" ]] && {
    docker exec "${CONTAINER_NAME}" node -e "fetch('http://127.0.0.1:3300/health/db').then(async r=>{if(!r.ok){console.error(await r.text());process.exit(1)}}).catch(e=>{console.error(e);process.exit(1)})"
    echo "Starting isolated collector service"
    "${COMPOSE[@]}" up -d --force-recreate --no-deps --pull never collector
    collector_deadline=$((SECONDS + 60))
    while (( SECONDS < collector_deadline )); do
      collector_status="$(docker container inspect --format '{{if ne .State.Status "running"}}{{.State.Status}}{{else if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "${COLLECTOR_CONTAINER_NAME}" 2>/dev/null || true)"
      if [[ "${collector_status}" =~ ^(healthy|running)$ ]]; then
        echo "Collector deployment completed: newrox/roxstock-backend:${IMAGE_TAG}"
        echo "Backend deployment completed: newrox/roxstock-backend:${IMAGE_TAG}"
        "${COMPOSE[@]}" ps
        exit 0
      fi
      [[ "${collector_status}" =~ ^(unhealthy|exited|dead)$ ]] && break
      sleep 2
    done
    echo "Collector failed to become healthy; API remains running."
    "${COMPOSE[@]}" logs --tail=100 collector || true
    echo "Backend deployment completed: newrox/roxstock-backend:${IMAGE_TAG}"
    "${COMPOSE[@]}" ps
    exit 1
  }
  [[ "${status}" =~ ^(unhealthy|exited|dead|missing-healthcheck)$ ]] && break
  sleep 2
done

echo "Backend deployment health check failed. Stopping failed backend container."
"${COMPOSE[@]}" logs --tail=100 backend || true
"${COMPOSE[@]}" stop backend >/dev/null 2>&1 || true

if [[ -n "${previous_image}" ]]; then
  rollback_tag="${previous_image##*:}"
  echo "Attempting application rollback to previously healthy immutable image: ${previous_image}"
  export BACKEND_IMAGE_TAG="${rollback_tag}"
  if "${COMPOSE[@]}" up -d --force-recreate --no-deps --pull never backend; then
    rollback_deadline=$((SECONDS + HEALTH_TIMEOUT))
    while (( SECONDS < rollback_deadline )); do
      rollback_status="$(docker container inspect --format '{{if ne .State.Status "running"}}{{.State.Status}}{{else if .State.Health}}{{.State.Health.Status}}{{else}}missing-healthcheck{{end}}' "${CONTAINER_NAME}" 2>/dev/null || true)"
      if [[ "${rollback_status}" == "healthy" ]]; then
        echo "Application rollback succeeded: ${previous_image}"
        "${COMPOSE[@]}" ps
        exit 1
      fi
      [[ "${rollback_status}" =~ ^(unhealthy|exited|dead|missing-healthcheck)$ ]] && break
      sleep 2
    done
  fi
  echo "Automatic application rollback failed; stopping backend and requiring manual intervention."
  "${COMPOSE[@]}" stop backend >/dev/null 2>&1 || true
else
  echo "No previously healthy immutable backend image is available for automatic rollback."
fi

"${COMPOSE[@]}" ps
exit 1
