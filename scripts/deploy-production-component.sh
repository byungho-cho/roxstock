#!/usr/bin/env bash
# Streamed over SSH from the same immutable commit as the image.
set -Eeuo pipefail
SHA="${1:-}"
COMPONENT="${2:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ && "$COMPONENT" =~ ^(frontend|backend)$ ]] || exit 2
SOURCE_TREE=/opt/roxstock
mkdir -p "$SOURCE_TREE/.deploy"
exec 8>"$SOURCE_TREE/.deploy/production.lock"
flock -w 1200 8
git -C "$SOURCE_TREE" fetch origin main
LATEST="$(git -C "$SOURCE_TREE" rev-parse origin/main)"
if [[ "$LATEST" != "$SHA" ]]; then
  echo "Superseded deployment skipped: $SHA (main: $LATEST)"
  exit 0
fi
DEPLOY_TREE="$SOURCE_TREE/.deploy/commits/$SHA"
if [[ ! -d "$DEPLOY_TREE" ]]; then
  git -C "$SOURCE_TREE" worktree add --detach "$DEPLOY_TREE" "$SHA"
fi
[[ "$(git -C "$DEPLOY_TREE" rev-parse HEAD)" == "$SHA" ]] || exit 1
IMAGE_TAG="sha-$SHA"
if [[ "$COMPONENT" == backend ]]; then
  already_current=true
  for container in roxstock-backend roxstock-collector roxstock-realtime-collector roxstock-dart-collector; do
    actual="$(docker inspect --format '{{.Config.Image}} {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
    [[ "$actual" == "newrox/roxstock-backend:$IMAGE_TAG healthy" ]] || already_current=false
  done
  if [[ "$already_current" == true ]]; then
    docker exec roxstock-backend node -e "fetch('http://127.0.0.1:3300/health/db').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
    echo "Backend and collectors already healthy at $SHA; duplicate deployment skipped"
    exit 0
  fi
  # Only copy the existing server environment. Never read a CI/development env.
  test -f "$SOURCE_TREE/backend/.env.production"
  install -m 600 "$SOURCE_TREE/backend/.env.production" "$DEPLOY_TREE/backend/.env.production"
  if ! grep -Eq '^COLLECTOR_INTERNAL_TOKEN=.+$' "$DEPLOY_TREE/backend/.env.production"; then
    # Earlier deploys generated this token only in their worktree. Carry the
    # existing runtime token forward, without rotating it or logging its value.
    existing_token="$(docker exec roxstock-backend node -e 'process.stdout.write(process.env.COLLECTOR_INTERNAL_TOKEN || "")')"
    [[ -n "$existing_token" && ! "$existing_token" =~ [[:space:]] ]] || {
      echo "No existing production collector token available; deployment stopped."
      exit 1
    }
    printf '\nCOLLECTOR_INTERNAL_TOKEN=%s\n' "$existing_token" >> "$DEPLOY_TREE/backend/.env.production"
    unset existing_token
    echo "Preserved the existing runtime collector token in the deployment environment."
  fi
  bash "$DEPLOY_TREE/scripts/deploy-backend.sh" "$IMAGE_TAG"
else
  # API must have deployed this exact commit before the frontend.
  [[ "$(docker inspect --format '{{.Config.Image}}' roxstock-backend)" == "newrox/roxstock-backend:$IMAGE_TAG" ]] || {
    echo "Matching backend has not deployed. Run Production Deploy first."
    exit 1
  }
  actual="$(docker inspect --format '{{.Config.Image}} {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' roxstock-frontend 2>/dev/null || true)"
  if [[ "$actual" == "newrox/roxstock-frontend:$IMAGE_TAG running" || "$actual" == "newrox/roxstock-frontend:$IMAGE_TAG healthy" ]]; then
    curl --fail --silent --show-error http://127.0.0.1/ >/dev/null
    echo "Frontend already healthy at $SHA; duplicate deployment skipped"
    exit 0
  fi
  # Preserve Cafe24 HTTPS proxy and app network from server configuration.
  # Execute only the SHA-pinned deployment script.
  test -f "$SOURCE_TREE/compose.yml"
  export FRONTEND_COMPOSE_FILE="$SOURCE_TREE/compose.yml"
  bash "$DEPLOY_TREE/scripts/deploy.sh" "$IMAGE_TAG"
fi
echo "Verified deployment source: $SHA; component: $COMPONENT"
docker inspect --format '{{.Name}} {{.Config.Image}} {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "roxstock-$COMPONENT"
