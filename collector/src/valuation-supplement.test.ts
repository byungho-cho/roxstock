import assert from 'node:assert/strict';import test from 'node:test';import {Prisma,type PrismaClient} from '@roxstock/shared/prisma';import {supplementStoredPeriod,supplementSafely} from './valuation-supplement.js';
import {loadPeriodSupplement} from './valuation-supplement.js';import type {OpenDartProvider} from './dart-provider.js';
const d=(v:number)=>new Prisma.Decimal(v);
test('DART exact filing EPS is supplemented independently of KRX historical-price rollout',async()=>{
 const receiptNo='20260319000530',corpCode='00123456';let calls=0;
 const filing={securityId:329n,fiscalYear:2025,periodType:'ANNUAL',reportCode:'11011',fsDivision:'OFS',receiptNo,periodEndDate:new Date('2025-12-31'),receiptDate:new Date('2026-03-19'),accountSources:{}};
 const provider={fetchFinancials:async()=>{calls++;return [{corpCode,fiscalYear:2025,reportCode:'11011',receiptNo,currency:'KRW',statementDivision:'CIS',accountId:'ifrs-full_BasicEarningsLossPerShare',accountName:'기본주당이익',currentAmount:'314',currentYtdAmount:null}];}} as unknown as OpenDartProvider;
 const shares={receiptNo,outstanding:'20503505',preferred:false,rows:[{stockKind:'보통주',shareClass:'COMMON',issuedShares:'20503505',treasuryShares:'0',outstandingShares:'20503505',periodEndDate:'2025-12-31'}]};
 const load=loadPeriodSupplement(provider,'008420',corpCode,undefined,'KOSPI');
 const result=await load(filing as any,{shares,price:{value:'2000',date:'2025-12-30',source:'TEST'}});
 assert.equal(calls,1);assert.equal(result.accounts?.sources.basicEps?.amount,'314');assert.equal(result.accounts?.receiptNo,receiptNo);assert.equal(result.errors?.accounts,undefined);
});
test('supplement is idempotent, dry run never writes, failed supplemental source preserves financial success and stored values',async()=>{
 let saved:any=null,writes=0,financialWrites=0;
 const f={securityId:1n,fiscalYear:2025,periodType:'ANNUAL',fsDivision:'OFS',receiptNo:'20260301000001',receiptDate:new Date('2026-03-01'),periodEndDate:new Date('2025-12-31'),netIncomeYtd:d(20),totalEquity:d(220),accountSources:{}};
 let db:any;db={$queryRaw:async()=>[],$transaction:async(fn:any)=>fn(db),security:{findMany:async()=>[],findUnique:async()=>({id:1n,symbol:'005930',collectionRevision:0,collectionExcluded:false,excludedFeatures:[]})},dartFinancialFiling:{findFirst:async(q:any)=>q.where.fiscalYear===2025?f:{...f,fiscalYear:2024,totalEquity:d(180)},update:()=>{financialWrites++;}},periodValuation:{findUnique:async()=>saved,upsert:async(q:any)=>{writes++;saved={...(saved??q.create),...q.update};return saved;}}} as unknown as PrismaClient;
 const preview=await supplementStoredPeriod(db,1n,2025,'ANNUAL',{dryRun:true});assert.equal((preview?.values as any).roe,'10');assert.equal(writes,0);
 await supplementStoredPeriod(db,1n,2025,'ANNUAL');await supplementStoredPeriod(db,1n,2025,'ANNUAL');assert.equal(saved.values.roe,'10');assert.equal(financialWrites,0);
 saved.values.eps='7';await supplementSafely(db,1n,2025,'ANNUAL',async()=>{throw {code:'020'};});assert.equal(saved.status,'FAILED');assert.equal(saved.values.eps,'7');assert.equal(saved.values.roe,'10');assert.equal(financialWrites,0);
 await supplementStoredPeriod(db,1n,2025,'ANNUAL',{load:async()=>({accounts:{receiptNo:f.receiptNo,fsDivision:f.fsDivision,collectedAt:'2026-10-08T00:00:00Z',sources:{basicEps:{amount:'10'}}},shares:{outstanding:'10',preferred:false,receiptNo:f.receiptNo},price:{value:'100',date:'2025-12-30',source:'FSC'}})});
 assert.equal(saved.values.eps,'7');assert.equal(saved.values.per,null);assert.match(saved.reasons.per,/기존 정상 EPS/);assert.equal(financialWrites,0);
 const count=writes;assert.equal(await supplementStoredPeriod(db,1n,2014,'ANNUAL'),null);assert.equal(writes,count);
});
test('missing accounts are supplemented independently; source errors cannot erase saved price or rewrite a filing',async()=>{
 let financialCalls=0,shareCalls=0;
 const provider={fetchFinancials:async()=>{financialCalls++;throw {code:'AUTH_FIXTURE'};},fetchPeriodShares:async()=>{shareCalls++;return {outstanding:'10',preferred:false,receiptNo:'20260301000001'};}} as unknown as OpenDartProvider;
 const f={securityId:1n,fiscalYear:2025,periodType:'ANNUAL',reportCode:'11011',fsDivision:'CFS',receiptNo:'20260301000001',receiptDate:new Date('2026-03-01'),periodEndDate:new Date('2025-12-31'),accountSources:{},normalizationVersion:1} as any;
 let db:any;db={$queryRaw:async()=>[],$transaction:async(fn:any)=>fn(db),security:{findMany:async()=>[],findUnique:async()=>({id:1n,symbol:'005930',collectionRevision:0,collectionExcluded:false,excludedFeatures:[]})},dartFinancialFiling:{update:()=>{throw Error('must not rewrite filing');},upsert:()=>{throw Error('must not rewrite filing');}}} as unknown as PrismaClient;
 const saved={price:{value:'100',date:'2025-12-30',source:'FSC'}};
 const result=await loadPeriodSupplement(provider,'005930','00126380',db,'KOSPI')(f,saved);
 assert.equal(financialCalls,1);assert.equal(shareCalls,1);assert.deepEqual(result.price,saved.price);assert.equal(result.shares?.outstanding,'10');assert.equal(result.errors?.accounts,'ACCOUNTS_COMMUNICATION');
});

test('a dated reconciled KIS EPS can fill PER; mismatched fiscal receipt cannot',async()=>{
 const f:any={securityId:1n,normalizationVersion:3,fiscalYear:2024,periodType:'ANNUAL',fsDivision:'OFS',receiptNo:'receipt',receiptDate:new Date('2025-03-01'),periodEndDate:new Date('2024-12-31'),netIncomeYtd:d(20),totalEquity:d(220),accountSources:{}};
 const evidence={source:'KIS_API',fiscalYear:2024,periodType:'ANNUAL',receiptNo:'receipt',fsDivision:'OFS',periodEnd:'2024-12-31',validation:'DART_BALANCE_AND_FLOW_RECONCILED'};
 let saved:any={status:'PARTIAL',values:{eps:'10',bps:'22',per:null,pbr:null,roe:'10'},provenance:{perMetric:{eps:evidence}},supplemental:{price:{value:'100',date:'2024-12-30',source:'KIS_KRX_UNADJUSTED_CLOSE'},basis:{receiptNo:'receipt',epsPriceCompatible:true,bpsPriceCompatible:true},kisAnnual:{fiscalYear:2024,periodEnd:'2024-12-31',matchedReceiptNo:'receipt',matchedDivision:'OFS',eps:'10.00'}}};
 let db:any;db={$queryRaw:async()=>[],$transaction:async(fn:any)=>fn(db),security:{findMany:async()=>[],findUnique:async()=>({id:1n,symbol:'008420',collectionExcluded:false,excludedFeatures:[],collectionRevision:0})},dartFinancialFiling:{findFirst:async(q:any)=>q.where.fiscalYear===2024?f:null},periodValuation:{findUnique:async()=>saved,upsert:async(q:any)=>(saved={...saved,...q.update})}};
 let result:any=await supplementStoredPeriod(db,1n,2024,'ANNUAL',{dryRun:true});assert.equal(result.values.per,'10');assert.equal(result.provenance.perMetric.per.denominatorEvidence.source,'KIS_API');
 saved.provenance.perMetric.eps={...evidence,receiptNo:'wrong'};result=await supplementStoredPeriod(db,1n,2024,'ANNUAL',{dryRun:true});assert.equal(result.values.per,null);
 saved.provenance.perMetric.eps=evidence;saved.supplemental.basis.epsPriceCompatible=false;result=await supplementStoredPeriod(db,1n,2024,'ANNUAL',{dryRun:true});assert.equal(result.values.per,null);
});

test('same-filing capital supplements and missing previous capital are used in ROE without rewriting filings',async()=>{
 const f:any={securityId:1n,normalizationVersion:3,fiscalYear:2018,periodType:'ANNUAL',fsDivision:'OFS',receiptNo:'current',receiptDate:new Date('2019-06-18'),periodEndDate:new Date('2018-12-31'),netIncomeYtd:null,totalEquity:null,accountSources:{}};
 const previous={...f,fiscalYear:2017,receiptNo:'previous',periodEndDate:new Date('2017-12-31')};let previousSaved=false;
 let db:any;db={$queryRaw:async()=>[],$transaction:async(fn:any)=>fn(db),security:{findMany:async()=>[],findUnique:async()=>({id:1n,symbol:'008420',collectionExcluded:false,excludedFeatures:[],collectionRevision:0})},dartFinancialFiling:{findFirst:async(q:any)=>q.where.fiscalYear===2018?f:previous},periodValuation:{findUnique:async()=>null,upsert:async(q:any)=>{if(q.create.fiscalYear===2017)previousSaved=true;return q.create;}}};
 const result:any=await supplementStoredPeriod(db,1n,2018,'ANNUAL',{load:async(filing,saved,sharesOnly,accountsOnly)=>{if(filing!.fiscalYear===2017)assert.equal(accountsOnly,true);return {accounts:{receiptNo:filing!.receiptNo,fsDivision:'OFS',collectedAt:new Date().toISOString(),sources:{totalEquity:{amount:filing!.fiscalYear===2017?'100':'200'},netIncome:{amount:'15'}}}};}});
 assert.equal(result.values.roe,'10');assert.equal(previousSaved,true);assert.equal(f.totalEquity,null);assert.equal(previous.totalEquity,null);
});
