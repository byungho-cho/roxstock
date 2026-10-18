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
# One bounded run. Manual priority, budget and lock ownership can yield at any boundary.
# Remaining exact currency holds resume through the existing bounded automatic collector.
docker exec roxstock-dart-collector node collector/dist/scripts/recover-foreign-financials.js --apply --max-periods=500 --max-calls=1800
