import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';
import {prisma as db} from '@roxstock/shared/lib/prisma';
import {buildApp} from '../src/app.js';
import {saveBugEvent,scanCollectionBugs,reclassifyBugReportsPage,reconcileBugReportsPage,consolidateBugReportsPage} from '../src/domain/collection-bug-reports.js';
import {PrismaDartRepository} from '../../collector/src/dart-repository.js';
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

test('reviewed unresolved reports collapse without losing causes, notes or fresh incidents',async()=>{
 const feature='review-group-test-'+Date.now(),app=buildApp();
 let securityId:bigint|undefined;
 try{
  securityId=(await db.security.create({data:{symbol:'R'+String(Date.now()).slice(-5),name:'취합 검증',marketType:'KOSPI'}})).id;
  for(const [n,code,severity] of [[1,'DATABASE_ERROR','ERROR'],[2,'PERIOD_BPS_MISSING','WARNING']] as const)await saveBugEvent(db,{sourceKey:feature+n,feature,code,severity,summary:code,securityId,fiscalYear:2024,periodType:'Q1',observedAt:new Date(Date.now()-10000)});
  const reports=await db.collectionBugReport.findMany({where:{feature},orderBy:{id:'asc'}});
  await saveBugEvent(db,{sourceKey:feature+'historical',feature,code:'DATABASE_ERROR',severity:'ERROR',summary:'DATABASE_ERROR',securityId,fiscalYear:2024,periodType:'Q1',observedAt:new Date(Date.now()-20000)});
  await db.collectionBugOccurrence.update({where:{eventKey:createHash('sha256').update(feature+'historical').digest('hex')},data:{resolvedAt:new Date(),resolution:'METRIC_FILLED'}});
  await db.collectionBugReport.updateMany({where:{feature},data:{state:'REVIEWING',reviewNote:'기존 메모 보존'}});
  const get=async(path:string)=>(await app.inject({method:'GET',url:path}));
  const list=(await get('/api/collection/bug-reports?state=UNRESOLVED')).json().data;
  assert.equal(list.rows.filter((r:any)=>r.id==='review-pending').length,1);assert.ok(!list.rows.some((r:any)=>reports.some(x=>String(x.id)===r.id)));
  const detail=(await get('/api/collection/bug-reports/review-pending')).json().data;
  assert.equal(detail.severity,'ERROR','unresolved storage failures must not become warnings');
  assert.equal(detail.activeTargets,1,'same security/period is counted once across causes');assert.equal(detail.memberCount,2);
  assert.equal(detail.occurrences,2,'review summary counts remaining occurrences, not repaired historical events');
  const security=await db.security.findUniqueOrThrow({where:{id:securityId}});assert.equal(detail.events[0].symbol,security.symbol,'missing historical symbol is filled for statement navigation');
  const member=(await get('/api/collection/bug-reports/'+reports[0]!.id)).json().data;assert.equal(member.events[0].symbol,security.symbol);
  assert.ok(detail.members.some((r:any)=>r.id===String(reports[0]!.id)&&r.reviewNote==='기존 메모 보존'));
  assert.ok(detail.events.some((e:any)=>e.code==='DATABASE_ERROR'));assert.ok(detail.events.some((e:any)=>e.code==='PERIOD_BPS_MISSING'));
  assert.equal((await app.inject({method:'PATCH',url:'/api/collection/bug-reports/review-pending',payload:{state:'RESOLVED'}})).statusCode,400,'summary cannot bulk resolve real failures');
  assert.ok((await get('/api/collection/bug-reports?state=ALL')).json().data.rows.some((r:any)=>r.id===String(reports[0]!.id)),'original reports remain in history');
  await saveBugEvent(db,{sourceKey:feature+'fresh',feature,code:'DATABASE_ERROR',severity:'ERROR',summary:'DATABASE_ERROR',observedAt:new Date()});
  assert.equal((await db.collectionBugReport.findUniqueOrThrow({where:{id:reports[0]!.id}})).state,'OPEN');
  assert.ok((await get('/api/collection/bug-reports?state=UNRESOLVED')).json().data.rows.some((r:any)=>r.id===String(reports[0]!.id)));
  assert.equal(await db.collectionBugOccurrence.count({where:{report:{feature},resolvedAt:null}}),3);
  assert.equal((await get('/api/collection/bug-reports/review-pending?memberOffset=-1')).statusCode,400);
 }finally{await db.collectionBugOccurrence.deleteMany({where:{report:{feature}}});await db.collectionBugReport.deleteMany({where:{feature}});if(securityId)await db.security.delete({where:{id:securityId}});await app.close();await db.$disconnect();}
});

test('closing warnings reconcile against the exact receipt actual fiscal period, preserving requested period history',async()=>{
 const feature='closing-receipt-test-'+Date.now(),at=new Date(Date.now()-60000),receipt='20990101000001';let id:bigint|undefined,runId:bigint|undefined;
 try{
  id=(await db.security.create({data:{symbol:'T'+String(Date.now()).slice(-5),name:'결산 검증',marketType:'KOSPI'}})).id;
  const filing=await db.dartFinancialFiling.create({data:{securityId:id,fiscalYear:2024,periodType:'Q1',reportCode:'11013',fsDivision:'OFS',receiptNo:receipt,reportName:'분기보고서',periodEndDate:new Date('2024-09-30'),receiptDate:new Date('2024-11-14'),collectedAt:new Date()}});
  await db.periodValuation.create({data:{securityId:id,fiscalYear:2024,periodType:'Q1',status:'PARTIAL',values:{},reasons:{},provenance:{receiptNo:receipt,periodEnd:'2024-09-30'},supplemental:{fiscalDuration:{method:'DART_MAJOR_ACCOUNTS_MATCH',receiptNo:receipt,fsDivision:'OFS',start:'2024-07-01',end:'2024-09-30',months:3,verifiedAt:new Date().toISOString()}}}});
  runId=(await db.collectorRun.create({data:{jobType:feature,provider:'TEST',status:'PARTIAL',startedAt:at}})).id;
  const item=await db.collectorRunItem.create({data:{runId,securityId:id,symbol:'000001',status:'FAILED',createdAt:at,observedAt:at,diagnostics:{taskFiscalYear:2023,reportCode:'11014',selectedReceiptNo:receipt}}});
  await saveBugEvent(db,{sourceKey:'item:'+item.id+':'+at.toISOString(),feature,code:'DART_REVIEW_CLOSING_MONTH_CHANGED',severity:'WARNING',summary:'검토',observedAt:at,securityId:id,runId,fiscalYear:2023,periodType:'Q3'});
  await reconcileBugReportsPage(db);
  const event=await db.collectionBugOccurrence.findFirstOrThrow({where:{report:{feature}}});assert.equal(event.resolution,'RECEIPT_FISCAL_PERIOD_VERIFIED');assert.equal(event.fiscalYear,2023);assert.equal(event.periodType,'Q3');
  assert.equal((await db.dartFinancialFiling.findUniqueOrThrow({where:{id:filing.id}})).fiscalYear,2024);
 }finally{await db.collectionBugOccurrence.deleteMany({where:{report:{feature}}});await db.collectionBugReport.deleteMany({where:{feature}});if(runId)await db.collectorRun.delete({where:{id:runId}});if(id){await db.periodValuation.deleteMany({where:{securityId:id}});await db.dartFinancialFiling.deleteMany({where:{securityId:id}});await db.security.delete({where:{id}});}await db.$disconnect();}
});
test('DART call reservations stop atomically at the daily cap even with matched-row semantics',async()=>{
 const now=new Date('2099-03-01T12:00:00Z'),usageDate=new Date('2099-03-01T00:00:00Z'),repo=new PrismaDartRepository(db);
 try{await db.dartApiDailyUsage.deleteMany({where:{usageDate}});await repo.setState({lastError:null});const results=await Promise.all(Array.from({length:12},()=>repo.reserveApiCall(2,now)));assert.equal(results.filter(Boolean).length,2);assert.equal((await db.dartApiDailyUsage.findUniqueOrThrow({where:{usageDate}})).apiCallCount,2);assert.equal(await repo.reserveApiCall(2,now),false);}finally{await db.dartApiDailyUsage.deleteMany({where:{usageDate}});await db.$disconnect();}
});
test('reconciliation resolves only repaired targets, counts repeated attempts once and preserves history',async()=>{
 const suffix=String(Date.now()),feature='reconcile-test-'+suffix,app=buildApp(),securities:bigint[]=[];
 try{
  for(const n of [1,2])securities.push((await db.security.create({data:{symbol:'TEST'+suffix.slice(-5)+n,name:'검증용',marketType:'KOSPI'}})).id);
  for(const [index,id] of securities.entries())await db.periodValuation.create({data:{securityId:id,fiscalYear:2025,periodType:'ANNUAL',status:'PARTIAL',values:{per:index===0?'10':null,eps:'1'},reasons:{},provenance:{},supplemental:{collectionAttempt:{at:new Date().toISOString(),source:'TEST'}}}});
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

test('content-correction reports resolve only after matching public-source proof, keeping history',async()=>{
 const feature='public-correction-'+Date.now(),receipt='20990203000001',at=new Date(Date.now()-60000);let id:bigint|undefined;
 try{
  id=(await db.security.create({data:{symbol:'P'+String(Date.now()).slice(-5),name:'정정 공시 검증',marketType:'KOSPI'}})).id;
  const duration={method:'DART_PUBLIC_FILING_ACCOUNTS_MATCH',receiptNo:receipt,fsDivision:'OFS',start:'2024-01-01',end:'2024-12-31',months:12,sourceUrl:'https://dart.fss.or.kr/report/viewer.do?rcpNo='+receipt,contentSha256:'a'.repeat(64),verifiedAt:new Date().toISOString()};
  await db.dartFinancialFiling.create({data:{securityId:id,fiscalYear:2024,periodType:'ANNUAL',reportCode:'11011',fsDivision:'OFS',receiptNo:receipt,reportName:'[기재정정]사업보고서 (2024.12)',periodEndDate:new Date('2024-12-31'),receiptDate:new Date('2025-03-31'),collectedAt:new Date()}});
  await db.periodValuation.create({data:{securityId:id,fiscalYear:2024,periodType:'ANNUAL',status:'PARTIAL',values:{roe:'10'},reasons:{},provenance:{receiptNo:receipt,periodEnd:'2024-12-31'},supplemental:{fiscalDuration:duration}}});
  await saveBugEvent(db,{sourceKey:feature,feature,code:'DART_REVIEW_CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION',severity:'WARNING',summary:'정정 검증',observedAt:at,securityId:id,fiscalYear:2024,periodType:'ANNUAL'});
  await reconcileBugReportsPage(db);assert.equal(await db.collectionBugOccurrence.count({where:{report:{feature},resolvedAt:null}}),1,'a fresh valuation without public source proof is not enough');
  await db.dartFinancialFiling.update({where:{receiptNo:receipt},data:{sourceValidation:{publicDocument:{method:'DART_PUBLIC_STATEMENT_BALANCE_RECONCILED',fiscalDuration:duration}}}});
  await reconcileBugReportsPage(db);const occurrence=await db.collectionBugOccurrence.findFirstOrThrow({where:{report:{feature}}});assert.equal(occurrence.resolution,'PUBLIC_DISCLOSURE_VERIFIED');assert.equal((await db.collectionBugReport.findFirstOrThrow({where:{feature}})).state,'RESOLVED');assert.equal(await db.collectionBugOccurrence.count({where:{report:{feature}}}),1,'history retained');
 }finally{await db.collectionBugOccurrence.deleteMany({where:{report:{feature}}});await db.collectionBugReport.deleteMany({where:{feature}});if(id){await db.periodValuation.deleteMany({where:{securityId:id}});await db.dartFinancialFiling.deleteMany({where:{securityId:id}});await db.security.delete({where:{id}});}await db.$disconnect();}
});

test('held products exclude financial absence warnings, preserve history and real failures',async()=>{
 const feature='dart-financial-statements',prefix='held-test-'+Date.now();let id:bigint|undefined;
 try{
  id=(await db.security.create({data:{symbol:'H'+String(Date.now()).slice(-5),name:'상품 보류 검증',marketType:'KOSPI',securityType:'STOCK'}})).id;
  const event={sourceKey:prefix,feature,code:'PERIOD_ROE_MISSING',severity:'WARNING' as const,summary:'검증',observedAt:new Date(),securityId:id,fiscalYear:2020,periodType:'Q3'};
  assert.equal(await saveBugEvent(db,event),true);
  await db.security.update({where:{id},data:{securityType:'REIT'}});
  const {reconcileHeldProductReportsPage}=await import('../src/domain/collection-bug-reports.js');
  let cursor:string|undefined;do{const page=await reconcileHeldProductReportsPage(db,cursor);cursor=page.hasNext?page.cursor:undefined;}while(cursor);
  const old=await db.collectionBugOccurrence.findUniqueOrThrow({where:{eventKey:createHash('sha256').update(prefix).digest('hex')}});
  assert.equal(old.resolution,'PRODUCT_FINANCIAL_HOLD');assert.ok(old.resolvedAt);
  assert.equal(await saveBugEvent(db,{...event,sourceKey:prefix+'new'}),false);
  assert.equal(await saveBugEvent(db,{...event,sourceKey:prefix+'db',code:'DATABASE_ERROR',severity:'ERROR'}),true);
  assert.equal(await saveBugEvent(db,{...event,sourceKey:prefix+'price',feature:'market-prices',code:'KIS_PRICE_NO_DATA'}),true);
  await db.security.update({where:{id},data:{securityType:'STOCK'}});
  assert.equal(await saveBugEvent(db,{...event,sourceKey:prefix+'stock'}),true,'ordinary companies are still reported');
 }finally{if(id){const reports=await db.collectionBugOccurrence.findMany({where:{securityId:id},select:{reportId:true}});await db.collectionBugOccurrence.deleteMany({where:{securityId:id}});for(const r of reports)if(r.reportId&&!await db.collectionBugOccurrence.count({where:{reportId:r.reportId}}))await db.collectionBugReport.deleteMany({where:{id:r.reportId}});await db.security.delete({where:{id}});}await db.$disconnect();}
});

test('exact source context coalesces legacy duplicates; reviewed pre-listing closes are inapplicable',async()=>{
 const feature='dart-financial-statements',prefix='context-test-'+Date.now();let id:bigint|undefined,runId:bigint|undefined;
 try{
  id=(await db.security.create({data:{symbol:'C'+String(Date.now()).slice(-5),name:'기간 검증',marketType:'KOSPI'}})).id;
  runId=(await db.collectorRun.create({data:{jobType:feature,provider:'TEST',status:'FAILED'}})).id;
  const item=await db.collectorRunItem.create({data:{runId,securityId:id,symbol:'005930:2020:ANNUAL',status:'FAILED',message:'MANUAL_COLLECTION_ERROR'}});
  const sourceKey='item:'+item.id+':'+item.createdAt.toISOString();
  await saveBugEvent(db,{sourceKey,feature,code:'MANUAL_COLLECTION_ERROR',severity:'ERROR',summary:'검증',securityId:id,runId,observedAt:item.createdAt});
  const {repairFinancialOccurrencePeriodsPage,periodBugEvents}=await import('../src/domain/collection-bug-reports.js');
  await repairFinancialOccurrencePeriodsPage(db);const old=await db.collectionBugOccurrence.findUniqueOrThrow({where:{eventKey:createHash('sha256').update(sourceKey).digest('hex')}});assert.equal(old.fiscalYear,2020);assert.equal(old.periodType,'ANNUAL');assert.equal(old.resolvedAt,null,'context repair must not claim an error fixed');assert.equal((await repairFinancialOccurrencePeriodsPage(db)).changed,0);
  const receipt='20990203000002',symbol='387690',periodEnd='2026-06-30';
  const row=await db.periodValuation.create({data:{securityId:id,fiscalYear:2026,periodType:'Q2',collectionSymbol:symbol,status:'PARTIAL',values:{eps:'100',bps:'200',roe:'10',per:null,pbr:null},reasons:{},provenance:{receiptNo:receipt,periodEnd},supplemental:{collectionAttempt:{at:new Date().toISOString()},errors:{priceCode:'KIS_PRICE_NO_DATA'}}}});
  for(const event of periodBugEvents(row))await saveBugEvent(db,{...event,sourceKey:prefix+event.metric});
  assert.equal(await db.collectionBugOccurrence.count({where:{securityId:id,metric:{in:['per','pbr']},resolvedAt:null}}),2);
  const proof={method:'REVIEWED_PRE_LISTING_NO_MARKET_CLOSE',symbol,receiptNo:receipt,periodEnd,listingDate:'2026-07-13',sourceUrls:['https://www.yna.co.kr/view/example','https://www.mt.co.kr/stock/example'],verifiedAt:new Date().toISOString()};
  const updated=await db.periodValuation.update({where:{securityId_fiscalYear_periodType:{securityId:id,fiscalYear:2026,periodType:'Q2'}},data:{supplemental:{...row.supplemental as object,priceAvailability:proof}}});
  assert.deepEqual(periodBugEvents(updated),[],'known absent IPO-period prices do not recur');
  await reconcileBugReportsPage(db);assert.equal(await db.collectionBugOccurrence.count({where:{securityId:id,resolution:'PRICE_PERIOD_PRE_LISTING'}}),2);assert.equal((await db.periodValuation.findUniqueOrThrow({where:{securityId_fiscalYear_periodType:{securityId:id,fiscalYear:2026,periodType:'Q2'}}})).values.per,null,'no invented price or ratio');
 }finally{if(id){const reports=await db.collectionBugOccurrence.findMany({where:{securityId:id},select:{reportId:true}});await db.collectionBugOccurrence.deleteMany({where:{securityId:id}});for(const r of reports)if(r.reportId&&!await db.collectionBugOccurrence.count({where:{reportId:r.reportId}}))await db.collectionBugReport.deleteMany({where:{id:r.reportId}});await db.periodValuation.deleteMany({where:{securityId:id}});if(runId)await db.collectorRun.delete({where:{id:runId}});await db.security.delete({where:{id}});}await db.$disconnect();}
});
