#!/usr/bin/env bash
set -Eeuo pipefail
SHA="${1:?immutable SHA required}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
ROOT="/opt/roxstock/.deploy/commits/$SHA"
for component in backend collector dart-collector frontend; do
  image="$(docker inspect --format '{{.Config.Image}}' "roxstock-$component")"
  family="$component"; [[ "$component" != dart-collector ]] || family=collector
  [[ "$image" == "newrox/roxstock-$family:sha-$SHA" ]] || exit 1
done
test -s /opt/roxstock/.deploy/security-data-history-retired
test -s /opt/roxstock/.deploy/security-data-settings-baseline
if systemctl is-active --quiet roxstock-kis-history.timer; then echo 'Historical timer remains active'; exit 1; fi
# Run only the installed scheduled engine; do not initiate an ad hoc backfill.
deadline=$((SECONDS+660))
while (( SECONDS < deadline )); do
  docker cp "$ROOT/scripts/security-data-production-check.mjs" roxstock-dart-collector:/tmp/security-data-production-check.mjs
  if docker exec roxstock-dart-collector node /tmp/security-data-production-check.mjs > /tmp/roxstock-security-data-result.json; then
    cat /tmp/roxstock-security-data-result.json
    break
  fi
  if (( SECONDS+15 >= deadline )); then exit 1; fi
  sleep 15
done
docker exec -i roxstock-backend node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {prisma} from './shared/dist/lib/prisma.js';
import {randomToken,tokenHash} from './backend/dist/auth/crypto.js';
const origin='https://newrox.cafe24.com',sessions=[];
try{
 const request=async(path,cookie)=>fetch(origin+path,{headers:cookie?{cookie}:{},signal:AbortSignal.timeout(30000)});
 const version=await (await request('/api/version')).json();assert.equal(version.data.version,'1.2.31');
 for(const path of ['/api/security-data/quarters','/api/collection/monitoring'])assert.equal((await request(path)).status,401);
 for(const role of ['USER','ADMIN']){
  const user=await prisma.authUser.findFirst({where:{role,verifiedAt:{not:null},mustChangePassword:false},select:{id:true}});assert.ok(user,role+' verification identity unavailable');
  // Short-lived server-issued verification sessions use the production guard and real user role.
  const id=randomToken(),token=id+'.'+randomToken(),csrf=randomToken();sessions.push(id);
  await prisma.authSession.create({data:{id,userId:user.id,persistent:false,tokenHash:tokenHash(token),csrfHash:tokenHash(csrf),expiresAt:new Date(Date.now()+300000)}});
  const cookie='rox_session='+token+'; rox_csrf='+csrf;
  const response=await request('/api/security-data/quarters',cookie);assert.equal(response.status,role==='ADMIN'?200:403);
  assert.equal((await request('/api/collection/monitoring',cookie)).status,role==='ADMIN'?200:403);
  if(role==='ADMIN'){
   const quarters=(await response.json()).data.quarters;assert.equal(quarters.length,4);
   for(const q of quarters){assert.equal(q.target,q.complete+q.waiting+q.missing);}
   const q=quarters.at(-1),list=await (await request(`/api/security-data/quarters/${q.year}/${q.quarter}`,cookie)).json();
   if(list.data.items.length){const sid=list.data.items[0].id,detail=await (await request(`/api/security-data/quarters/${q.year}/${q.quarter}/${sid}`,cookie)).json();assert.equal(detail.data.fields.length,26);const raw=await prisma.periodValuation.findUnique({where:{securityId_fiscalYear_periodType:{securityId:BigInt(sid),fiscalYear:q.year,periodType:q.quarter===4?'ANNUAL':'Q'+q.quarter}}});for(const field of detail.data.fields.filter(f=>['eps','bps','roe','per','pbr'].includes(f.key))){const stored=raw?.values?.[field.key]??null;if(field.value===null&&stored!==null)assert.ok(detail.data.reasons.basis||detail.data.reasons.basisConflict);else assert.equal(field.value,stored);}}
  }
 }
 console.log(JSON.stringify({marker:'SECURITY_DATA_PRODUCTION_HTTP_VERIFIED',checkedAt:new Date().toISOString(),version:version.data.version,anonymous:401,user:403,admin:200,quarterTotalsVerified:true,storageApiVerified:true,browserVerified:false}));
}finally{await prisma.authSession.deleteMany({where:{id:{in:sessions}}});await prisma.$disconnect();}
JS
