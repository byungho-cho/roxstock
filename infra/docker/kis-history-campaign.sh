#!/usr/bin/env bash
set -euo pipefail
# Installed privately on the production host. systemd prevents overlapping batches.
root=/opt/roxstock/.deploy/kis-history-campaign
test -f "$root/APPROVED"
test ! -e "$root/state/STOP" || exit 0
test "$(docker inspect -f '{{.State.Running}}' roxstock-dart-collector)" = false
if test -f "$root/state/state.json" && python3 -c 'import json,sys;sys.exit(0 if json.load(open(sys.argv[1])).get("done") else 1)' "$root/state/state.json"; then systemctl stop roxstock-kis-history.timer; exit 0; fi
image=$(cat "$root/image.txt")
network=$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}' roxstock-dart-collector)
docker run --rm --name roxstock-kis-history-batch --init --read-only --memory=384m --cpus=0.5 --pids-limit=96 \
  --network "$network" --env-file /opt/roxstock/backend/.env.production \
  -e TZ=Asia/Seoul -e KIS_HISTORY_PRODUCTION_ACK=temporary-universe-history \
  -e KIS_HISTORY_DIRECTORY=/var/lib/roxstock/kis-history -e KIS_TOKEN_CACHE_DIR=/var/lib/roxstock/kis-tokens \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  --mount "type=bind,src=$root/runtime/scripts,dst=/app/scripts,readonly" \
  --mount "type=bind,src=$root/runtime/investor-crawler/src,dst=/app/investor-crawler/src,readonly" \
  --mount "type=bind,src=$root/state,dst=/var/lib/roxstock/kis-history" \
  --mount type=volume,src=roxstock-kis-token-cache,dst=/var/lib/roxstock/kis-tokens \
  "$image" node scripts/kis-history-backfill.mjs
if python3 -c 'import json,sys;sys.exit(0 if json.load(open(sys.argv[1])).get("done") else 1)' "$root/state/state.json"; then systemctl stop roxstock-kis-history.timer; fi
