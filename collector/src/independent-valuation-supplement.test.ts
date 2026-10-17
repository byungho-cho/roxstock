import assert from 'node:assert/strict';import test from 'node:test';
import {runIndependentSupplement} from './independent-valuation-supplement.js';
import {dartWindowOpen} from '@roxstock/shared/collection/dart-policy';
import {Prisma,type PrismaClient} from '@roxstock/shared/prisma';
import {OpenDartProvider,DartApiError} from './dart-provider.js';
import {PrismaDartRepository} from './dart-repository.js';
import {periodCollectionState} from '@roxstock/shared/domain/collection-status';
const now=new Date('2026-10-17T12:00:00Z'),config={windowStartHour:18,windowEndHour:6,apiKey:'test',dailyCallLimit:10,minDelayMs:0};
function fixture(){
 const share={receiptNo:'20260301000001',outstanding:'10',preferred:false,rows:[{stockKind:'보통주',shareClass:'COMMON',issuedShares:'10',treasuryShares:'0',outstandingShares:'10',periodEndDate:'2025-12-31'}]};
 let saved:any={securityId:1n,fiscalYear:2025,periodType:'ANNUAL',status:'PARTIAL',values:{eps:null,bps:null,per:null,pbr:null,roe:'0'},provenance:{},supplemental:{shares:share,price:{value:'200',date:'2025-12-30',source:'KIS_KRX_UNADJUSTED_CLOSE',shareBasis:'ORIGINAL_EQUALS_ADJUSTED'},manualAttempt:{state:'FINAL_FAILED',finishedAt:'2026-10-16T00:00:00Z'}},nextAttemptAt:null};
 const f:any={securityId:1n,fiscalYear:2025,periodType:'ANNUAL',reportCode:'11011',normalizationVersion:3,receiptNo:share.receiptNo,fsDivision:'OFS',receiptDate:new Date('2026-03-01'),periodEndDate:new Date('2025-12-31'),netIncomeYtd:new Prisma.Decimal(0),revenueYtd:new Prisma.Decimal(100),operatingProfitYtd:new Prisma.Decimal(0),totalEquity:new Prisma.Decimal(100),totalAssets:new Prisma.Decimal(120),totalLiabilities:new Prisma.Decimal(20),accountSources:{},security:{symbol:'008420',marketType:'KOSPI',dartCorpMapping:{corpCode:'00123456'}}};
 let releases=0,finished:any;const original=JSON.stringify(f,(_,v)=>typeof v==='bigint'?String(v):v);
 let db:any;db={$queryRaw:async()=>[],$transaction:async(fn:any)=>fn(db),security:{findMany:async()=>[],findUnique:async()=>({id:1n,symbol:'008420',collectionRevision:0,codeRevision:0,isActive:true,collectionExcluded:false,excludedFeatures:[]})},dartShareSnapshot:{findUnique:async()=>null,upsert:async()=>({})},collectorLock:{updateMany:async()=>({count:1})},collectorRun:{findMany:async()=>[]},dartFinancialFiling:{findMany:async()=>[f],findFirst:async(q:any)=>q.where.fiscalYear===2025?f:{...f,fiscalYear:2024,receiptNo:'previous',totalEquity:new Prisma.Decimal(80)},update:async()=>{throw Error('Original must not change');}},periodValuation:{findMany:async()=>[saved],findUnique:async(q:any)=>q.where.securityId_fiscalYear_periodType.fiscalYear===2025?saved:null,upsert:async(q:any)=>(saved={...saved,...q.update}),update:async(q:any)=>(saved={...saved,...q.data})}};
 return {db:db as PrismaClient,record:()=>saved,filing:f,original,releases:()=>releases,finish:()=>finished,mocks:{acquireLock:async()=>true,releaseLock:async()=>{releases++;},prioritySecurityIds:async()=>[1n],createRun:async()=>({id:1n}),finishRun:async(...args:any[])=>{finished=args;}}};
}
async function withRepo<T>(f:ReturnType<typeof fixture>,work:()=>Promise<T>){const old=new Map<string,unknown>();for(const [key,value]of Object.entries(f.mocks)){old.set(key,(PrismaDartRepository.prototype as any)[key]);(PrismaDartRepository.prototype as any)[key]=value;}try{return await work();}finally{for(const [key,value]of old)(PrismaDartRepository.prototype as any)[key]=value;}}
test('automatic supplement fetches missing DART accounts through the same alias normalizer, calculates KIS-close ratios and preserves zero/originals',async()=>{
 const f=fixture(),old=OpenDartProvider.prototype.fetchFinancials;let calls=0;
 OpenDartProvider.prototype.fetchFinancials=async()=>{calls++;return [{receiptNo:'20260301000001',fiscalYear:2025,reportCode:'11011',corpCode:'00123456',statementDivision:'CIS',accountId:'custom-eps',accountName:'기본주당순이익',currentAmount:'10',currentYtdAmount:null,currency:'KRW'}];};
 try{const result=await withRepo(f,()=>runIndependentSupplement(f.db,config,now,{clock:()=>now,sleep:async()=>{}}));assert.equal(calls,1);assert.equal(result.success,1);assert.equal(f.record().values.per,'20');assert.equal(f.record().values.pbr,'20');assert.equal(f.record().values.roe,'0');assert.equal(f.record().nextAttemptAt,null);assert.equal(f.record().supplemental.verifiedAt,now.toISOString());assert.equal(f.releases(),1);assert.equal(JSON.stringify(f.filing,(_,v)=>typeof v==='bigint'?String(v):v),f.original);assert.equal(periodCollectionState(f.record(),true),'COMPLETE');}finally{OpenDartProvider.prototype.fetchFinancials=old;}
});
test('automatic quota failure retains saved values and defers retry; later source failure cannot erase financial success',async()=>{
 const f=fixture();f.record().values.eps='10';const result=await withRepo(f,()=>runIndependentSupplement(f.db,config,now,{clock:()=>now,sleep:async()=>{},load:async()=>{throw new DartApiError('020','quota',true);}}));assert.equal(result.failed,1);assert.equal(f.record().values.eps,'10');assert.equal(f.record().values.roe,'0');assert.ok(f.record().nextAttemptAt>now);assert.equal(f.record().supplemental.verifiedAt,undefined);assert.equal(f.releases(),1);
});
test('automatic pending retry respects nextAttemptAt; normal complete sources remain idle',async()=>{
 const f=fixture();f.record().nextAttemptAt=new Date(now.getTime()+3600000);const result=await withRepo(f,()=>runIndependentSupplement(f.db,config,now,{clock:()=>now}));assert.equal(result.status,'IDLE');assert.equal(f.releases(),1);
});
test('newer manual result still wins over an older automatic repair',()=>{
 assert.equal(periodCollectionState({status:'PARTIAL',values:{},supplemental:{automaticAttempt:{at:'2026-10-16T00:00:00Z',state:'COMPLETE'},manualAttempt:{finishedAt:'2026-10-17T00:00:00Z',state:'FINAL_FAILED'}}},true),'FINAL_FAILED');
});
test('weekend all day and weekday night follow Seoul boundary independently of DART enable',()=>{assert.equal(dartWindowOpen(new Date('2026-10-10T03:00:00Z'),18,6,[],true),true);assert.equal(dartWindowOpen(new Date('2026-10-09T03:00:00Z'),18,6,[],true),false);});
test('disabled independent collector and daytime do not query DB or sources',async()=>{const db=new Proxy({}, {get(){throw Error('unexpected DB call');}}) as PrismaClient;const prior=process.env.VALUATION_SUPPLEMENT_ENABLED;try{process.env.VALUATION_SUPPLEMENT_ENABLED='false';assert.equal((await runIndependentSupplement(db,config)).status,'DISABLED');delete process.env.VALUATION_SUPPLEMENT_ENABLED;assert.equal((await runIndependentSupplement(db,config,new Date('2026-10-09T03:00:00Z'))).status,'OUTSIDE_WINDOW');}finally{if(prior===undefined)delete process.env.VALUATION_SUPPLEMENT_ENABLED;else process.env.VALUATION_SUPPLEMENT_ENABLED=prior;}});

test('automatic preferred-company reference ratios share manual math and remain explicitly reference only',async()=>{
 const f=fixture(),shares=f.record().supplemental.shares;shares.preferred=true;shares.rows.push({stockKind:'우선주',shareClass:'PREFERRED',issuedShares:'10',treasuryShares:'0',outstandingShares:'10',periodEndDate:'2025-12-31'},{stockKind:'합계',shareClass:'TOTAL',issuedShares:'20',treasuryShares:'0',outstandingShares:'20',periodEndDate:'2025-12-31'});
 const result=await withRepo(f,()=>runIndependentSupplement(f.db,config,now,{clock:()=>now,sleep:async()=>{},load:async(filing,saved)=>({...saved,accounts:{receiptNo:filing!.receiptNo,fsDivision:'OFS',collectedAt:now.toISOString(),sources:{basicEps:{amount:'10',ordinaryEpsVerified:true}}},basis:{receiptNo:filing!.receiptNo,epsPriceCompatible:true,bpsPriceCompatible:true,source:'TEST',verifiedAt:now.toISOString()}})}));
 assert.equal(result.success,1);assert.equal(f.record().values.per,'20');assert.equal(f.record().values.bps,'5');assert.equal(f.record().values.pbr,'40');assert.equal(f.record().provenance.bpsReferenceOnly,true);
});
test('automatic daily period cap stops before any source request',async()=>{
 const f=fixture();f.db.collectorRun.findMany=async()=>[{metadata:{reservedPeriods:200}}] as any;
 const result=await withRepo(f,()=>runIndependentSupplement(f.db,config,now,{clock:()=>now,load:async()=>{throw Error('Source must not run');}}));assert.equal(result.status,'QUOTA_BLOCKED');assert.equal(f.finish(),undefined);assert.equal(f.releases(),1);
});

test('missing DART credentials still permit stored-price supplementation without creating an authenticated provider',async()=>{const f=fixture(),old=process.env.DART_API_KEY;delete process.env.DART_API_KEY;try{const result=await withRepo(f,()=>runIndependentSupplement(f.db,{windowStartHour:18,windowEndHour:6},now,{clock:()=>now,sleep:async()=>{}}));assert.equal(result.status,'SUCCESS');assert.equal(result.skipped,1);assert.equal(f.record().values.bps,'10');}finally{if(old===undefined)delete process.env.DART_API_KEY;else process.env.DART_API_KEY=old;}});
test('independent supplement yields its lease before manual work and resumes a safe period',async()=>{
 const f=fixture();let manual=0;f.db.collectorRun.findFirst=(async()=>({id:8n})) as any;
 const result=await withRepo(f,()=>runIndependentSupplement(f.db,config,now,{clock:()=>now,sleep:async()=>{},serviceManual:async()=>{assert.equal(f.releases(),1);manual++;return true;},load:async(_,saved)=>saved}));
 assert.equal(manual,1);assert.equal(result.status,'SUCCESS');assert.equal(f.releases(),2);
});
