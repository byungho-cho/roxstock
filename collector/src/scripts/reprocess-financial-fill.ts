import 'dotenv/config';
import {parse} from 'dotenv';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Prisma,PrismaClient} from '@roxstock/shared/prisma';
import {collectionClient} from '@roxstock/shared/lib/collection-client';
import {withCollection} from '@roxstock/shared/collection/collection-policy';
import {withFinancialLease} from '@roxstock/shared/collection/financial-lease';
import {PrismaDartRepository} from '../dart-repository.js';
import {parseFillTargets,planFinancialFill,fingerprint,fieldPlanFingerprint,json,reviveModel,fillFields,type FillEvidence,type FillState} from '../financial-fill-plan.js';

// No network provider is created: this campaign reuses reviewed private evidence, API budget = 0.
const args=process.argv.slice(2),flags=new Set(['--apply','--rollback']);
const allowed=new Set(['csv','evidence','snapshot','out','plan','symbols','fields','batch','journal']);
for(const a of args)if(!flags.has(a)&&(!/^--[^=]+=.+$/.test(a)||!allowed.has(a.slice(2,a.indexOf('=')))))throw Error('UNKNOWN_ARGUMENT');
const arg=(key:string)=>args.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3);
const required=(key:string)=>{const value=arg(key);if(!value)throw Error('REQUIRED:--'+key);return value;};
const apply=args.includes('--apply'),rollback=args.includes('--rollback');
if(apply&&rollback||((apply||rollback)&&arg('snapshot')))throw Error('INVALID_MODE');
const output=resolve(required('out'));await mkdir(output,{recursive:true,mode:0o700});
if(apply&&resolve(required('plan'))===join(output,'plan.json'))throw Error('APPLY_OUTPUT_MUST_NOT_OVERWRITE_APPROVED_PLAN');
if(process.env.DATABASE_URL)process.env.DATABASE_URL=parse('V='+process.env.DATABASE_URL).V;
const db=new PrismaClient(),repo=new PrismaDartRepository(db),owner=randomUUID();let locked=false;
const readState=async(tx:any,symbol:string):Promise<FillState>=>{const security=await tx.security.findUnique({where:{symbol},include:{dartCorpMapping:true}});if(!security)return {security:null,filings:[],valuations:[]};const where={securityId:security.id,fiscalYear:{in:[2024,2025]},periodType:'ANNUAL'};return {security,filings:await tx.dartFinancialFiling.findMany({where}),valuations:await tx.periodValuation.findMany({where})};};
const renew=async()=>{const renewed=await db.collectorLock.updateMany({where:{jobName:'dart-financial-statements',ownerToken:owner,lockedUntil:{gt:new Date()}},data:{lockedUntil:new Date(Date.now()+90000)}});if(renewed.count!==1)throw Error('FINANCIAL_LEASE_LOST');};
try{
 if(apply||rollback){if(!await repo.acquireLock(owner,90))throw Error('FINANCIAL_COLLECTOR_BUSY');locked=true;}
 if(rollback){
  const entries=(await readFile(required('journal'),'utf8')).trim().split('\n').filter(Boolean).map(l=>JSON.parse(l));
  for(const entry of entries.reverse()){
   if(entry.event!=='COMMITTED')continue;await renew();
   await withFinancialLease(owner,()=>withCollection(db,BigInt(entry.securityId),'valuation',()=>collectionClient(db).$transaction(async(tx:any)=>{
    const where={securityId_fiscalYear_periodType:{securityId:BigInt(entry.securityId),fiscalYear:2025,periodType:'ANNUAL'}};
    const current=await tx.periodValuation.findUnique({where});
    if(fingerprint(current)!==entry.afterHash)throw Error('ROLLBACK_CONFLICT:'+entry.symbol);
    if(entry.old){const old=reviveModel('PeriodValuation',entry.old);const data=Object.fromEntries(['status','values','provenance','reasons','supplemental','attempts','nextAttemptAt'].map(k=>[k,k==='supplemental'&&old[k]===null?Prisma.DbNull:old[k]]));await tx.periodValuation.update({where,data});}
    else await tx.periodValuation.delete({where});
   })));
   await appendFile(join(output,'rollback.jsonl'),json({event:'ROLLED_BACK',symbol:entry.symbol,at:new Date().toISOString()})+'\n',{mode:0o600});
  }
 }else{
  const csv=await readFile(required('csv'),'utf8'),evidenceBytes=await readFile(required('evidence'),'utf8');
  const evidence:FillEvidence[]=JSON.parse(evidenceBytes);if(!Array.isArray(evidence)||new Set(evidence.map(e=>e.symbol)).size!==evidence.length)throw Error('EVIDENCE_DUPLICATE_OR_INVALID');
  let targets=parseFillTargets(csv);
  if(arg('symbols')){const symbols=arg('symbols')!.split(',');if(symbols.some(s=>!targets.some(t=>t.symbol===s)))throw Error('SYMBOL_NOT_IN_CSV');targets=targets.filter(t=>symbols.includes(t.symbol));}
  if(arg('fields')){const fields=arg('fields')!.split(',');if(fields.some(k=>!fillFields.includes(k as any)))throw Error('UNKNOWN_FIELD');targets=targets.map(t=>({...t,fields:t.fields.filter(k=>fields.includes(k))})).filter(t=>t.fields.length);}
  const snapshot=arg('snapshot')?JSON.parse(await readFile(arg('snapshot')!,'utf8')):null;
  const approved=apply?JSON.parse(await readFile(required('plan'),'utf8')):null;
  if(apply&&(approved.csvHash!==fingerprint(csv)||approved.evidenceHash!==fingerprint(evidenceBytes)))throw Error('APPROVED_INPUT_CHANGED');
  const batch=Number(arg('batch')??(apply?'5':targets.length));if(!Number.isInteger(batch)||batch<1||batch>(apply?10:2000))throw Error('BATCH_OUT_OF_RANGE');
  const plans=[];let committed=0;
  for(const target of targets){
   if(apply&&committed>=batch)break;
   const calculate=async(tx:any)=>{
    let state:FillState;
    if(snapshot){const security=snapshot.securities.find((s:any)=>s.symbol===target.symbol);state={security,filings:snapshot.filings.filter((f:any)=>f.securityId===security?.id),valuations:snapshot.valuations.filter((v:any)=>v.securityId===security?.id)};}
    else state=await readState(tx,target.symbol);
    return {state,plan:await planFinancialFill(target,state,evidence.find(e=>e.symbol===target.symbol))};
   };
   if(!apply){const {plan}=snapshot?await calculate(null):await db.$transaction(calculate,{isolationLevel:'RepeatableRead'});plans.push(plan);continue;}
   await renew();
   const security=await db.security.findUnique({where:{symbol:target.symbol},select:{id:true}});if(!security)throw Error('SECURITY_MISSING');
   await withFinancialLease(owner,()=>withCollection(db,security.id,'valuation',()=>collectionClient(db).$transaction(async(tx:any)=>{
    const {plan,state}=await calculate(tx);plans.push(plan);
    // Completed rows are checkpoints: re-running never touches a finished row.
    if(!plan.data)return;
    const prior=approved.plans.find((p:any)=>p.target.symbol===target.symbol);
    if(!prior||fingerprint(prior.target)!==fingerprint(target)||prior.before!==plan.before||fieldPlanFingerprint(prior.fields)!==fieldPlanFingerprint(plan.fields))throw Error('PLAN_STALE:'+target.symbol);
    const stem=target.symbol+'-'+randomUUID();
    await writeFile(join(output,stem+'-before.json'),json(state),{mode:0o600,flag:'wx'});
    // Durable preimage precedes the atomic write. A crash before COMMITTED is reconciled by this hash.
    await appendFile(join(output,'journal.jsonl'),json({event:'PREPARED',symbol:target.symbol,securityId:String(security.id),old:plan.old,plannedDataHash:fingerprint(plan.data),stem})+'\n',{mode:0o600});
    const where={securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:2025,periodType:'ANNUAL'}};
    const after=await tx.periodValuation.upsert({where,create:{securityId:security.id,fiscalYear:2025,periodType:'ANNUAL',...plan.data},update:plan.data});
    await writeFile(join(output,stem+'-after.json'),json(after),{mode:0o600,flag:'wx'});
    await appendFile(join(output,'journal.jsonl'),json({event:'COMMIT_PENDING',symbol:target.symbol,securityId:String(security.id),old:plan.old,afterHash:fingerprint(after),stem})+'\n',{mode:0o600});
    committed++;
   })));
   // A transaction error never emits COMMITTED. PREPARED/COMMIT_PENDING permit crash recovery.
   const lines=(await readFile(join(output,'journal.jsonl'),'utf8').catch(()=>'' )).trim().split('\n');const last=lines.at(-1)?JSON.parse(lines.at(-1)!):null;
   if(last?.event==='COMMIT_PENDING'&&last.symbol===target.symbol)await appendFile(join(output,'journal.jsonl'),json({...last,event:'COMMITTED',at:new Date().toISOString()})+'\n',{mode:0o600});
  }
  const result={mode:apply?'APPLY':'READ_ONLY',at:new Date().toISOString(),csvHash:fingerprint(csv),evidenceHash:fingerprint(evidenceBytes),externalCalls:0,committed,plans};
  await writeFile(join(output,'plan.json'),json(result),{mode:0o600});
  console.log(json({mode:result.mode,targets:plans.length,expectedSaves:plans.reduce((n,p)=>n+p.expectedSaves,0),committed,externalCalls:0}));
 }
}finally{if(locked)await repo.releaseLock(owner);await db.$disconnect();}
