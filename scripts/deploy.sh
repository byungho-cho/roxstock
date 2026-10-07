#!/usr/bin/env bash

set -Eeuo pipefail

IMAGE_TAG="${1:-}"
CONTAINER_NAME="roxstock-frontend"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
HEALTH_TIMEOUT=120
COMPOSE_FILE="${FRONTEND_COMPOSE_FILE:-${PROJECT_DIR}/compose.yml}"
COMPOSE=(docker compose --project-name roxstock --file "${COMPOSE_FILE}")

if [[ $# -ne 1 || ! "${IMAGE_TAG}" =~ ^sha-[0-9a-f]{7,40}$ ]]; then
  echo "Usage: $0 <sha-commit>"
  echo "Example: $0 sha-f5016c0"
  exit 1
fi

for dependency in docker curl flock; do
  command -v "${dependency}" >/dev/null 2>&1 || {
    echo "Required command is not installed: ${dependency}"
    exit 1
  }
done

docker compose version >/dev/null 2>&1 || {
  echo "Docker Compose plugin is not installed."
  exit 1
}

cd "${PROJECT_DIR}"
export IMAGE_TAG

exec 9>"${PROJECT_DIR}/.deploy.lock"
flock -n 9 || { echo "Another deployment is running."; exit 1; }

"${COMPOSE[@]}" config --quiet
# Preserve server proxy/network topology while enforcing the pinned image.
configured_image="$("${COMPOSE[@]}" config --images | grep -Fx "newrox/roxstock-frontend:${IMAGE_TAG}" || true)"
[[ "$configured_image" == "newrox/roxstock-frontend:${IMAGE_TAG}" ]] || {
  echo "Compose configuration does not use the requested immutable frontend image."
  exit 1
}
docker info >/dev/null

compose_project=""
if docker container inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
  compose_project="$(docker container inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "${CONTAINER_NAME}")"
  if [[ -n "${compose_project}" && "${compose_project}" != "<no value>" && "${compose_project}" != roxstock ]]; then
    echo "Refusing to replace a container owned by Compose project: ${compose_project}"
    exit 1
  fi
  echo "Previous image (record for rollback):"
  docker container inspect --format '{{.Config.Image}} (local image ID: {{.Image}})' "${CONTAINER_NAME}"
fi

echo "[1/4] Pulling newrox/roxstock-frontend:${IMAGE_TAG}"
"${COMPOSE[@]}" pull frontend

if docker container inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
  if [[ -z "${compose_project}" || "${compose_project}" == "<no value>" ]]; then
    echo "[2/4] Replacing the existing manually managed container"
    docker container stop "${CONTAINER_NAME}"
    docker container rm "${CONTAINER_NAME}"
  else
    echo "[2/4] Existing Compose container found"
  fi
else
  echo "[2/4] No existing container found"
fi

echo "[3/4] Starting frontend"
"${COMPOSE[@]}" up -d --force-recreate --no-deps --pull never frontend

echo "[4/4] Waiting for health check"
deadline=$((SECONDS + HEALTH_TIMEOUT))

while (( SECONDS < deadline )); do
  status="$(docker container inspect --format '{{if ne .State.Status "running"}}{{.State.Status}}{{else if .State.Health}}{{.State.Health.Status}}{{else}}missing-healthcheck{{end}}' "${CONTAINER_NAME}" 2>/dev/null || true)"

  if [[ "${status}" == "healthy" ]]; then
    if curl --fail --silent --show-error --connect-timeout 3 --max-time 10 http://127.0.0.1/ >/dev/null; then
      echo "Deployment completed: newrox/roxstock-frontend:${IMAGE_TAG}"
      "${COMPOSE[@]}" ps
      exit 0
    fi
    break
  fi

  if [[ "${status}" == "unhealthy" || "${status}" == "exited" || "${status}" == "dead" || "${status}" == "missing-healthcheck" ]]; then
    break
  fi

  sleep 2
done

echo "Deployment health check failed. Redeploy the previous SHA tag to roll back."
"${COMPOSE[@]}" ps
"${COMPOSE[@]}" logs --tail=100 frontend
exit 1
