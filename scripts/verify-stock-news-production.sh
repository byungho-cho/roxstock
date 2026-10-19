#!/usr/bin/env bash
# Execute on the deployment host, from a copied script (no streamed-stdin command ambiguity).
set -Eeuo pipefail
SHA="${1:?immutable application SHA required}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
image="$(docker inspect --format '{{.Config.Image}}' roxstock-collector)"
[[ "$image" == "newrox/roxstock-collector:sha-$SHA" ]] || { echo 'NEWS_APPLICATION_REVISION_NOT_DEPLOYED'; exit 1; }
umask 077
log="$(mktemp /tmp/roxstock-news-first.XXXXXX)"
trap 'rm -f "$log"' EXIT
# Normally the daemon has already claimed the initial run. This CLI is idempotent.
docker exec roxstock-collector node collector/dist/worker.js news > "$log" 2>&1 || { echo 'NEWS_INITIAL_COMMAND_FAILED: protected server log retained only during this check'; exit 1; }
for attempt in $(seq 1 30); do
  if docker exec -i roxstock-backend node --input-type=module <<'NODE'
import {PrismaClient} from './shared/dist/generated/prisma/index.js';
const db=new PrismaClient();
try {
 const state=await db.stockNewsState.findUnique({where:{id:'stock-news'}});
 if(!state?.initialCompletedAt){console.log(JSON.stringify({policy:'stock-news-v1',status:state?.lastStatus??'NOT_COLLECTED',initialComplete:false}));process.exitCode=2;}
 else {
  const run=await db.collectorRun.findFirst({where:{jobType:'stock-news',status:{in:['SUCCESS','PARTIAL']}},orderBy:{id:'desc'}});
  let cursor=0n,checked=0,totalVisible=0;
  for(let page=0;page<4;page++){
   const accounts=await db.account.findMany({where:{isActive:true,id:{gt:cursor}},select:{id:true},orderBy:{id:'asc'},take:25});
   for(const a of accounts){const r=await fetch('http://127.0.0.1:3300/api/accounts/'+a.id+'/stock-news');if(!r.ok)throw Error('STORED_NEWS_API_FAILED');const body=await r.json();if(body.meta.accountId!==String(a.id)||body.data.length>10||body.meta.count!==body.data.length)throw Error('NEWS_ACCOUNT_PAGE_INVALID');checked++;totalVisible+=body.meta.total;}
   if(accounts.length<25)break;cursor=accounts.at(-1).id;
  }
  const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()),six=Date.parse(day+'T06:00:00+09:00'),next=new Date(six>Date.now()?six:six+86400000);
  const details=run?.metadata?.providerResults??[];
  console.log(JSON.stringify({policy:'stock-news-v1',status:state.lastStatus,initialComplete:true,initialDate:state.initialDate,initialCompletedAt:state.initialCompletedAt,lastCollectedAt:state.lastCollectedAt,runId:String(run?.id??''),saved:run?.successCount??0,failedProviders:run?.failureCount??0,duplicates:run?.metadata?.duplicates??0,storedTotal:await db.stockNewsItem.count(),accountsChecked:checked,totalVisibleNews:totalVisible,schedule:{timezone:'Asia/Seoul',hour:6,enabled:true,nextAt:next.toISOString()},providers:details.map(r=>({id:r.provider,status:r.status,candidates:r.count,requests:r.requests,reasons:r.warnings.map(w=>w.split(':')[0])}))}));
 }
} finally {await db.$disconnect();}
NODE
  then echo 'STOCK_NEWS_FIRST_COLLECTION_AND_STORED_API_VERIFIED'; exit 0; fi
  sleep 10
done
echo 'NEWS_INITIAL_COLLECTION_NOT_COMPLETED: inspect stock-news monitoring, then rerun the same idempotent command.'
exit 1
