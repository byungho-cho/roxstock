#!/usr/bin/env bash

set -Eeuo pipefail

IMAGE_TAG="${1:-}"
CONTAINER_NAME="roxstock-frontend"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
HEALTH_TIMEOUT=60

if [[ ! "${IMAGE_TAG}" =~ ^(latest|sha-[0-9a-f]{7,40})$ ]]; then
  echo "Usage: $0 <latest|sha-commit>"
  echo "Example: $0 sha-f5016c0"
  exit 1
fi

command -v docker >/dev/null 2>&1 || {
  echo "Docker is not installed."
  exit 1
}

docker compose version >/dev/null 2>&1 || {
  echo "Docker Compose plugin is not installed."
  exit 1
}

cd "${PROJECT_DIR}"
export IMAGE_TAG

echo "[1/4] Pulling newrox/roxstock-frontend:${IMAGE_TAG}"
docker compose pull frontend

if docker container inspect "${CONTAINER_NAME}" >/dev/null 2>&1; then
  compose_project="$(docker container inspect     --format '{{ index .Config.Labels "com.docker.compose.project" }}'     "${CONTAINER_NAME}")"

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
docker compose up -d --force-recreate --remove-orphans frontend

echo "[4/4] Waiting for health check"
deadline=$((SECONDS + HEALTH_TIMEOUT))

while (( SECONDS < deadline )); do
  status="$(docker container inspect     --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}'     "${CONTAINER_NAME}" 2>/dev/null || true)"

  if [[ "${status}" == "healthy" ]]; then
    curl --fail --silent --show-error http://127.0.0.1/ >/dev/null
    echo "Deployment completed: newrox/roxstock-frontend:${IMAGE_TAG}"
    docker compose ps
    exit 0
  fi

  if [[ "${status}" == "unhealthy" || "${status}" == "exited" || "${status}" == "dead" ]]; then
    break
  fi

  sleep 2
done

echo "Deployment health check failed."
docker compose ps
docker compose logs --tail=100 frontend
exit 1
