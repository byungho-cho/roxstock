#!/usr/bin/env bash
# Streamed over SSH from the same immutable commit as the image.
set -Eeuo pipefail
SHA="${1:-}"
COMPONENT="${2:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ && "$COMPONENT" =~ ^(frontend|backend|collector)$ ]] || exit 2
# A documentation-only descendant has identical runtime code. Do not lose an
# already dispatched application deployment when an independent docs PR merges.
deployment_revision_allowed() {
  [[ "$2" == "$3" ]] && return 0
  git -C "$1" merge-base --is-ancestor "$2" "$3" || return 1
  git -C "$1" diff --quiet "$2" "$3" -- . ':(exclude)docs/**' ':(exclude)README.md'
}
SOURCE_TREE=/opt/roxstock
mkdir -p "$SOURCE_TREE/.deploy"
exec 8>"$SOURCE_TREE/.deploy/production.lock"
flock -w 1200 8
export ROXSTOCK_DEPLOY_LOCKED=true
git -C "$SOURCE_TREE" fetch origin main
LATEST="$(git -C "$SOURCE_TREE" rev-parse origin/main)"
if ! deployment_revision_allowed "$SOURCE_TREE" "$SHA" "$LATEST"; then
  echo "Superseded deployment skipped: $SHA (main: $LATEST)"
  exit 0
fi
if [[ "$LATEST" != "$SHA" ]]; then
  echo "Documentation-only main advancement; deploying application revision $SHA (main: $LATEST)"
fi
DEPLOY_TREE="$SOURCE_TREE/.deploy/commits/$SHA"
if [[ ! -d "$DEPLOY_TREE" ]]; then
  git -C "$SOURCE_TREE" worktree add --detach "$DEPLOY_TREE" "$SHA"
fi
[[ "$(git -C "$DEPLOY_TREE" rev-parse HEAD)" == "$SHA" ]] || exit 1
IMAGE_TAG="sha-$SHA"

# Registry-backed old RoxStock images can be pulled again. Never touch volumes,
# backups, other repositories, or images referenced by any existing container.
reclaim_old_images() {
  local repository ref image_id container_id container_image keep_refs="" used_ids=""
  while IFS= read -r container_id; do
    [[ -n "$container_id" ]] || continue
    container_image="$(docker inspect --format '{{.Image}}' "$container_id")"
    used_ids+="$container_image"$'\n'
  done < <(docker ps -aq)
  for repository in newrox/roxstock-backend newrox/roxstock-collector newrox/roxstock-frontend; do
    # Retain the two most recently created immutable tags as rollback candidates.
    keep_refs="$(docker image ls "$repository" --format '{{.Repository}}:{{.Tag}}' | awk '/:[s]ha-[0-9a-f]+$/ {if (++count <= 2) print}')"
    while read -r ref image_id; do
      [[ "$ref" =~ ^newrox/roxstock-(backend|collector|frontend):sha-[0-9a-f]{7,40}$ ]] || continue
      [[ "$ref" != "$repository:$IMAGE_TAG" ]] || continue
      grep -Fxq "$image_id" <<< "$used_ids" && continue
      grep -Fxq "$ref" <<< "$keep_refs" && continue
      docker manifest inspect "$ref" >/dev/null 2>&1 || continue
      echo "Removing unused registry-backed image tag: $ref"
      docker image rm "$ref" || true
    done < <(docker image ls "$repository" --no-trunc --format '{{.Repository}}:{{.Tag}} {{.ID}}')
  done
}
if [[ "$COMPONENT" == backend || "$COMPONENT" == collector ]]; then
  reclaim_old_images
  # Only copy the existing server environment. Never read a CI/development env.
  test -f "$SOURCE_TREE/backend/.env.production"
  install -m 600 "$SOURCE_TREE/backend/.env.production" "$DEPLOY_TREE/backend/.env.production"
  # Backend-only auth mail settings are deliberately absent from the collector env file.
  test -f "$SOURCE_TREE/backend/.env.auth"
  install -m 600 "$SOURCE_TREE/backend/.env.auth" "$DEPLOY_TREE/backend/.env.auth"
  if [[ "$COMPONENT" == backend ]] && grep -q '"version":"1.2.0"' "$DEPLOY_TREE/backend/src/release.json"; then
    test -f "$SOURCE_TREE/.deploy/auth-cutover-ready"
    test "$(curl --silent --show-error -o /dev/null -w '%{http_code}' https://newrox.cafe24.com/api/accounts)" = 401
  fi
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
  if [[ ! -f "$SOURCE_TREE/.deploy/backed-up-$IMAGE_TAG" ]]; then
  # Retain a restricted server-local backup before applying schema migrations.
  backup_id="roxstock-v0.2-$(date -u +%Y%m%dT%H%M%SZ)"
  BACKUP_DIR="$SOURCE_TREE/backups/$backup_id"
  install -d -m 700 "$BACKUP_DIR"
  backup_file="$BACKUP_DIR/$backup_id.sql.gz"
  umask 077
  docker exec roxstock-mariadb sh -c '
    export MYSQL_PWD="${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"
    test -n "$MYSQL_PWD" || { echo "Database backup credential unavailable." >&2; exit 1; }
    exec mariadb-dump -uroot --single-transaction --quick --routines --events --triggers --hex-blob roxstock
  ' | gzip > "$backup_file.partial"
  test -s "$backup_file.partial"
  gzip -t "$backup_file.partial"
  mv "$backup_file.partial" "$backup_file"
  sha256sum "$backup_file" > "$backup_file.sha256"
  printf '%s\n' "$BACKUP_DIR" > "$SOURCE_TREE/.deploy/backup-directory-$IMAGE_TAG"
  touch "$SOURCE_TREE/.deploy/backed-up-$IMAGE_TAG"
  echo "Verified server-local pre-migration backup: $backup_file"
  fi
  # Retire the explicitly identified historical campaign before the first new engine starts.
  if [[ "$COMPONENT" == backend && -f "$DEPLOY_TREE/scripts/security-data-production-check.mjs" && ! -f "$SOURCE_TREE/.deploy/security-data-history-retired" ]]; then
    baseline="$(cat "$SOURCE_TREE/.deploy/backup-directory-$IMAGE_TAG")/collection-settings"
    install -d -m 700 "$baseline"
    if [[ ! -f "$baseline/env.production" ]]; then
    install -m 600 "$SOURCE_TREE/backend/.env.production" "$baseline/env.production"
    install -m 600 "$SOURCE_TREE/backend/.env.auth" "$baseline/env.auth"
    docker inspect roxstock-backend roxstock-collector roxstock-dart-collector > "$baseline/containers.json"
    for unit in roxstock-kis-history.timer roxstock-kis-history.service; do
      systemctl show "$unit" > "$baseline/$unit.state" 2>/dev/null || true
      systemctl cat "$unit" > "$baseline/$unit.unit" 2>/dev/null || true
    done
    campaign="$SOURCE_TREE/.deploy/kis-history-campaign"
    if [[ -d "$campaign" ]]; then cp -a "$campaign" "$baseline/kis-history-campaign"; fi
    fi
    campaign="$SOURCE_TREE/.deploy/kis-history-campaign"
    if [[ -d "$campaign" ]]; then
      install -d -m 700 "$campaign/state"
      touch "$campaign/state/STOP"
    fi
    if systemctl cat roxstock-kis-history.timer >/dev/null 2>&1; then systemctl disable --now roxstock-kis-history.timer; fi
    if systemctl is-active --quiet roxstock-kis-history.service; then systemctl stop roxstock-kis-history.service; fi
    if docker container inspect roxstock-kis-history-batch >/dev/null 2>&1; then docker stop --time 120 roxstock-kis-history-batch; fi
    # General collector still contains the old supplement timer until its image is replaced.
    docker stop --time 120 roxstock-dart-collector roxstock-collector
    date -u +%FT%TZ > "$SOURCE_TREE/.deploy/security-data-history-retired"
    printf '%s\n' "$baseline" > "$SOURCE_TREE/.deploy/security-data-settings-baseline"
  fi
  # env_file is the authoritative source; Compose must not override private settings.
  if [[ -f "$DEPLOY_TREE/scripts/security-data-production-check.mjs" ]]; then
    for setting in SECURITY_DATA_COLLECTION_ENABLED=true SECURITY_DATA_INTERVAL_MINUTES=60 SECURITY_DATA_RETRY_MINUTES=60 SECURITY_DATA_MAX_ATTEMPTS=3 SECURITY_DATA_BATCH_SIZE=20; do
      key="${setting%%=*}"
      if ! grep -q "^$key=" "$DEPLOY_TREE/backend/.env.production"; then printf '\n%s\n' "$setting" >> "$DEPLOY_TREE/backend/.env.production"; fi
    done
  fi
  export AUTH_CUTOVER_BACKUP_DIRECTORY="$(cat "$SOURCE_TREE/.deploy/backup-directory-$IMAGE_TAG")"
  export ROXSTOCK_STATE_DIR="$SOURCE_TREE/.deploy"
  install -d -m 755 "$SOURCE_TREE/.deploy/runtime"
  bash "$DEPLOY_TREE/scripts/deploy-$COMPONENT.sh" "$IMAGE_TAG"
else
  actual="$(docker inspect --format '{{.Config.Image}} {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' roxstock-frontend 2>/dev/null || true)"
  if [[ "$actual" == "newrox/roxstock-frontend:$IMAGE_TAG running" || "$actual" == "newrox/roxstock-frontend:$IMAGE_TAG healthy" ]]; then
    curl --fail --silent --show-error http://127.0.0.1/ >/dev/null
    echo "Frontend already healthy at $SHA; duplicate deployment skipped"
    exit 0
  fi
  reclaim_old_images
  # Preserve Cafe24 HTTPS proxy and app network from server configuration.
  # Execute only the SHA-pinned deployment script.
  test -f "$SOURCE_TREE/compose.yml"
  export FRONTEND_COMPOSE_FILE="$SOURCE_TREE/compose.yml"
  bash "$DEPLOY_TREE/scripts/deploy.sh" "$IMAGE_TAG"
fi
install -d -m 755 "$SOURCE_TREE/.deploy/runtime"
install -m 644 "$DEPLOY_TREE/backend/src/release.json" "$SOURCE_TREE/.deploy/runtime/release.json.next"
mv "$SOURCE_TREE/.deploy/runtime/release.json.next" "$SOURCE_TREE/.deploy/runtime/release.json"
echo "Verified deployment source: $SHA; component: $COMPONENT"
docker inspect --format '{{.Name}} {{.Config.Image}} {{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "roxstock-$COMPONENT"
