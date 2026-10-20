#!/usr/bin/env bash
# Bounded post-deploy supplement, immutable revision and KST date guarded.
set -Eeuo pipefail
SHA="${1:?immutable SHA required}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
for service in backend collector frontend; do
  image="$(docker inspect --format '{{.Config.Image}}' "roxstock-$service")"
  [[ "$image" == "newrox/roxstock-$service:sha-$SHA" ]] || { echo "NEWS35_${service^^}_REVISION_NOT_DEPLOYED"; exit 1; }
done
kst_day="$(TZ=Asia/Seoul date +%F)"
if [[ "$kst_day" != 2026-10-20 ]]; then
  echo 'NEWS35_TODAY_SUPPLEMENT_NOT_EXECUTED: deployment missed 2026-10-20 KST; run a separately dated bounded supplement after review.'
  exit 1
fi
umask 077
log="$(mktemp /tmp/roxstock-news35.XXXXXX)"
trap 'rm -f "$log"' EXIT
# Same supplement key is retried only for lock contention, not to repeat a completed run.
for attempt in $(seq 1 48); do
  docker exec roxstock-collector node collector/dist/worker.js news-supplement "$kst_day" > "$log" 2>&1 || { echo NEWS35_SUPPLEMENT_COMMAND_FAILED; exit 1; }
  if docker exec -i roxstock-backend node --input-type=module <<'NODE'
import {PrismaClient} from './shared/dist/generated/prisma/index.js';
import {newsCollectionState} from './shared/dist/news/state.js';
const db=new PrismaClient();
try {
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
 const slot=await db.stockNewsSlot.findUnique({where:{key:'SUPPLEMENT:'+day}});
 if(!slot||!slot.finishedAt){process.exitCode=2;}
 else {
  const run=await db.collectorRun.findFirst({where:{jobType:'stock-news',metadata:{path:'$.slotKey',equals:'SUPPLEMENT:'+day}},orderBy:{id:'desc'}});
  const state=await newsCollectionState(db);
  let cursor=0n,checked=0,visible=0;
  for(let page=0;page<4;page++){
   const accounts=await db.account.findMany({where:{isActive:true,id:{gt:cursor}},select:{id:true},orderBy:{id:'asc'},take:25});
   for(const account of accounts){const response=await fetch('http://127.0.0.1:3300/api/accounts/'+account.id+'/stock-news');if(!response.ok)throw Error('NEWS35_LIST_QUERY_FAILED');const body=await response.json();if(body.meta.accountId!==String(account.id)||body.data.length>10||body.meta.count!==body.data.length)throw Error('NEWS35_LIST_ACCOUNT_PAGE_INVALID');checked++;visible+=body.meta.total;}
   if(accounts.length<25)break;cursor=accounts.at(-1).id;
  }
  const m=run?.metadata??{};
  console.log('NEWS35_PRODUCTION_RESULT',JSON.stringify({applicationVersion:'1.1.25',date:day,kind:slot.kind,runId:String(run?.id??''),status:slot.status,finishedAt:slot.finishedAt,newStored:run?.successCount??0,duplicates:m.duplicates??0,selectionExcluded:m.selectionExcluded??0,linkedRelationships:m.linkedRelationships??0,failedProviders:run?.failureCount??0,storedTotal:await db.stockNewsItem.count(),accountsChecked:checked,visibleNews:visible,settings:{intervalHours:state.intervalHours,startTime:state.startTime,anchorAt:state.anchorAt,timezone:state.timezone,nextAt:state.nextAt,nextRetryAt:state.nextRetryAt},providers:state.providers.map(p=>({id:p.id,status:p.status,reasons:p.error?.split(', ').map(w=>w.split(':')[0])??[],diagnostics:p.diagnostics,gaps:p.gaps,nextRetryAt:p.nextRetryAt,attempts:p.attempts}))}));
  console.log('NEWS35_DEPLOYED_SUPPLEMENT_AND_STORED_LIST_VERIFIED');
 }
}finally{await db.$disconnect();}
NODE
  then exit 0; else result=$?; [[ "$result" == 2 ]] || exit "$result"; fi
  sleep 10
done
echo 'NEWS35_SUPPLEMENT_NOT_FINISHED: inspect stock-news lease and SUPPLEMENT slot; same key is safe to resume.'
exit 1
