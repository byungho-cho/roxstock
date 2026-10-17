import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Prisma} from '../../shared/dist/generated/prisma/index.js';
import {annualSupplement} from './kis-annual-supplement.mjs';
import {KisInvestorProvider} from './kis-provider.mjs';
const d=v=>new Prisma.Decimal(v);
function basis(){
 const row={fiscalYear:2024,periodType:'ANNUAL',values:{eps:null,bps:'100',roe:'10',per:null,pbr:null},provenance:{version:1,source:'OPEN_DART',receiptNo:'r',periodEnd:'2024-12-31',fsDivision:'OFS',roeBasis:'TOTAL_SAME_DIVISION'},reasons:{eps:'missing'},supplemental:{shares:{receiptNo:'r',preferred:false,outstanding:'10'}}};
 const annual={source:'KIS_API',periodType:'ANNUAL',fiscalYear:2024,stacYymm:'202412',periodEnd:'2024-12-31',currency:'KRW',eps:'-3',bps:'100',roe:'10',equity:'1000',assets:'2000',netIncome:'100',revenue:'3000',collectedAt:'2026-10-17T00:00:00Z'};
 const f={fiscalYear:2024,periodType:'ANNUAL',receiptNo:'r',periodEndDate:new Date('2024-12-31'),fsDivision:'OFS',isWithdrawn:false,totalEquity:d(1000),totalAssets:d(2000),netIncomeYtd:d(100),revenueYtd:d(3000)};
 return {row,annual,f};
}
test('same annual year and unique reconciled division fill missing EPS, preserve negative/zero and all original fields',()=>{
 const b=basis(),before=JSON.stringify(b.row);let r=annualSupplement(b.row,[b.annual],[b.f]);assert.equal(r.changed,true);assert.equal(r.data.values.eps,'-3');assert.equal(r.data.values.bps,'100');assert.equal(r.data.provenance.perMetric.bps.source,'OPEN_DART');assert.equal(r.data.provenance.perMetric.eps.source,'KIS_API');assert.equal(r.data.reasons.eps,undefined);assert.equal(JSON.stringify(b.row),before);
 b.annual.eps='0';assert.equal(annualSupplement(b.row,[b.annual],[b.f]).data.values.eps,'0');b.row.values.eps='99';assert.equal(annualSupplement(b.row,[b.annual],[b.f]).changed,false);
});
test('reject stale years, interim, duplicate annual rows, conflicting financial division and unverified source data',()=>{
 for(const mutate of [(b)=>b.annual.fiscalYear=2023,(b)=>b.annual.periodType='Q4',(b)=>b.annual.stacYymm='202409',(b)=>b.annual.currency='MILLION_KRW',(b)=>b.row.periodType='ESTIMATE',(b)=>b.row.provenance.receiptNo='other',(b)=>b.f.isWithdrawn=true,(b)=>b.annual.equity='999999999999']){
  const b=basis();mutate(b);assert.equal(annualSupplement(b.row,[b.annual],[b.f]).changed,false);
 }
 const b=basis();assert.equal(annualSupplement(b.row,[b.annual,b.annual],[b.f]).changed,false);assert.equal(annualSupplement(b.row,[b.annual],[b.f,{...b.f,fsDivision:'CFS'}]).changed,false);
});
test('BPS denominator and ROE basis must independently reconcile; never replace missing EPS with income/end shares',()=>{
 const b=basis();b.row.values.bps=null;b.row.values.roe=null;b.annual.eps=null;b.annual.bps='101';const previous={...b.f,fiscalYear:2023};let r=annualSupplement(b.row,[b.annual],[b.f,previous]);assert.equal(r.data.values.eps,null);assert.equal(r.data.values.bps,null);assert.equal(r.data.values.roe,'10');
 b.annual.bps='100';r=annualSupplement(b.row,[b.annual],[b.f,previous]);assert.equal(r.data.values.bps,'100');assert.equal(r.data.provenance.perMetric.bps.sharesReceiptNo,'r');
});
test('annual provider uses annual endpoints, matches dates, converts hundred-million amounts, and spaces requests',async()=>{
 const calls=[],delays=[];const provider=new KisInvestorProvider({appKey:'key',appSecret:'secret',accessToken:'token',expiresAt:Date.now()+3600000,fetcher:async(url,options)=>{calls.push({url,options});let output=url.includes('financial-ratio')?[{stac_yymm:'202412',eps:'323',bps:'9280',roe_val:'3.58'},{stac_yymm:'202409',eps:'9'}]:url.includes('balance-sheet')?[{stac_yymm:'202412',total_cptl:'1860',total_aset:'2242'}]:[{stac_yymm:'202412',thtr_ntin:'66',sale_account:'1402'}];return new Response(JSON.stringify({rt_cd:'0',output}));}});
 const r=await provider.annualFundamentals('008420',{sleep:async ms=>delays.push(ms)});assert.equal(r.length,1);assert.equal(r[0].fiscalYear,2024);assert.equal(r[0].equity,'186000000000');assert.equal(r[0].eps,'323');assert.deepEqual(delays,[2000,2000,2000]);assert.ok(calls.every(c=>new URL(c.url).searchParams.get('fid_div_cls_code')==='0'));assert.ok(!JSON.stringify(r).includes('secret'));
});

import {runKisSupplements} from './kis-supplements.mjs';
test('scheduled supplement persists only verified gaps atomically and invalidates financial cache',async()=>{
 const b=basis();let owner,patch,finalRun,bumps=[];
 const security={id:1n,symbol:'008420',isActive:true,collectionExcluded:false,excludedFeatures:[],collectionRevision:0,codeRevision:0};
 const tx={$queryRaw:async()=>[{owner_token:owner,valid:1}],security:{findUnique:async()=>security},fundamentalSnapshot:{findUnique:async()=>null,upsert:async()=>({})},periodValuation:{findMany:async()=>[b.row],update:async({data})=>{patch=data;}},dartFinancialFiling:{findFirst:async()=>b.f},analysisRevision:{upsert:async({where})=>bumps.push(where.key)},collectorRunItem:{create:async()=>({})}};
 const db={$executeRaw:async()=>1,$queryRaw:async()=>[{owner_token:owner,valid:1}],collectorLock:{updateMany:async({data})=>{owner=data.ownerToken;return {count:1}},deleteMany:async()=>({count:1})},security:{findMany:async()=>[security]},periodValuation:{findMany:async()=>[b.row]},collectorRun:{updateMany:async()=>({count:0}),create:async()=>({id:1n}),update:async({data})=>{finalRun=data}},collectorRunItem:{create:async()=>({})},$transaction:async fn=>fn(tx)};
 const observation={per:'2',pbr:'0.2',eps:'999',bps:'9999',listedShares:'10',foreignHoldingShares:'0',foreignExhaustionRate:'0',collectedAt:new Date(),raw:{}};
 const kis={currentFundamentals:async()=>observation,annualFundamentals:async()=>[b.annual]};
 const r=await runKisSupplements({db,kis,sleep:async()=>{}});assert.equal(r.annualFilled,1);assert.equal(patch.values.eps,'-3');assert.notEqual(patch.values.eps,observation.eps);assert.deepEqual(bumps,['financial','security:1']);assert.equal(finalRun.status,'SUCCESS');
 patch=null;bumps=[];kis.annualFundamentals=async()=>{throw new Error('unavailable')};const failed=await runKisSupplements({db,kis,sleep:async()=>{}});assert.equal(failed.stored,1);assert.equal(patch,null);assert.equal(finalRun.status,'PARTIAL');assert.equal(finalRun.metadata.annualFailures,1);
});
