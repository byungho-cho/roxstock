#!/usr/bin/env bash
set -Eeuo pipefail
SHA="${1:?immutable SHA required}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
for service in backend collector; do
  image="$(docker inspect --format '{{.Config.Image}}' "roxstock-$service")"
  [[ "$image" == "newrox/roxstock-$service:sha-$SHA" ]] || exit 1
done
umask 077
log="$(mktemp /tmp/roxstock-news-identity.XXXXXX)"
trap 'rm -f "$log"' EXIT
for attempt in $(seq 1 12); do
  docker exec roxstock-collector node collector/dist/worker.js news-report-reconcile > "$log" 2>&1 || { echo NEWS_REPORT_IDENTITY_COMMAND_FAILED; exit 1; }
  if grep -q '"status":"LOCKED"' "$log"; then sleep 10; continue; fi
  cat "$log"
  grep -q '"status":"SUCCESS"' "$log"
  if grep -Eq '"more(News|Candidates|Relations)Possible":true' "$log"; then echo NEWS_REPORT_IDENTITY_BATCH_LIMIT_REVIEW_REQUIRED; exit 1; fi
  docker exec -i roxstock-backend node --input-type=module <<'NODE'
import {PrismaClient} from './shared/dist/generated/prisma/index.js';
import {newsCollectionState} from './shared/dist/news/state.js';
const db=new PrismaClient();
try{
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()),state=await newsCollectionState(db);
 const supplements=await db.collectorRun.count({where:{jobType:'stock-news',metadata:{path:'$.slotKey',equals:'SUPPLEMENT:'+day}}});
 console.log('NEWS_REPORT_IDENTITY_STATE',JSON.stringify({storedTotal:await db.stockNewsItem.count(),supplementRuns:supplements,lastAttemptAt:state.lastAttemptAt,lastFinishedAt:state.lastFinishedAt,lastFullSuccessAt:state.lastFullSuccessAt,lastNewStoredAt:state.lastNewStoredAt,nextAt:state.nextAt,nextRetryAt:state.nextRetryAt,intervalHours:state.intervalHours,startTime:state.startTime}));
}finally{await db.$disconnect();}
NODE
  echo NEWS_REPORT_IDENTITY_RECONCILED_WITHOUT_COLLECTION
  exit 0
done
echo NEWS_REPORT_IDENTITY_LOCKED_RETRY_LATER
exit 1
