#!/usr/bin/env bash
# Run only after all three components have deployed; source backup is made by deployment.
set -Eeuo pipefail
SHA="${1:-}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
for entry in roxstock-backend:backend roxstock-dart-collector:collector roxstock-frontend:frontend; do
  container="${entry%%:*}"
  component="${entry##*:}"
  expected="newrox/roxstock-$component:sha-$SHA"
  [[ "$(docker inspect --format '{{.Config.Image}}' "$container")" == "$expected" ]] || {
    echo "Recovery skipped: $component is not deployed at the expected revision."
    exit 1
  }
  [[ "$(docker inspect --format '{{.State.Running}}' "$container")" == true ]] || exit 1
done
docker exec roxstock-backend node -e "fetch('http://127.0.0.1:3300/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
docker exec roxstock-dart-collector node collector/dist/scripts/recover-foreign-financials.js --max-periods=10
# At most four bounded passes. Each pass advances a keyset cursor; failed/excluded
# targets are retained for review, not retried in a tight loop. Manual/budget yields stop.
# Daily reservations are still shared with all normal automatic and manual work.
cursor=0
for pass in 1 2 3 4; do
  [[ "$(docker inspect --format '{{.Config.Image}}' roxstock-dart-collector)" == "newrox/roxstock-collector:sha-$SHA" ]] || exit 1
  output="$(docker exec roxstock-dart-collector node collector/dist/scripts/recover-foreign-financials.js --apply --max-periods=500 --max-calls=1800 --after="$cursor")"
  printf '%s\n' "$output"
  summary="$(tail -n 1 <<< "$output")"
  cursor="$(docker exec -i roxstock-backend node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(d.cursor))' <<< "$summary")"
  [[ "$cursor" =~ ^[0-9]+$ ]] || exit 1
  done_or_yielded="$(docker exec -i roxstock-backend node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8"));process.stdout.write(String(d.remaining===0||d.processed===0||Boolean(d.stopReason)))' <<< "$summary")"
  [[ "$done_or_yielded" == true ]] && break
 done
