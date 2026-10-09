import assert from 'node:assert/strict';
import test from 'node:test';
import {Prisma,type PrismaClient} from '../generated/prisma/index.js';
import {parseNaverAnnual,NaverAnnualProvider,NaverAnnualError,type NaverAnnual} from './naver-annual.js';
import {refreshManualAnnual} from './manual-annual-prototype.js';
import {normalizeManualDartAccounts} from './manual-dart-accounts.js';
import {historicalClose} from './historical-close.js';
import {OpenDartProvider} from './dart-provider.js';
import {PrismaDartRepository} from './dart-repository.js';
import {getSeoulClock} from './time.js';
import {configuredKrx} from './krx-provider.js';
const year=Number(getSeoulClock().dateKey.slice(0,4));
const definitions='단위 : 억원, %, 배, 주; 보통주수정주가(기말)/EPS; 보통주+우선주; [기준:2026.10.07]';
const table=(estimated=true)=>`<table><thead><tr><th>연간</th></tr><tr><th>${year-1}/12 (IFRS연결)</th><th>${year}/12${estimated?'(E)':''} (IFRS연결)</th></tr></thead><tbody>${[['EPS(원)','100.25','200.5'],['BPS(원)','1000','2000'],['PER(배)','10','5'],['PBR(배)','1','0.5'],['ROE(%)','10','20'],['매출액','1','2']].map(([k,a,b])=>`<tr><th>${k}</th><td title="${a}">999</td><td title="${b}">999</td></tr>`).join('')}</table>`;
test('NAVER parser rejects decoy/top-level TTM and mixed periods; actual/E columns and precision are preserved',()=>{
 const data=parseNaverAnnual('<table><tr><th>8658</th><td>8658</td></tr></table>'+table(),'005930',definitions);
 assert.equal(data[0]?.kind,'FINAL_ANNUAL');assert.equal(data[1]?.kind,'ANNUAL_ESTIMATE');assert.equal(data[0]?.values.eps,'100.25');assert.equal(data[1]?.financials.revenue,'200000000');
 assert.equal(data[0]?.pricePolicy,'ADJUSTED_ORDINARY_YEAR_END');assert.equal(data[1]?.priceDate,'2026-10-07');
 assert.throws(()=>parseNaverAnnual('<table><tr><th>EPS</th><td>100</td></tr></table>','005930',definitions),{code:'NAVER_ANNUAL_TABLE_MISSING'});
 assert.throws(()=>parseNaverAnnual(table(),'005930','단위 : 억원; TTM EPS'),{code:'NAVER_ANNUAL_FORMULA_UNCONFIRMED'});
 assert.equal(parseNaverAnnual(table(false),'005930',definitions)[1]?.kind,'FINAL_ANNUAL');
});
test('one manual provider shares a bounded crawl across years; no rate-limit retries or unbounded requests',async()=>{
 let calls=0;const p=new NaverAnnualProvider((async input=>{calls++;return new Response(String(input).includes('/ajax/')?table():definitions+" encparam: 'opaque' , id: 'table' ");}) as typeof fetch);
 await Promise.all([p.annual('005930'),p.annual('005930')]);assert.equal(calls,2);
 let limits=0;const limited=new NaverAnnualProvider((async()=>{limits++;return new Response('',{status:429});}) as typeof fetch);await assert.rejects(limited.annual('005930'),{code:'NAVER_RATE_LIMIT'});assert.equal(limits,1);
 let bodyReads=0;const interrupted=new NaverAnnualProvider((async()=>{bodyReads++;return {ok:true,text:async()=>{throw new DOMException('body timeout','TimeoutError');}} as unknown as Response;}) as typeof fetch);await assert.rejects(interrupted.annual('005930'),{code:'NAVER_COMMUNICATION'});assert.equal(bodyReads,2);
});
function fixture(old?:Record<string,unknown>,fiscalYear=year-1){
 let record:any=old??null,snapshots=0,filingWrites=0;
 const d=(v:number)=>new Prisma.Decimal(v);
 const filing:any={id:1n,securityId:1n,fiscalYear,periodType:'ANNUAL',reportCode:'11011',fsDivision:'CFS',receiptNo:'20260301000001',receiptDate:new Date('2026-03-01'),periodEndDate:new Date(`${year-1}-12-31`),normalizationVersion:1,collectedAt:new Date(),revenueYtd:d(100),operatingProfitYtd:d(10),netIncomeYtd:d(5),totalAssets:d(500),totalLiabilities:d(200),totalEquity:d(300),accountSources:{basicEps:{amount:'6605'}}};
 const db={periodValuation:{findUnique:async()=>record,upsert:async(q:any)=>{record=record?{...record,...q.update}:q.create;return record;},update:async(q:any)=>{record={...record,...q.data};return record;}},dartFinancialFiling:{findFirst:async(q:any)=>q.where.fiscalYear===fiscalYear?filing:null,update:async()=>{filingWrites++;throw Error('not permitted');}},annualConsensusSnapshot:{upsert:async()=>{snapshots++;}}} as unknown as PrismaClient;
 const security={id:1n,symbol:'005930',marketType:'KOSPI',dartCorpMapping:{corpCode:'00126380'}};
 const provider={listPeriodicReports:async()=>{throw Error('unnecessary list call');},fetchFinancials:async()=>{throw Error('unnecessary full re-collection');}} as unknown as OpenDartProvider;
 const repo={} as PrismaDartRepository;
 return {db,security,provider,repo,record:()=>record,snapshots:()=>snapshots,filingWrites:()=>filingWrites};
}
const naver=(rows:NaverAnnual[])=>({annual:async()=>rows} as unknown as NaverAnnualProvider);
test('manual annual source replacement keeps atomic metric provenance/history and avoids full DART recollection',async()=>{
 const f=fixture({status:'PARTIAL',values:{eps:'6605'},provenance:{source:'OPEN_DART'},supplemental:{price:{value:'1000',date:`${year-1}-12-30`,source:'KRX_UNADJUSTED_CLOSE'}}});
 const result=await refreshManualAnnual(f.db,f.security,year-1,f.provider,naver(parseNaverAnnual(table(),'005930',definitions)),f.repo,10n);
 assert.equal(result.collectionState,'COMPLETE');assert.equal(result.financialComplete,true);assert.equal(f.record().values.eps,'100.25');assert.equal(f.record().values.per,'10');assert.equal(f.record().supplemental.manualAttempt.replacements.eps.before,'6605');assert.equal(f.record().provenance.perMetric.eps.source,'NAVER_FNGUIDE_ANNUAL');assert.equal(f.filingWrites(),0);assert.equal(f.snapshots(),0);
});
test('current estimates use only explicitly E columns; normal actuals are never renamed and failed attempts preserve values',async()=>{
 const f=fixture({values:{eps:'77',per:'5'},provenance:{source:'OLD'},supplemental:{}});
 await refreshManualAnnual(f.db,f.security,year,f.provider,naver(parseNaverAnnual(table(false),'005930',definitions)),f.repo,11n);
 assert.equal(f.record().supplemental.manualAttempt.state,'NOT_COLLECTED');assert.equal(f.record().values.eps,'77');assert.equal(f.snapshots(),0);
 const failed={annual:async()=>{throw new NaverAnnualError('NAVER_RESPONSE_PARSE');}} as unknown as NaverAnnualProvider;
 await refreshManualAnnual(f.db,f.security,year,f.provider,failed,f.repo,12n);
 assert.equal(f.record().values.eps,'77');assert.equal(f.record().values.per,'5');assert.equal(f.record().supplemental.manualAttempt.state,'FINAL_FAILED');assert.equal(f.record().supplemental.manualAttempt.errors.naver,'NAVER_RESPONSE_PARSE');
});
test('E consensus is persisted separately without DART requests or generated missing values',async()=>{
 const f=fixture();const rows=parseNaverAnnual(table(),'005930',definitions);rows[1]!.values.eps='-5';rows[1]!.values.per=null;
 const result=await refreshManualAnnual(f.db,f.security,year,f.provider,naver(rows),f.repo,13n);
 assert.equal(result.kind,'ANNUAL_ESTIMATE');assert.equal(result.collectionState,'ESTIMATE_READY');assert.equal(result.disclosureChecked,false);assert.equal(f.record().values.per,null);assert.equal(f.record().supplemental.manualAttempt.notApplicable.per,'EPS_NON_POSITIVE');assert.equal(f.snapshots(),1);
});
test('manual DART aliases only fill unambiguous missing exact accounts and do not change automatic normalization',()=>{
 const row:any={statementDivision:'IS',accountId:'issuer_BasicEPS',accountName:'기본주당이익',currentAmount:'42',currentYtdAmount:'42',currency:'KRW'};
 assert.equal(normalizeManualDartAccounts([row]).accountSources.basicEps?.amount,'42');
 assert.equal(normalizeManualDartAccounts([row,{...row,currentAmount:'43'}]).accountSources.basicEps,undefined);
 assert.equal(normalizeManualDartAccounts([{...row,accountName:'희석주당이익'}]).accountSources.basicEps,undefined);
});
test('missing PER uses verified year-end price and disclosed ordinary EPS; corporate-action guard still blocks calculations',async()=>{
 const rows=parseNaverAnnual(table(),'005930',definitions);rows[0]!.values.eps=null;rows[0]!.values.per=null;
 const saved={price:{value:'1000',date:`${year-1}-12-30`,source:'KRX_UNADJUSTED_CLOSE'},shares:{outstanding:'10',preferred:false,receiptNo:'20260301000001'},basis:{epsPriceCompatible:true,bpsPriceCompatible:true,receiptNo:'20260301000001',source:'VERIFIED_ORDINARY',verifiedAt:new Date().toISOString()}};
 const f=fixture({values:{},provenance:{},supplemental:saved});
 await refreshManualAnnual(f.db,f.security,year-1,f.provider,naver(rows),f.repo,14n);
 assert.equal(f.record().values.eps,'6605');assert.equal(f.record().values.per,'0.1514');assert.equal(f.record().provenance.perMetric.per.method,'CALCULATED');assert.equal(f.record().provenance.perMetric.per.formula,'LAST_TRADING_DAY_CLOSE / ANNUAL_EPS');assert.equal(f.record().provenance.perMetric.eps.accountEvidence.stored.basicEps.amount,'6605');assert.equal(f.record().provenance.perMetric.per.priceDate,`${year-1}-12-30`);assert.equal(f.record().provenance.perMetric.per.epsBasis,'DISCLOSED_BASIC_EPS_WEIGHTED_AVERAGE_ORDINARY_SHARES');
 const blocked=fixture({values:{},provenance:{},supplemental:{...saved,basis:{...saved.basis,epsPriceCompatible:false}}});
 await refreshManualAnnual(blocked.db,blocked.security,year-1,blocked.provider,naver(rows),blocked.repo,15n);
 assert.equal(blocked.record().values.per,null);assert.equal(blocked.record().supplemental.manualAttempt.state,'FINAL_FAILED');assert.match(blocked.record().reasons.per,/액면분할/);
});
test('automatic KRX scope remains restricted and internal restriction is not an external permission failure',async()=>{
 const key=process.env.KRX_API_KEY,allowed=process.env.KRX_VALIDATED_SYMBOLS;process.env.KRX_API_KEY='test';process.env.KRX_VALIDATED_SYMBOLS='005930';
 const krx=configuredKrx(),original=krx.close;let calls=0;krx.close=async()=>{calls++;return {value:'100',date:'2025-12-30',source:'KRX_UNADJUSTED_CLOSE'};};
 try{await assert.rejects(historicalClose('000660',new Date('2025-12-31')),e=>{assert.equal((e as any).code,'KRX_ROLLOUT_NOT_VALIDATED');assert.equal((e as any).category,'INTERNAL_LIMIT');return true;});assert.equal(calls,0);await historicalClose('000660',new Date('2025-12-31'),fetch,'KOSPI','MANUAL_PROTOTYPE');assert.equal(calls,1);await assert.rejects(historicalClose('005380',new Date('2025-12-31'),fetch,'KOSPI','MANUAL_PROTOTYPE'),{code:'KRX_ROLLOUT_NOT_VALIDATED'});}
 finally{krx.close=original;if(key===undefined)delete process.env.KRX_API_KEY;else process.env.KRX_API_KEY=key;if(allowed===undefined)delete process.env.KRX_VALIDATED_SYMBOLS;else process.env.KRX_VALIDATED_SYMBOLS=allowed;}
});

test('manual CFS ROE does not silently substitute total-equity basis when owner accounts are missing',async()=>{
 const rows=parseNaverAnnual(table(),'005930',definitions);rows[0]!.values.roe=null;
 const f=fixture({values:{},provenance:{},supplemental:{price:{value:'1000',date:`${year-1}-12-30`,source:'KRX_UNADJUSTED_CLOSE'}}});
 const find=f.db.dartFinancialFiling.findFirst.bind(f.db.dartFinancialFiling);const current=await find({where:{fiscalYear:year-1}});
 f.db.dartFinancialFiling.findFirst=(async(q:any)=>q.where.fiscalYear===year-2?{...current,fiscalYear:year-2,totalEquity:new Prisma.Decimal(250),accountSources:{}}:find(q)) as typeof f.db.dartFinancialFiling.findFirst;
 await refreshManualAnnual(f.db,f.security,year-1,f.provider,naver(rows),f.repo,16n);
 assert.equal(f.record().values.roe,null);assert.equal(f.record().reasons.roe,'OWNERS_PROFIT_AND_AVERAGE_EQUITY_BASIS_UNCONFIRMED');assert.equal(f.record().provenance.roeBasis,null);assert.equal(f.record().supplemental.manualAttempt.state,'FINAL_FAILED');
});

for(const fiscalYear of [2021,2022])test('manual Naver historical annual '+fiscalYear+' uses exact year and preserves unavailable source',async()=>{
 const f=fixture(undefined,fiscalYear);const rows=parseNaverAnnual(table().replaceAll(String(year-1)+'/12',String(fiscalYear)+'/12'),'005930',definitions);
 await refreshManualAnnual(f.db,f.security,fiscalYear,f.provider,naver(rows),f.repo,21n);
 assert.equal(f.record().values.per,'10');assert.equal(f.record().values.pbr,'1');assert.equal(f.record().provenance.perMetric.per.fiscalYear,fiscalYear);assert.equal(f.filingWrites(),0);
 await refreshManualAnnual(f.db,f.security,fiscalYear,f.provider,naver([]),f.repo,22n);
 assert.equal(f.record().values.per,'10');assert.equal(f.record().values.pbr,'1');
});
