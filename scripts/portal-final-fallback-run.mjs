import {parse} from 'dotenv';
if(process.env.DATABASE_URL) process.env.DATABASE_URL=parse('V='+process.env.DATABASE_URL).V;
import {PrismaClient,Prisma} from '../shared/dist/generated/prisma/index.js';
import {PrismaDartRepository} from '../collector/dist/dart-repository.js';
import {collectionClient} from '../shared/dist/lib/collection-client.js';
import {withFinancialLease} from '../shared/dist/collection/financial-lease.js';
import {withCollection,exclusionReason} from '../shared/dist/collection/collection-policy.js';
import {valueCompletion} from '../shared/dist/domain/collection-status.js';
import {temporaryDartHistory} from '../shared/dist/collection/dart-backfill.js';
import {planFinalFallback} from './final-valuation-fallback.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
const arg=k=>process.argv[process.argv.indexOf(k)+1],dir=arg('--state'),inputPath=arg('--input');
if(!process.argv.includes('--state')||!process.argv.includes('--input'))throw Error('REQUIRES_PRIVATE_INPUT_AND_STATE');
const db=collectionClient(new PrismaClient()),repo=new PrismaDartRepository(db),owner=randomUUID(),apply=process.argv.includes('--apply');
const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x),clean=v=>JSON.parse(json(v)),sort=v=>Array.isArray(v)?v.map(sort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,sort(v[k])])):v,hash=v=>createHash('sha256').update(json(sort(clean(v)))).digest('hex');
const save=(name,v)=>writeFile(dir+'/'+name,json(v),{mode:0o600});
let locked=false;
try{
 await mkdir(dir,{recursive:true,mode:0o700});
 const input=JSON.parse(await readFile(inputPath,'utf8'));
 let completed;try{completed=JSON.parse(await readFile(dir+'/result.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(completed?.done){const original=JSON.parse(await readFile(dir+'/plan.json','utf8'));if(original.inputHash!==hash(input)||completed.planHash!==hash(original))throw Error('COMPLETED_SCOPE_CHANGED');console.log(json({alreadyCompleted:true,summary:completed.summary}));process.exitCode=0;}
 else {
 if(input.year!==2025||input.targets.length!==77||new Set(input.targets.map(t=>t.symbol)).size!==77)throw Error('FIXED_SCOPE_REQUIRED');
 if(!temporaryDartHistory(await db.dartCollectorState.findUnique({where:{id:1}})))throw Error('HISTORICAL_ONLY_POLICY_REQUIRED');
 const compute=async(t,client)=>{
  const s=await client.security.findUniqueOrThrow({where:{symbol:t.symbol}});
  if(exclusionReason(s,'valuation')||exclusionReason(s,'dart-financial-statements'))return {symbol:t.symbol,held:{all:'SECURITY_EXCLUDED'},patch:{}};
  const old=await client.periodValuation.findUniqueOrThrow({where:{securityId_fiscalYear_periodType:{securityId:s.id,fiscalYear:input.year,periodType:'ANNUAL'}}});
  const task=await client.dartBackfillTask.findFirst({where:{securityId:s.id,fiscalYear:input.year,periodType:'ANNUAL'}});
  if(task?.status!=='SUCCESS')return {symbol:t.symbol,held:{all:'PERIOD_NOT_ELIGIBLE'},patch:{}};
  const filing=await client.dartFinancialFiling.findFirst({where:{securityId:s.id,fiscalYear:input.year,periodType:'ANNUAL',receiptNo:old.provenance?.receiptNo,isWithdrawn:false}});
  const result=planFinalFallback({security:s,current:old,filing,snapshot:t.snapshot,Decimal:Prisma.Decimal,allowReviewedExclusion:t.manualReviewedOverride===true,revenueAliasReviewed:t.revenueAliasReviewed===true});
  for(const k of Object.keys(result.patch))if(!t.fields.includes(k))throw Error('FIELD_ALLOWLIST');
  return {symbol:s.symbol,id:String(s.id),revision:s.collectionRevision,old,beforeHash:hash(old),filingHash:hash(filing),...result};
 };
 const ids=await db.security.findMany({where:{symbol:{in:input.targets.map(t=>t.symbol)}},select:{id:true}});
 const outsideSql="SELECT security_id,fiscal_year,period_type,SHA2(CONCAT_WS(CHAR(31),COALESCE(CAST(`values` AS CHAR),'NULL'),COALESCE(CAST(provenance AS CHAR),'NULL'),COALESCE(CAST(supplemental AS CHAR),'NULL'),status,COALESCE(CAST(reasons AS CHAR),'NULL')),256) AS h FROM period_valuations WHERE NOT(fiscal_year=2025 AND period_type='ANNUAL' AND security_id IN ("+ids.map(s=>s.id).join(',')+")) ORDER BY security_id,fiscal_year,period_type";
 const checks=async()=>({outside:hash(await db.$queryRawUnsafe(outsideSql)),tables:await db.$queryRawUnsafe('CHECKSUM TABLE dart_financial_filings,financial_statements,accounts,buy_trades,sell_trades')});
 if(!apply){
  const rows=[];for(const t of input.targets)rows.push(await compute(t,db));
  const plan={at:new Date(),inputHash:hash(input),rows,summary:{periods:rows.filter(r=>Object.keys(r.patch).length).length,fields:rows.reduce((n,r)=>n+Object.keys(r.patch).length,0)}};
  await save('plan.json',plan);await writeFile(dir+'/plan.sha256',hash(plan),{mode:0o600});console.log(json({apply:false,summary:plan.summary}));
 }else{
  const plan=JSON.parse(await readFile(dir+'/plan.json','utf8'));
  if(hash(plan)!==(await readFile(dir+'/plan.sha256','utf8')).trim()||plan.inputHash!==hash(input))throw Error('PLAN_CHANGED');
  locked=await repo.acquireLock(owner,90);if(!locked)throw Error('FINANCIAL_LEASE_BUSY');
  await withFinancialLease(owner,async()=>{
   const pre=await checks();await save('prechecks.json',pre);const rows=[];
   for(const r of plan.rows){
    await repo.renewFinancialLease(owner);
    if(!Object.keys(r.patch).length)continue;
    const done=await withCollection(db,BigInt(r.id),'valuation',()=>db.$transaction(async tx=>{
     const t=input.targets.find(t=>t.symbol===r.symbol),fresh=await compute(t,tx);
     if(fresh.old?.provenance?.portalFinalFallback?.planHash===hash(plan))return{symbol:r.symbol,already:true,fields:[]};
     if(fresh.beforeHash!==r.beforeHash||fresh.filingHash!==r.filingHash||hash(fresh.patch)!==hash(r.patch))throw Error('LATEST_STATE_CHANGED:'+r.symbol);
     const old=fresh.old,values={...old.values,...r.patch},completion=valueCompletion(values,'KRW');
     for(const[k,v]of Object.entries(old.values))if(v!=null&&values[k]!==v)throw Error('EXISTING_VALUE_CHANGED');
     const reasons={...old.reasons,...completion.notApplicable};for(const[k,v]of Object.entries(values))if(v!=null)delete reasons[k];
     await save(r.symbol+'-before.json',old);
     const next=await tx.periodValuation.update({where:{securityId_fiscalYear_periodType:{securityId:BigInt(r.id),fiscalYear:2025,periodType:'ANNUAL'}},data:{values,provenance:clean({...old.provenance,perMetric:{...old.provenance?.perMetric,...r.evidence},portalFinalFallback:{at:new Date(),planHash:hash(plan),fields:Object.keys(r.patch),manualReviewedOverride:t.manualReviewedOverride===true}}),reasons,status:completion.complete?'SUCCESS':'PARTIAL',attempts:old.attempts+1,nextAttemptAt:completion.complete?null:old.nextAttemptAt}});
     await save(r.symbol+'-after.json',next);return{symbol:r.symbol,fields:Object.keys(r.patch),referenceBps:r.patch.bps!=null};
    }),{symbol:r.symbol,collectionRevision:r.revision});
    rows.push(done);await save('checkpoint.json',{rows});
   }
   const after=await checks();if(hash(pre)!==hash(after))throw Error('UNRELATED_DATA_CHANGED');
   let preserved=0;for(const r of plan.rows){if(!r.old)continue;const now=await db.periodValuation.findUniqueOrThrow({where:{securityId_fiscalYear_periodType:{securityId:BigInt(r.id),fiscalYear:2025,periodType:'ANNUAL'}}});for(const[k,v]of Object.entries(r.old.values))if(v!=null){if(now.values[k]!==v)throw Error('PRESERVED_VALUE_CHANGED');preserved++;}if(hash(r.old.supplemental)!==hash(now.supplemental))throw Error('SUPPLEMENTAL_CHANGED');}
   const out={done:true,at:new Date(),planHash:hash(plan),rows,summary:{periods:rows.filter(r=>r.fields.length).length,fields:rows.reduce((n,r)=>n+r.fields.length,0),byMetric:Object.fromEntries(['eps','bps','roe','per','pbr'].map(k=>[k,rows.filter(r=>r.fields.includes(k)).length]))},verification:{outsideTargetUnchanged:true,financialAndPersonalTablesUnchanged:true,existingValuesPreserved:preserved,supplementalAndExclusionsUnchanged:true}};
   await save('result.json',out);console.log(json(out));
  });
 }
 }
}finally{if(locked)await repo.releaseLock(owner);await db.$disconnect();}
