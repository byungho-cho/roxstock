#!/usr/bin/env bash
set -Eeuo pipefail
image="${1:?image required}"
docker run --rm --network host -e DATABASE_URL="${DATABASE_URL:?isolated verification DB required}" \
  -v "$PWD/scripts/collector-image-db-smoke.mjs:/verification.mjs:ro" "$image" node /verification.mjs
docker run --rm --network none --entrypoint sh "$image" -c '
  test ! -d /app/backend/dist
  test ! -d /app/node_modules/fastify
  test ! -d /app/node_modules/prisma
  for f in worker realtime-worker dart-worker; do node --check "collector/dist/$f.js"; done
  node --input-type=module -e "await import(\"@roxstock/shared/prisma\"); await import(\"@roxstock/shared/collection/manual-requests\")"
'
cleanup() { docker rm -f collector-entry-smoke >/dev/null 2>&1 || true; }
trap cleanup EXIT
for entry in worker realtime-worker dart-worker; do
  docker run -d --name collector-entry-smoke --network host \
    -e DATABASE_URL="${DATABASE_URL:?isolated verification DB required}" \
    -e COLLECTOR_PRICE_PROVIDER=mock -e COLLECTOR_SECURITY_MASTER_HOUR=23 \
    -e COLLECTOR_PRICE_COLLECTION_HOUR=23 -e COLLECTOR_SNAPSHOT_HOURS=23 \
    -e COLLECTOR_REALTIME_ENABLED=false -e DART_COLLECTOR_ENABLED=false \
    "$image" node "collector/dist/$entry.js"
  sleep 3
  test "$(docker inspect --format '{{.State.Running}}' collector-entry-smoke)" = true
  docker exec collector-entry-smoke node -e 'const s=require("net").connect(3300,"127.0.0.1");s.on("connect",()=>process.exit(1));s.on("error",()=>process.exit(0));setTimeout(()=>process.exit(1),2000)'
  docker stop -t 30 collector-entry-smoke >/dev/null
  test "$(docker inspect --format '{{.State.ExitCode}}' collector-entry-smoke)" = 0
  cleanup
done
