import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
import {prisma as db} from '@roxstock/shared/lib/prisma';
import {buildApp} from '../src/app.js';
import {saveBugEvent,scanCollectionBugs} from '../src/domain/collection-bug-reports.js';
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
 }finally{
  const reports=await db.collectionBugReport.findMany({where:{feature:{startsWith:feature}},select:{id:true}});
  await db.collectionBugOccurrence.deleteMany({where:{OR:[{reportId:{in:reports.map(r=>r.id)}},{eventKey:{in:[event.sourceKey,event.sourceKey+':recurrence',event.sourceKey+':new'].map(key=>createHash('sha256').update(key).digest('hex'))}}]}});
  await db.collectionBugReport.deleteMany({where:{feature:{startsWith:feature}}});if(runId)await db.collectorRun.delete({where:{id:runId}});await app.close();await db.$disconnect();
 }
});
