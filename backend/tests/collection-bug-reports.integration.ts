import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
import {prisma as db} from '@roxstock/shared/lib/prisma';
import {buildApp} from '../src/app.js';
import {saveBugEvent,scanCollectionBugs,reclassifyBugReportsPage,reconcileBugReportsPage,consolidateBugReportsPage} from '../src/domain/collection-bug-reports.js';
const url=new URL(process.env.DATABASE_URL??'');if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/roxstock_bugreports_test'&&process.env.CI!=='true')throw Error('Isolated local/CI DB required');
test('report persistence, concurrency, replay, review, recurrence and resolved deletion through real MariaDB/API',async()=>{
 const suffix=String(Date.now()),feature='bug-test-'+suffix,app=buildApp(),event={sourceKey:'test:'+suffix,feature,code:'DART_TEST_FAILURE',severity:'ERROR' as const,summary:'테스트 오류',observedAt:new Date(),symbol:'005930',metric:'per'};
 let runId:bigint|undefined;
 try{
  await Promise.all(Array.from({length:4},()=>saveBugEvent(db,event)));
  const first=await db.collectionBugReport.findFirstOrThrow({where:{feature}});assert.equal(first.occurrences,1);
  const get=async(path:string)=>(await app.inject({method:'GET',url:path}));
  assert.equal((await get('/api/collection/bug-reports?state=INVALID')).statusCode,400);
  assert.equal((await get('/api/collection/bug-reports?date=2026-02-30')).statusCode,400);
  assert.ok((await get('/api/collection/bug-reports?state=ALL')).json().data.rows.some((r:any)=>r.id===String(first.id)));
  assert.equal((await app.inject({method:'DELETE',url:'/api/collection/bug-reports/'+first.id})).statusCode,409);
  for(const state of ['REVIEWING','RESOLVED'])assert.equal((await app.inject({method:'PATCH',url:'/api/collection/bug-reports/'+first.id,payload:{state,note:'검증 메모'}})).statusCode,200);
  assert.equal(await saveBugEvent(db,event),false);assert.equal((await db.collectionBugReport.findUniqueOrThrow({where:{id:first.id}})).state,'RESOLVED');
  await saveBugEvent(db,{...event,sourceKey:event.sourceKey+':recurrence',observedAt:new Date(Date.now()+1000)});
  assert.equal((await db.collectionBugReport.findUniqueOrThrow({where:{id:first.id}})).state,'OPEN');
  const detail=(await get('/api/collection/bug-reports/'+first.id)).json().data;assert.equal(detail.events.length,2);assert.equal(detail.reviewNote,'검증 메모');
  await app.inject({method:'PATCH',url:'/api/collection/bug-reports/'+first.id,payload:{state:'RESOLVED'}});
  assert.equal((await app.inject({method:'DELETE',url:'/api/collection/bug-reports/'+first.id})).statusCode,200);
  assert.equal(await saveBugEvent(db,event),false);assert.equal(await db.collectionBugReport.count({where:{feature}}),0);
  await saveBugEvent(db,{...event,sourceKey:event.sourceKey+':new',observedAt:new Date(Date.now()+2000)});assert.equal(await db.collectionBugReport.count({where:{feature}}),1);
  runId=(await db.collectorRun.create({data:{jobType:feature+'-scan',provider:'TEST',status:'FAILED',finishedAt:new Date(),failureCount:1,failureReason:'https://secret.invalid?token=do-not-store'}})).id;
  await scanCollectionBugs(db);await scanCollectionBugs(db);
  const scanned=await db.collectionBugReport.findFirstOrThrow({where:{feature:feature+'-scan'}});assert.equal(scanned.occurrences,1);assert.equal(scanned.code,'COLLECTION_FAILED');assert.doesNotMatch(JSON.stringify(scanned,(_,v)=>typeof v==='bigint'?String(v):v),/secret.invalid|do-not-store/);
  const item=await db.collectorRunItem.create({data:{runId,status:'FAILED',symbol:'005930',message:'KIS_CONNECTION_FAILED',createdAt:new Date(Date.now()-86400000),observedAt:new Date()}});
  await scanCollectionBugs(db);let repeated=await db.collectionBugReport.findFirstOrThrow({where:{feature:feature+'-scan',code:'KIS_CONNECTION_FAILED'}});assert.equal(repeated.occurrences,1);
  await db.collectorRunItem.update({where:{id:item.id},data:{observedAt:new Date(Date.now()+1000)}});await scanCollectionBugs(db,new Date(Date.now()+2000));repeated=await db.collectionBugReport.findUniqueOrThrow({where:{id:repeated.id}});assert.equal(repeated.occurrences,2);

  const reviewItem=await db.collectorRunItem.create({data:{runId,status:'FAILED',symbol:'005930',message:'REVIEW_REQUIRED: generic',diagnostics:{originalCode:'DART_SOURCE_REVIEW',validationResult:'MULTIPLE_ANNUAL_PERIODS'}}});
  const sourceKey='item:'+reviewItem.id+':'+reviewItem.createdAt.toISOString();
  await saveBugEvent(db,{sourceKey,feature:feature+'-scan',code:'COLLECTION_FAILED',severity:'ERROR',summary:'기존 일반 분류',observedAt:reviewItem.createdAt,runId});
  const oldGeneric=await db.collectionBugReport.findFirstOrThrow({where:{feature:feature+'-scan',code:'COLLECTION_FAILED'}});
  const beforeCount=await db.collectionBugOccurrence.count({where:{report:{feature:{startsWith:feature}}}});
  const repair=await reclassifyBugReportsPage(db);assert.equal(repair.changed,1);
  const warning=await db.collectionBugReport.findFirstOrThrow({where:{feature:feature+'-scan',code:'DART_REVIEW_MULTIPLE_ANNUAL_PERIODS'}});assert.equal(warning.severity,'WARNING');assert.equal(warning.occurrences,1);
  assert.equal(await db.collectionBugOccurrence.count({where:{report:{feature:{startsWith:feature}}}}),beforeCount,'classification preserves occurrence count');
  assert.equal((await db.collectionBugReport.findUniqueOrThrow({where:{id:oldGeneric.id}})).occurrences,oldGeneric.occurrences-1);
  assert.equal((await reclassifyBugReportsPage(db)).changed,0,'repeat repair is idempotent');

 }finally{
  const reports=await db.collectionBugReport.findMany({where:{feature:{startsWith:feature}},select:{id:true}});
  await db.collectionBugOccurrence.deleteMany({where:{OR:[{reportId:{in:reports.map(r=>r.id)}},{eventKey:{in:[event.sourceKey,event.sourceKey+':recurrence',event.sourceKey+':new'].map(key=>createHash('sha256').update(key).digest('hex'))}}]}});
  await db.collectionBugReport.deleteMany({where:{feature:{startsWith:feature}}});if(runId)await db.collectorRun.delete({where:{id:runId}});await app.close();await db.$disconnect();
 }
});
test('reconciliation resolves only repaired targets, counts repeated attempts once and preserves history',async()=>{
 const suffix=String(Date.now()),feature='reconcile-test-'+suffix,app=buildApp(),securities:bigint[]=[];
 try{
  for(const n of [1,2])securities.push((await db.security.create({data:{symbol:'TEST'+suffix.slice(-5)+n,name:'검증용',marketType:'KOSPI'}})).id);
  for(const [index,id] of securities.entries())await db.periodValuation.create({data:{securityId:id,fiscalYear:2025,periodType:'ANNUAL',status:'PARTIAL',values:{per:index===0?'10':null},reasons:{},provenance:{}}});
  const event={feature,code:'PERIOD_PER_MISSING',severity:'WARNING' as const,summary:'PER 부족',observedAt:new Date(Date.now()-60000),fiscalYear:2025,periodType:'ANNUAL',metric:'per'};
  for(const [n,id] of securities.entries())for(let attempt=0;attempt<(n===0?2:1);attempt++)await saveBugEvent(db,{...event,securityId:id,sourceKey:suffix+':'+id+':'+attempt});
  const report=await db.collectionBugReport.findFirstOrThrow({where:{feature}});await reconcileBugReportsPage(db);
  assert.equal(await db.collectionBugOccurrence.count({where:{reportId:report.id,resolvedAt:{not:null}}}),2);
  assert.equal((await db.collectionBugReport.findUniqueOrThrow({where:{id:report.id}})).state,'OPEN');
  const detail=(await app.inject({method:'GET',url:'/api/collection/bug-reports/'+report.id})).json().data;assert.equal(detail.activeTargets,1);assert.equal(detail.totalTargets,2);assert.equal(detail.occurrences,3);
  await db.periodValuation.update({where:{securityId_fiscalYear_periodType:{securityId:securities[1]!,fiscalYear:2025,periodType:'ANNUAL'}},data:{values:{per:'11'}}});await reconcileBugReportsPage(db);
  assert.equal((await db.collectionBugReport.findUniqueOrThrow({where:{id:report.id}})).state,'RESOLVED');assert.equal(await db.collectionBugOccurrence.count({where:{reportId:report.id}}),3);
  assert.equal((await reconcileBugReportsPage(db)).resolved,0);
  for(const metric of ['per','pbr']){
   const fingerprint=createHash('sha256').update(feature+':PERIOD_PRICE_BASIS_UNCONFIRMED:'+metric).digest('hex');
   const old=await db.collectionBugReport.create({data:{fingerprint,feature,code:'PERIOD_PRICE_BASIS_UNCONFIRMED',severity:'WARNING',summary:'기존 개별 지표',occurrences:1,firstSeenAt:event.observedAt,lastSeenAt:event.observedAt}});
   await db.collectionBugOccurrence.create({data:{eventKey:createHash('sha256').update(suffix+metric).digest('hex'),reportId:old.id,securityId:securities[0],fiscalYear:2025,periodType:'ANNUAL',metric,observedAt:event.observedAt}});
  }
  let cursor:bigint|undefined;for(let page=0;page<20;page++){const [r]=await Promise.all([consolidateBugReportsPage(db,cursor),consolidateBugReportsPage(db,cursor)]);if(!r.hasNext)break;cursor=r.cursor;}
  const consolidated=await db.collectionBugReport.findMany({where:{feature,code:'PERIOD_PRICE_BASIS_UNCONFIRMED'}});assert.equal(consolidated.length,1);assert.equal(consolidated[0]!.occurrences,2);
  const grouped=(await app.inject({method:'GET',url:'/api/collection/bug-reports/'+consolidated[0]!.id})).json().data;assert.equal(grouped.activeTargets,1);assert.equal(grouped.events.length,2,'raw history is preserved');
 }finally{await db.collectionBugOccurrence.deleteMany({where:{report:{feature}}});await db.collectionBugReport.deleteMany({where:{feature}});await db.periodValuation.deleteMany({where:{securityId:{in:securities}}});await db.security.deleteMany({where:{id:{in:securities}}});await app.close();await db.$disconnect();}
});
