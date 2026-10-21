#!/usr/bin/env bash
set -Eeuo pipefail
SHA="${1:?immutable SHA required}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
for entry in roxstock-backend:backend roxstock-dart-collector:collector roxstock-frontend:frontend; do
  container="${entry%%:*}"; component="${entry##*:}"
  [[ "$(docker inspect --format '{{.Config.Image}}' "$container")" == "newrox/roxstock-$component:sha-$SHA" ]] || exit 1
done
umask 077
source_root=/opt/roxstock
exec 8>"$source_root/.deploy/production.lock"
flock -w 300 8
marker="$source_root/.deploy/dart-status-backup-$SHA"
if [[ ! -f "$marker" ]]; then
  backup_id="roxstock-v0.2-$(date -u +%Y%m%dT%H%M%SZ)"
  backup_dir="$source_root/backups/$backup_id"
  install -d -m 700 "$backup_dir"
  backup_file="$backup_dir/$backup_id.sql.gz"
  timeout 300 docker exec roxstock-mariadb sh -c '
    export MYSQL_PWD="${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"
    test -n "$MYSQL_PWD" || exit 1
    exec mariadb-dump -uroot --single-transaction --quick --routines --events --triggers --hex-blob roxstock
  ' 2>"$backup_dir/database-backup.log" | gzip > "$backup_file.partial"
  test -s "$backup_file.partial"
  gzip -t "$backup_file.partial"
  mv "$backup_file.partial" "$backup_file"
  sha256sum "$backup_file" > "$backup_file.sha256"
  sha256sum -c "$backup_file.sha256" > /dev/null
  printf '%s\n' "$backup_dir" > "$marker"
fi
backup_dir="$(cat "$marker")"
[[ "$backup_dir" == "$source_root/backups/roxstock-v0.2-"* && -d "$backup_dir" ]] || exit 1
private_plan="$backup_dir/dart-status-plan.json"
container_plan="/tmp/dart-status-$SHA.json"
log="$backup_dir/dart-status-result.log"
run_private() {
  local attempt result
  for attempt in $(seq 1 24); do
    if docker exec roxstock-dart-collector node collector/dist/scripts/reconcile-dart-task-status.js "$@" >> "$log" 2>&1; then return 0; else result=$?; fi
    [[ "$result" == 75 ]] || return "$result"
    sleep 10
  done
  return 75
}
# Plan contains task snapshots, reasons and receipt history. Never emit or upload it.
if [[ ! -f "$private_plan" ]]; then
  if ! docker exec roxstock-dart-collector test -f "$container_plan"; then
    run_private plan "$container_plan" || { echo DART_STATUS_PLAN_NOT_CREATED; exit 1; }
  fi
  docker cp "roxstock-dart-collector:$container_plan" "$private_plan" >/dev/null
  chmod 600 "$private_plan"
  sha256sum "$private_plan" > "$private_plan.sha256"
fi
sha256sum -c "$private_plan.sha256" > /dev/null
# The host backup must be durable before any correction; compare-and-set skips intervening work.
docker cp "$private_plan" "roxstock-dart-collector:$container_plan" >/dev/null
docker exec --user root roxstock-dart-collector chown node:node "$container_plan"
run_private apply "$container_plan" || { echo DART_STATUS_APPLY_FAILED_INSPECT_PRIVATE_LOG; exit 1; }
# Only the explicitly sanitized numeric summary is public.
result="$(tail -n 2 "$log" | head -n 1)"
if [[ "$result" != *'"progress"'* ]]; then echo DART_STATUS_SUMMARY_MISSING; exit 1; fi
printf '%s\n' "$result"
echo DART_STATUS_CORRECTION_COMPLETED_NO_FINANCIAL_BATCH_RECOLLECTION
# Compare the deployed handlers with DB in the existing legacy administrator's
# account scope. No session/token is created and no identity/holdings are emitted.
docker exec -i roxstock-backend node --input-type=module <<'NODE'
import Fastify from 'fastify';
import assert from 'node:assert/strict';
import {prisma} from './shared/dist/lib/prisma.js';
import {authContext} from './backend/dist/auth/context.js';
import {collectionStatusRoutes} from './backend/dist/routes/collection-status.js';
import {prisma as scoped} from './backend/dist/auth/scoped-db.js';
import {CollectionJobRepository} from './shared/dist/collection/job-repository.js';
import {eligibleWhere} from './shared/dist/collection/collection-policy.js';
import {dartTaskScope,dartTaskPeriodScope} from './shared/dist/collection/dart-backfill.js';
import {dartProgress,dartStatusWhere} from './shared/dist/collection/dart-task-status.js';
const app=Fastify();
try{
 const user=await prisma.authUser.findUnique({where:{legacyKey:'legacy'},select:{id:true,role:true}});
 if(!user||user.role!=='ADMIN')throw Error('Verified legacy administrator required');
 const identity={userId:user.id,role:user.role,sessionId:'read-only-server-handler-verification',mustChangePassword:false};
 app.addHook('onRequest',(_request,_reply,done)=>authContext.run(identity,done));
 await app.register(collectionStatusRoutes,{prefix:'/api'});
 const r=await app.inject('/api/collection/monitoring/dart-financial-statements?overview=1');assert.equal(r.statusCode,200);
 const dart=r.json().data.dart;
 const ids=await authContext.run(identity,async()=>{
  const candidates=await new CollectionJobRepository(scoped).prioritySecurityIds();
  return (await scoped.security.findMany({where:{...eligibleWhere('dart-financial-statements'),id:{in:candidates},securityType:'STOCK',dartCorpMapping:{isNot:null}},select:{id:true}})).map(s=>s.id);
 });
 const global=dartProgress(await prisma.dartBackfillTask.groupBy({by:['status','errorCode','needsSupplement'],where:dartTaskScope(),_count:{_all:true}}));
 const priority=dartProgress(await prisma.dartBackfillTask.groupBy({by:['status','errorCode','needsSupplement'],where:{...dartTaskScope(),securityId:{in:ids}},_count:{_all:true}}));
 for(const key of ['planned','currentTarget','completed','notDue','supplementPending','reviewRequired']){assert.equal(dart.backfill[key],global[key]);assert.equal(dart.priority[key],priority[key]);}
 assert.deepEqual(dart.backfill.byStatus,global.byStatus);assert.deepEqual(dart.priority.byStatus,priority.byStatus);
 const detailTotals={};
 for(const status of ['SUCCESS','NOT_DUE','NO_FILING','DATA_UNAVAILABLE','REVIEW_REQUIRED','PENDING','PROCESSING','FAILED']){
  const result=await app.inject('/api/collection/dart/tasks?scope=priority&status='+status);assert.equal(result.statusCode,200);detailTotals[status]=result.json().data.total;assert.equal(detailTotals[status],priority.byStatus[status]??0);
 }
 const candidates=await authContext.run(identity,()=>new CollectionJobRepository(scoped).prioritySecurityIds());
 const excluded=await app.inject('/api/collection/dart/tasks?scope=priority&status=EXCLUDED');assert.equal(excluded.statusCode,200);
 const excludedCount=await prisma.dartBackfillTask.count({where:{AND:[dartTaskPeriodScope(),{security:{securityType:'STOCK'},securityId:{in:candidates}},{OR:[dartStatusWhere('EXCLUDED'),{security:{collectionExcluded:true}},{security:{excludedFeatures:{array_contains:'dart-financial-statements'}}}]}]}});
 assert.equal(excluded.json().data.total,excludedCount);
 const anonymous=await fetch('http://127.0.0.1:3300/api/collection/dart/tasks?status=SUCCESS');assert.equal(anonymous.status,401);
 const version=await fetch('http://127.0.0.1:3300/api/version');assert.equal(version.status,200);
 console.log('DART_STATUS_DEPLOYED_API_DB_VERIFIED',JSON.stringify({global,priority:{securities:ids.length,...priority},priorityDetailTotals:detailTotals,priorityExcludedOutsideProgress:excludedCount,anonymousHttpStatus:anonymous.status,apiHandlerOnly:true,authenticatedBrowserChecked:false}));
}catch{console.error('DART_STATUS_API_DB_VERIFICATION_FAILED');process.exitCode=1;}
finally{await app.close();await prisma.$disconnect();}
NODE
