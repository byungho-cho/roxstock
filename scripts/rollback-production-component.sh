#!/usr/bin/env bash
# Restores application images only. Never restores the database automatically.
set -Eeuo pipefail
STATE=/opt/roxstock/.deploy
RECORD="${1:?restricted deployment history directory required}"
ROLE="${2:?backend or collector required}"
[[ "$ROLE" =~ ^(backend|collector)$ ]] || exit 2
RECORD="$(realpath "$RECORD")"
[[ "$RECORD" == "$STATE/history/"* && -f "$RECORD/previous-images.txt" ]] || exit 2
exec 8>"$STATE/production.lock"
flock -w 1200 8
umask 077
override="$RECORD/rollback-images.yml"
printf 'services:\n' > "$override"
services=()
while read -r service image; do
  [[ "$image" =~ ^newrox/roxstock-(backend|collector):sha-[0-9a-f]{7,40}$ ]] || exit 2
  if [[ "$ROLE" == backend ]]; then [[ "$service" == backend ]] || exit 2; else [[ "$service" =~ ^(collector|realtime-collector|dart-collector)$ ]] || exit 2; fi
  services+=("$service")
  printf '  %s:\n    image: %s\n' "$service" "$image" >> "$override"
  if [[ "$ROLE" == collector ]]; then
    root=collector/dist
    [[ "$image" != newrox/roxstock-backend:* ]] || root=backend/dist/collector
    entry=worker; [[ "$service" != realtime-collector ]] || entry=realtime-worker
    [[ "$service" != dart-collector ]] || entry=dart-worker
    printf '    command: ["node", "%s/%s.js"]\n' "$root" "$entry" >> "$override"
  fi
done < "$RECORD/previous-images.txt"
[[ ${#services[@]} -gt 0 ]] || exit 2
compose=(docker compose --project-name roxstock-backend --file "$RECORD/compose.yml" --file "$override")
"${compose[@]}" pull "${services[@]}"
if [[ "$ROLE" == backend ]]; then
  # The pre-auth freeze image must never be started by the ordinary rollback tool.
  # Restoring that image requires the separate fail-closed maintenance procedure.
  while read -r service image; do
    if ! docker run --rm --network none --read-only --entrypoint sh "$image" -c 'test -f /app/backend/dist/auth/guard.js'; then
      echo 'Refusing an unauthenticated backend rollback. Use the private-API maintenance recovery procedure.'
      exit 1
    fi
  done < "$RECORD/previous-images.txt"
fi
"${compose[@]}" up -d --force-recreate --no-deps --pull never "${services[@]}"
echo 'Previous application images started. Check health/db, queue processing and schema compatibility; DB was not restored.'
for s in "${services[@]}"; do docker inspect --format '{{.Name}} {{.Config.Image}} {{.Image}}' "roxstock-$s"; done
