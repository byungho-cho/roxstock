import test from 'node:test';import assert from 'node:assert/strict';
import {PrismaClient} from '@roxstock/shared/prisma';
import {prisma,securityDataReadSnapshot} from '@roxstock/shared/lib/prisma';
import {securityWorkKey,securityAggregationVersion} from '@roxstock/shared/domain/security-data-aggregation';
import {completedQuarters} from '@roxstock/shared/domain/security-data';
import {buildApp} from '../src/app.js';
import {passwordHash,randomToken} from '../src/auth/crypto.js';
test('security data: real sessions, optimistic single-field edits, manual protection, audit, public/cache consistency, rollback and durable receipt checkpoint',async()=>{
 const url=new URL(process.env.DATABASE_URL!);assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Isolated DB only');
 process.env.AUTH_PUBLIC_ORIGIN='http://127.0.0.1:3000';const raw=new PrismaClient(),app=buildApp(),suffix=randomToken().slice(0,8),password='Aa12'+randomToken().replace(/[^A-Za-z0-9]/g,'').slice(0,12),hash=await passwordHash(password);
 const users=await Promise.all(['ADMIN','USER'].map(role=>raw.authUser.create({data:{email:`security-data-${suffix}-${role}@example.invalid`,passwordHash:hash,verifiedAt:new Date(),role:role as any}})));
 const security=await raw.security.create({data:{symbol:'T33001',name:'Security data isolated '+suffix,marketType:'KOSPI',securityType:'STOCK'}}),q=completedQuarters().at(-1)!,period=q.periodType as 'ANNUAL'|'Q1'|'Q2'|'Q3',end=new Date(Date.UTC(q.year,q.quarter*3,0));
 let monitorRun:bigint|undefined;
 const path=`/api/security-data/quarters/${q.year}/${q.quarter}/${security.id}`;
 const login=async(user:typeof users[number])=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:process.env.AUTH_PUBLIC_ORIGIN},payload:{email:user.email,password}});assert.equal(r.statusCode,200,r.body);const cookie=(r.headers['set-cookie'] as string[]).map(v=>v.split(';')[0]).join('; ');return {cookie,origin:process.env.AUTH_PUBLIC_ORIGIN!,'x-csrf-token':/rox_csrf=([^;]+)/.exec(cookie)![1]!};};
 try{
  assert.equal((await app.inject(path)).statusCode,401);const admin=await login(users[0]!),user=await login(users[1]!);
  assert.equal((await app.inject({url:path,headers:user})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/pages/read',headers:user,payload:{paths:['/security-data/quarters']}})).statusCode,400);
  const statePath=`/api/security-data/quarters/${q.year}/${q.quarter}`;
  await raw.dartFinancialFiling.create({data:{securityId:security.id,collectionSymbol:'999999',fiscalYear:q.year,periodType:period,reportCode:q.quarter===4?'11011':q.quarter===1?'11013':q.quarter===2?'11012':'11014',fsDivision:'CFS',receiptNo:'20991231999996',reportName:'Isolated namespace mismatch',periodEndDate:end,receiptDate:new Date(),collectedAt:new Date()}});
  const namespace=await securityDataReadSnapshot(view=>view.security.findMany({where:{id:security.id},include:{dartFinancialFilings:true}}));assert.equal(namespace[0]!.dartFinancialFilings.length,0);
  await raw.dartFinancialFiling.deleteMany({where:{securityId:security.id,receiptNo:'20991231999996'}});
  // Read-only snapshots must not queue behind the financial writer fence.
  let acquired!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>{acquired=r;}),writerHold=new Promise<void>(r=>{release=r;});
  const writer=raw.$transaction(async tx=>{await tx.$queryRaw`SELECT revision FROM analysis_revisions WHERE \`key\`='financial' FOR UPDATE`;acquired();await writerHold;},{timeout:15000});
  await ready;let readTimer:ReturnType<typeof setTimeout>|undefined;
  try{const overview=await Promise.race([app.inject({url:'/api/security-data/quarters',headers:admin}),new Promise<never>((_,reject)=>{readTimer=setTimeout(()=>reject(Error('READ_BLOCKED_BY_WRITER')),5000);})]);assert.equal(overview.statusCode,200,overview.body);assert.equal(overview.json().data.quarters.length,4);}finally{if(readTimer)clearTimeout(readTimer);release();await writer;}
  await assert.rejects(securityDataReadSnapshot(async view=>{assert.deepEqual(Object.keys(view).sort(),['security','securityDataReceipt']);await (view.security as any).update({where:{id:security.id},data:{name:'MUST_NOT_WRITE'}});}),TypeError);
  assert.notEqual((await raw.security.findUniqueOrThrow({where:{id:security.id}})).name,'MUST_NOT_WRITE');
  const concurrent=await Promise.all(Array.from({length:6},()=>app.inject({url:'/api/security-data/quarters',headers:admin})));assert.ok(concurrent.every(r=>r.statusCode===200));assert.equal(new Set(concurrent.map(r=>r.json().data.snapshotId)).size,1);
  const enabled=process.env.SECURITY_DATA_COLLECTION_ENABLED;
  const receiptCount=await raw.securityDataReceipt.count();
  try{
   process.env.SECURITY_DATA_COLLECTION_ENABLED='false';
   const stopped=(await app.inject({url:statePath,headers:admin})).json().data;
   process.env.SECURITY_DATA_COLLECTION_ENABLED='true';
   const running=(await app.inject({url:statePath,headers:admin})).json().data;
   const {asOf:offAt,aggregatedAt:offAggregate,...offState}=stopped,{asOf:onAt,aggregatedAt:onAggregate,...onState}=running;assert.deepEqual(offState,onState);
   const missing=stopped.items.find((r:any)=>r.id===String(security.id));
   assert.equal(missing.state,'DISCLOSURE_UNVERIFIED');assert.ok(missing.missingFinancial.includes('revenueYtd'));
   assert.equal(await raw.securityDataReceipt.count(),receiptCount);
  }finally{if(enabled===undefined)delete process.env.SECURITY_DATA_COLLECTION_ENABLED;else process.env.SECURITY_DATA_COLLECTION_ENABLED=enabled;}
  let detail=(await app.inject({url:path,headers:admin})).json().data;assert.equal(detail.fields.length,26);assert.equal(detail.basis,null);
  const basis={receiptNo:null,fsDivision:'CFS',periodStart:`${q.year}-01-01`,periodEnd:end.toISOString().slice(0,10),currency:'KRW',amountMultiplier:'1',shareClass:'COMMON',kind:'ACTUAL'};
  const patch=(field:string,value:string,expectedValue:unknown,b=detail.basis??basis)=>app.inject({method:'PATCH',url:path,headers:admin,payload:{field,value,expectedValue,basis:b}});
  assert.equal((await patch('eps','1',null)).statusCode,409);
  assert.equal((await app.inject({method:'PUT',url:path+'/basis',headers:user,payload:{fsDivision:'CFS'}})).statusCode,403);
  assert.equal((await app.inject({method:'PUT',url:path+'/basis',headers:admin,payload:{fsDivision:'INVALID'}})).statusCode,400);
  const setup=await app.inject({method:'PUT',url:path+'/basis',headers:admin,payload:{fsDivision:'CFS'}});assert.equal(setup.statusCode,200,setup.body);detail=setup.json().data;
  assert.equal((await app.inject({method:'PUT',url:path+'/basis',headers:admin,payload:{fsDivision:'CFS'}})).statusCode,200);
  assert.equal((await app.inject({method:'PUT',url:path+'/basis',headers:admin,payload:{fsDivision:'OFS'}})).statusCode,409);
  assert.equal((await app.inject({url:path.replace('/'+q.quarter+'/', '/'+(q.quarter===1?2:1)+'/'),headers:admin})).json().data.basis,null);
  const edit=await patch('revenueQuarter','0',null);assert.equal(edit.statusCode,200,edit.body);detail=edit.json().data;assert.equal(detail.fields.find((f:any)=>f.key==='revenueQuarter').value,'0');
  assert.equal((await raw.securityDataEdit.count({where:{securityId:security.id}})),2);
  assert.equal((await patch('marketCap','12',null)).statusCode,400);
  assert.equal((await patch('revenueQuarter','100',null)).statusCode,409);
  const second=await patch('revenueQuarter','12','0');assert.equal(second.statusCode,200,second.body);
  const key={securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:q.year,periodType:period}};
  await prisma.periodValuation.update({where:key,data:{values:{eps:'10'},supplemental:{accounts:{receiptNo:'not-an-edit'}}}});
  detail=(await app.inject({url:path,headers:admin})).json().data;assert.equal(detail.fields.find((f:any)=>f.key==='revenueQuarter').value,'12');
  const publicRead=await app.inject({url:`/api/financial-statements/${security.id}?startYear=${q.year}&endYear=${q.year}&period=${period}`,headers:admin});assert.equal(publicRead.statusCode,200,publicRead.body);
  assert.equal(publicRead.json().data.rows[0].values.revenue,period==='ANNUAL'?null:'12');
  const baseline=(await app.inject({url:statePath,headers:admin})).json().data;
  for(const [field,value]of Object.entries({revenueYtd:'10',operatingProfitYtd:'2',netIncomeYtd:'1',totalAssets:'40',totalLiabilities:'20',totalEquity:'20',eps:'-1',bps:'100',roe:'1',pbr:'1'})){
   detail=(await app.inject({url:path,headers:admin})).json().data;const prior=detail.fields.find((f:any)=>f.key===field).value;
   const saved=await patch(field,value,prior);assert.equal(saved.statusCode,200,saved.body);
  }
  const full=(await app.inject({url:statePath,headers:admin})).json().data;assert.equal(full.items.some((i:any)=>i.id===String(security.id)),false);assert.equal(full.complete,baseline.complete+1);
  assert.equal((await app.inject({url:statePath+'?offset=50&snapshot='+baseline.snapshotId,headers:admin})).statusCode,409);
  for(const filter of ['','financial','value']){const card=(await app.inject({url:'/api/security-data/quarters?filter='+filter,headers:admin})).json().data.quarters.find((r:any)=>r.year===q.year&&r.quarter===q.quarter),list=(await app.inject({url:statePath+'?filter='+filter,headers:admin})).json().data;assert.equal(card.missing,list.total);assert.equal(card.snapshotId,list.snapshotId);}
  const originalValues=await raw.periodValuation.findUniqueOrThrow({where:key});
  const held=await raw.dartBackfillTask.create({data:{securityId:security.id,fiscalYear:q.year,periodType:period,reportCode:q.quarter===4?'11011':q.quarter===1?'11013':q.quarter===2?'11012':'11014',status:'NOT_APPLICABLE',errorCode:'REVIEW_REQUIRED',diagnostics:{reason:'Unknown eligibility'}}});
  const unknown=(await app.inject({url:statePath,headers:admin})).json().data;assert.equal(unknown.target,full.target);
  await raw.dartBackfillTask.update({where:{id:held.id},data:{status:'EXCLUDED',errorCode:'USER_PERIOD_EXCLUDED',diagnostics:{policyEvidence:{decision:'ISOLATED_APPROVED_PERIOD_EXCLUSION'},policyVersion:'TEST_V1'}}});
  const excluded=(await app.inject({url:statePath,headers:admin})).json().data;assert.equal(excluded.target,full.target-1);assert.equal(excluded.excluded,full.excluded+1);assert.equal(excluded.complete,full.complete-1);
  assert.deepEqual((await raw.periodValuation.findUniqueOrThrow({where:key})).values,originalValues.values);
  await raw.dartBackfillTask.update({where:{id:held.id},data:{status:'NOT_DUE',errorCode:'FILING_NOT_DUE',diagnostics:{periodEnd:(new Date(Date.now()+86400000*100)).toISOString().slice(0,10),closingMonth:3,monthEvidence:'OFFICIAL_FISCAL_END',minimumSubmissionDays:45}}});
  const waiting=(await app.inject({url:statePath,headers:admin})).json().data;assert.equal(waiting.waiting,full.waiting+1);assert.equal(waiting.target,full.target-1);
  const beforeForeign=(await raw.periodValuation.findUniqueOrThrow({where:key})).supplemental;
  await raw.dartFinancialFiling.create({data:{securityId:security.id,fiscalYear:q.year,periodType:period,reportCode:held.reportCode,fsDivision:'CFS',receiptNo:'20991231999997',reportName:'Isolated USD report',periodEndDate:end,receiptDate:new Date(),collectedAt:new Date(),sourceValidation:{currency:'USD'}}});
  const foreign=(await app.inject({url:path,headers:admin})).json().data;assert.ok(foreign.basisSetup.blockedReason);assert.equal(foreign.basisSetup.needed,false);assert.equal(foreign.fields.some((f:any)=>f.editable),false);
  assert.equal((await app.inject({method:'PUT',url:path+'/basis',headers:admin,payload:{fsDivision:'CFS'}})).statusCode,409);assert.deepEqual((await raw.periodValuation.findUniqueOrThrow({where:key})).supplemental,beforeForeign);
  await raw.dartFinancialFiling.deleteMany({where:{securityId:security.id,receiptNo:'20991231999997'}});
  const historyBefore=await raw.securityDataEdit.count({where:{securityId:security.id}});
  assert.equal((await app.inject({method:'PATCH',url:path,headers:{...admin,'x-csrf-token':'wrong'},payload:{field:'eps',value:'5',expectedValue:null,basis}})).statusCode,403);
  assert.equal(await raw.securityDataEdit.count({where:{securityId:security.id}}),historyBefore);
  const workItems=['SUCCESS','PARTIAL'].map((state,i)=>{const w={receiptNo:'20991231999999',securityId:String(i+1),reportPeriod:'2026.06',divisionPolicy:'CFS_THEN_OFS',state};return {...w,key:securityWorkKey(w)};});
  monitorRun=(await raw.collectorRun.create({data:{jobType:'dart-financial-statements',provider:'ISOLATED_FIXTURE',status:'PARTIAL',finishedAt:new Date(),metadata:{phase:'SECURITY_DATA',aggregationVersion:securityAggregationVersion,workItems,discovery:{status:'COMPLETE',found:1,created:1,completedAt:new Date().toISOString()}}}})).id;
  const projection=(await app.inject({url:'/api/security-data/status',headers:admin})).json().data.aggregation;assert.equal(projection.discoveredReceipts,1);assert.equal(projection.counts.target,2);assert.equal(projection.counts.partial,1);assert.equal(projection.counts.rate,50);
  const summary=(await app.inject({url:'/api/collection/monitoring',headers:admin})).json().data.features.find((f:any)=>f.id==='dart-financial-statements');assert.deepEqual(summary.securityData.counts,projection.counts);
  const runs=(await app.inject({url:'/api/collection/monitoring/dart-financial-statements/runs?phase=SECURITY_DATA',headers:admin})).json().data.rows;assert.equal(runs.find((r:any)=>r.id===String(monitorRun)).securityProcessing.counts.target,2);
  await raw.collectorRunItem.create({data:{runId:monitorRun,securityId:security.id,symbol:security.symbol,status:'NO_DATA',message:'부분수집',diagnostics:{phase:'SECURITY_DATA',outcome:'UNRESOLVED',partial:true,financialStored:true,fiscalYear:q.year,periodType:period,receiptNo:'20991231999999',secret:'must-not-leak'}}});
  const monitor=await app.inject({url:`/api/collection/monitoring/dart-financial-statements/items?phase=SECURITY_DATA&runId=${monitorRun}`,headers:admin});assert.equal(monitor.statusCode,200,monitor.body);assert.equal(monitor.json().data.rows.length,1);assert.equal(monitor.json().data.rows[0].securityData.outcome,'UNRESOLVED');assert.equal(monitor.json().data.rows[0].securityData.partial,true);assert.equal(monitor.body.includes('must-not-leak'),false);
  // A failed receipt transaction cannot advance the discovery checkpoint or leave half the inbox.
  const receipt='20991231999999',previous=await raw.securityDataCursor.findUnique({where:{id:1}});
  await assert.rejects(raw.$transaction(async tx=>{await tx.securityDataReceipt.create({data:{receiptNo:receipt,corpCode:'99999999',disclosedDate:'20991231',report:{}}});await tx.securityDataCursor.upsert({where:{id:1},create:{id:1,fromDate:'20991230',throughDate:'20991231',page:2,nextCheckAt:new Date()},update:{page:999}});throw Error('injected-after-page-save');}));
  assert.equal(await raw.securityDataReceipt.findUnique({where:{receiptNo:receipt}}),null);assert.deepEqual(await raw.securityDataCursor.findUnique({where:{id:1}}),previous);
  await raw.securityDataReceipt.createMany({data:[{receiptNo:receipt,corpCode:'99999999',disclosedDate:'20991231',report:{}}],skipDuplicates:true});await raw.securityDataReceipt.createMany({data:[{receiptNo:receipt,corpCode:'99999999',disclosedDate:'20991231',report:{}}],skipDuplicates:true});assert.equal(await raw.securityDataReceipt.count({where:{receiptNo:receipt}}),1);
  const restarted=buildApp();try{assert.equal((await restarted.inject({url:path,headers:admin})).json().data.fields.find((f:any)=>f.key==='revenueQuarter').value,'12');}finally{await restarted.close();}
 }finally{
  if(monitorRun){await raw.collectorRunItem.deleteMany({where:{runId:monitorRun}});await raw.collectorRun.delete({where:{id:monitorRun}});}
  await raw.securityDataReceipt.deleteMany({where:{receiptNo:'20991231999999'}});await raw.dartFinancialFiling.deleteMany({where:{securityId:security.id}});await raw.dartTaskDecision.deleteMany({where:{task:{securityId:security.id}}});await raw.dartBackfillTask.deleteMany({where:{securityId:security.id}});await raw.securityDataEdit.deleteMany({where:{securityId:security.id}});await raw.periodValuation.deleteMany({where:{securityId:security.id}});await raw.analysisRevision.deleteMany({where:{key:'security:'+security.id}});await raw.security.delete({where:{id:security.id}});
  await raw.authSession.deleteMany({where:{userId:{in:users.map(u=>u.id)}}});await raw.authUser.deleteMany({where:{id:{in:users.map(u=>u.id)}}});await app.close();await raw.$disconnect();await prisma.$disconnect();
 }
});
