#!/usr/bin/env bash
set -Eeuo pipefail
SHA="${1:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
ROOT=/opt/roxstock
install -d -m 700 "$ROOT/.deploy"
exec 8>"$ROOT/.deploy/production.lock"
flock -w 1200 8
git -C "$ROOT" fetch origin main
[[ "$(git -C "$ROOT" rev-parse origin/main)" == "$SHA" ]] || { echo 'Requested revision is not current main'; exit 1; }
TREE="$ROOT/.deploy/commits/$SHA"
[[ -d "$TREE" ]] || git -C "$ROOT" worktree add --detach "$TREE" "$SHA"
[[ "$(git -C "$TREE" rev-parse HEAD)" == "$SHA" ]] || exit 1
test -f "$ROOT/backend/.env.production"
# Canonical shared credentials (DART/KRX/KIS). Copy privately; never render values in logs.
install -m 600 "$ROOT/backend/.env.production" "$TREE/backend/.env.production"
# Schema deployment belongs to the backend pipeline, never to this worker.
docker exec roxstock-backend node -e 'const {PrismaClient}=require("./shared/dist/generated/prisma/index.js");const db=new PrismaClient();db.$queryRawUnsafe("SELECT id FROM investor_flow_daily LIMIT 0").then(()=>db.$disconnect()).catch(()=>process.exit(1))'
export INVESTOR_CRAWLER_IMAGE="newrox/roxstock-investor-crawler:sha-$SHA"
previous="$(docker inspect --format '{{.Config.Image}}' roxstock-investor-crawler 2>/dev/null || true)"
docker pull "$INVESTOR_CRAWLER_IMAGE"
docker compose -p roxstock-investor -f "$TREE/infra/docker/compose.investor-crawler.yml" up -d --no-deps investor-crawler
for attempt in $(seq 1 36); do
  state="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' roxstock-investor-crawler)"
  if [[ "$state" == healthy ]]; then
    if [[ "$previous" =~ ^newrox/roxstock-investor-crawler:sha-[0-9a-f]{40}$ ]]; then printf '%s\n' "$previous" > "$ROOT/.deploy/investor-last-good-image"; fi
    if [[ -f "$ROOT/.deploy/security-data-investor-was-running" ]]; then
      docker exec roxstock-investor-crawler node -e 'if(process.env.SECURITY_DATA_COLLECTION_ENABLED!=="true"||process.env.KIS_SUPPLEMENT_ENABLED!=="false")process.exit(1)'
      date -u +%FT%TZ > "$ROOT/.deploy/security-data-investor-transitioned"
    fi
    echo "Dedicated investor crawler healthy: $SHA"
    exit 0
  fi
  sleep 5
done
if [[ "$previous" =~ ^newrox/roxstock-investor-crawler:sha-[0-9a-f]{40}$ ]]; then
 export INVESTOR_CRAWLER_IMAGE="$previous"
 docker compose -p roxstock-investor -f "$TREE/infra/docker/compose.investor-crawler.yml" up -d --no-deps investor-crawler
else
 docker stop roxstock-investor-crawler
fi
echo 'Investor crawler health failed; prior image restored or new worker stopped' >&2
exit 1
