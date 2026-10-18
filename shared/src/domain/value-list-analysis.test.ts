import test from 'node:test';import assert from 'node:assert/strict';
import {Prisma} from '../generated/prisma/index.js';import {selectValueListAnalysis,orderValueGroups,shareholderTotals} from './value-list-analysis.js';
const p=(year:number,periodType='ANNUAL',extra:any={})=>({fiscalYear:year,periodType,status:'SUCCESS',values:{eps:'10',bps:'100',roe:'10',per:null,pbr:null},provenance:{source:'OPEN_DART',fsDivision:'OFS',roeBasis:'TOTAL_SAME_DIVISION',periodEnd:`${year}-12-31`},supplemental:{},...extra}) as any;
const input=(periods:any[]=[],filings:any[]=[],manual:any[]=[])=>({year:2026,price:'100',metrics:[],periods,filings,manual});
test('selected annual estimate then previous final, quarter/older excluded; failed retained values remain usable',()=>{
 const estimate=p(2026,'ESTIMATE',{provenance:{kind:'ANNUAL_ESTIMATE',fsDivision:'CFS',roeBasis:'OWNERS_OF_PARENT'},supplemental:{manualSource:{kind:'ANNUAL_ESTIMATE',fiscalYear:2026}}});
 assert.equal(selectValueListAnalysis(input([estimate,p(2025)])).dataPriority,1);
 assert.equal(selectValueListAnalysis(input([p(2025,'ANNUAL',{status:'FAILED'})])).dataPriority,2);
 for(const rows of [[p(2026,'Q2')],[p(2024)],[p(2026)]])assert.equal(selectValueListAnalysis(input(rows)).dataPriority,3);
 const empty=p(2026,'ESTIMATE',{values:{eps:null,bps:null,roe:null},supplemental:{manualSource:{kind:'ANNUAL_ESTIMATE',fiscalYear:2026}}});assert.equal(selectValueListAnalysis(input([empty,p(2025)])).dataPriority,2);
});
test('W order is global across source groups; missing last including negative and zero',()=>{
 const rows=[{id:'3',symbol:'3',dataPriority:2,w:'99'},{id:'2',symbol:'2',dataPriority:1,w:null},{id:'1',symbol:'1',dataPriority:1,w:'0'},{id:'4',symbol:'4',dataPriority:3,w:'100'},{id:'5',symbol:'5',dataPriority:1,w:'-1'}];assert.deepEqual(orderValueGroups(rows).map(r=>r.id),['4','3','1','5','2']);
});
function basis(equity='1000',roe='10'){
 const f={fiscalYear:2025,periodType:'ANNUAL',receiptNo:'r',fsDivision:'OFS',periodEndDate:new Date('2025-12-31'),isWithdrawn:false,totalEquity:new Prisma.Decimal(equity),accountSources:{}} as any;
 const row=p(2025,'ANNUAL',{provenance:{source:'OPEN_DART',receiptNo:'r',periodEnd:'2025-12-31',fsDivision:'OFS',roeBasis:'TOTAL_SAME_DIVISION',bpsBasis:'OFS_TOTAL_EQUITY_DIV_PERIOD_END_OUTSTANDING_NO_PREFERRED',sharesReceiptNo:'r'},supplemental:{shares:{receiptNo:'r',preferred:false,outstanding:'10'}}});
 const metric={eps:null,per:null,pbr:null,bps:new Prisma.Decimal(equity).div(10).toString(),roe,metricDate:'2025-12-31',rimCompatible:true};return {f,row,metric};
}
test('Decimal totals normal negative zero and share price equality without modifying existing RIM',()=>{
 for(const [capital,roe,total,excess] of [['1000','10','1200','20'],['1000','-10','-800','-180'],['0','10','0','0'],['-1000','10','-1200','-20']] ){
  const b=basis(capital,roe),r=shareholderTotals(b.metric,b.row,[b.f]);assert.equal(r.shareholderValue,total);assert.equal(r.excessEarnings,excess);assert.equal(r.rimComparison?.difference,'0');
 }
});
test('missing, mixed period/division/share class/provider/receipt/BPS never fabricate a total',()=>{
 const b=basis();for(const edit of [(x:any)=>x.row.provenance.receiptNo='other',(x:any)=>x.row.provenance.fsDivision='CFS',(x:any)=>x.row.supplemental.shares.preferred=true,(x:any)=>x.row.provenance.source='NAVER_FNGUIDE_ANNUAL',(x:any)=>x.metric.bps='101',(x:any)=>x.row.supplemental.shares.outstanding=null]){const x=basis();edit(x);assert.equal(shareholderTotals(x.metric,x.row,[x.f]).shareholderValue,null);}
 assert.equal(shareholderTotals(null,b.row,[b.f]).shareholderValue,null);
});
test('parent attribution evidence is required for CFS; no old year equity substitution',()=>{
 const b=basis();b.f.fsDivision='CFS';b.f.totalEquity=new Prisma.Decimal(5000);b.f.accountSources={parentEquity:{amount:'1000'}};Object.assign(b.row.provenance,{fsDivision:'CFS',roeBasis:'OWNERS_OF_PARENT',bpsBasis:'OWNERS_EQUITY_DIV_PERIOD_END_OUTSTANDING_NO_PREFERRED'});
 assert.equal(shareholderTotals(b.metric,b.row,[b.f]).shareholderValue,'1200');b.f.fiscalYear=2024;assert.equal(shareholderTotals(b.metric,b.row,[b.f]).shareholderValue,null);
});


test('December 31 legacy metrics without annual evidence are not annual data',()=>{
 const i=input();Object.assign(i,{metrics:[{metricDate:new Date('2025-12-31'),bps:new Prisma.Decimal(100),roe:new Prisma.Decimal(10)}]});assert.equal(selectValueListAnalysis(i).dataPriority,3);
});

test('verified RIM totals preserve fractional won above 18 integer digits locally without changing price precision',()=>{
 const b=basis('1000000000000000000.1234','10');b.metric.bps='100000000000000000.0123';
 const r=shareholderTotals(b.metric,b.row,[b.f]);assert.equal(r.excessEarnings,'20000000000000000.002468');assert.equal(r.shareholderValue,'1200000000000000000.14808');assert.equal(r.rimComparison?.perShare,'120000000000000000.014808');
});

test('same annual estimate source proves parent-equity totals independently; missing adjusted shares cannot fabricate a per-share match',()=>{
 const row=p(2026,'ESTIMATE',{provenance:{periodEnd:'2026-12-31',fsDivision:'CFS',roeBasis:'OWNERS_OF_PARENT',perMetric:{roe:{source:'NAVER_FNGUIDE_ANNUAL',kind:'ANNUAL_ESTIMATE',fiscalYear:2026,division:'CFS'}}},supplemental:{manualSource:{source:'NAVER_FNGUIDE_ANNUAL',kind:'ANNUAL_ESTIMATE',fiscalYear:2026,division:'CFS',values:{roe:'102.88'},financials:{parentEquity:'373868000000000'}},estimateFinancials:{parentEquity:'373868000000000'}}});
 const metric={metricDate:'2026-12-31',bps:'526869.36',roe:'102.88',eps:null,per:null,pbr:null,rimCompatible:true};
 const r=shareholderTotals(metric,row,[]);assert.equal(r.excessEarnings,'354725958400000');assert.equal(r.shareholderValue,'3921127584000000');assert.equal(r.rimComparison?.perShare,null);assert.equal(r.rimComparison?.existingW08,'5525805.84768');assert.equal(r.rimBasis?.shares,null);assert.equal(r.rimReason,null);
 for(const change of [(x:any)=>x.supplemental.estimateFinancials.parentEquity='120666751000000',(x:any)=>x.supplemental.manualSource.fiscalYear=2025,(x:any)=>x.provenance.roeBasis='TOTAL_SAME_DIVISION',(x:any)=>x.supplemental.manualSource.values.roe='44.15']){const copy=JSON.parse(JSON.stringify(row));change(copy);assert.equal(shareholderTotals(metric,copy,[]).shareholderValue,null);}
});

test('annual estimate never fills missing EPS or financial amounts from prior annual/quarter data',()=>{
 const estimate=p(2026,'ESTIMATE',{values:{eps:null,bps:'100',roe:'0'},provenance:{periodEnd:'2026-12-31',fsDivision:'OFS'},supplemental:{manualSource:{kind:'ANNUAL_ESTIMATE',fiscalYear:2026,division:'OFS',source:'NAVER_FNGUIDE_ANNUAL',values:{bps:'100',roe:'0'},financials:{netIncome:'-50',totalEquity:'0'}},estimateFinancials:{netIncome:'-50',totalEquity:'0'}}});
 const selected=selectValueListAnalysis(input([estimate,p(2025)],[{fiscalYear:2025,periodType:'ANNUAL',totalEquity:new Prisma.Decimal(500),netIncomeYtd:new Prisma.Decimal(999)} as any]));
 assert.equal(selected.metricBasis.year,2026);assert.equal(selected.eps,null);assert.equal(selected.roe,'0');assert.equal(selected.netIncome,'-50');assert.equal(selected.capital,'0');assert.equal(selected.capitalBasis?.year,2026);
 const mismatch=structuredClone(estimate);mismatch.values.eps='20';mismatch.supplemental.manualSource.values.eps='10';assert.equal(selectValueListAnalysis(input([mismatch])).eps,null);
});

test('same-provider final annual totals use final parent equity and ROE without inventing adjusted shares',()=>{
 const row=p(2025,'ANNUAL',{provenance:{periodEnd:'2025-12-31',fsDivision:'CFS',roeBasis:'OWNERS_OF_PARENT',perMetric:{roe:{source:'NAVER_FNGUIDE_ANNUAL',kind:'FINAL_ANNUAL',fiscalYear:2025,division:'CFS'}}},supplemental:{manualSource:{source:'NAVER_FNGUIDE_ANNUAL',kind:'FINAL_ANNUAL',fiscalYear:2025,division:'CFS',values:{roe:'10'},financials:{parentEquity:'1000'}},estimateFinancials:{parentEquity:'9999'}}});
 const metric={metricDate:'2025-12-31',bps:'100',roe:'10',eps:null,per:null,pbr:null,rimCompatible:true};
 const r=shareholderTotals(metric,row,[]);assert.equal(r.excessEarnings,'20');assert.equal(r.shareholderValue,'1200');assert.equal(r.rimBasis?.isEstimated,false);assert.equal(r.rimBasis?.period,'ANNUAL');assert.equal(r.rimComparison?.perShare,null);assert.equal(r.rimBasis?.shares,null);
 for(const edit of [(x:any)=>x.supplemental.manualSource.kind='ANNUAL_ESTIMATE',(x:any)=>x.supplemental.manualSource.fiscalYear=2024,(x:any)=>x.supplemental.manualSource.financials.parentEquity=null,(x:any)=>x.supplemental.manualSource.values.roe='11',(x:any)=>x.provenance.perMetric.roe.source='OPEN_DART',(x:any)=>x.provenance.perMetric.roe.division='OFS',(x:any)=>x.periodType='Q2']){const copy=structuredClone(row);edit(copy);assert.equal(shareholderTotals(metric,copy,[]).shareholderValue,null);}
 const wrongBasis={...metric,rimCompatible:false};assert.equal(shareholderTotals(wrongBasis,row,[]).shareholderValue,null);
});

test('retained total-income ROE cannot inherit newer parent-attribution provenance for RIM',()=>{
 const row=p(2025,'ANNUAL',{provenance:{periodEnd:'2025-12-31',fsDivision:'CFS',roeBasis:'OWNERS_OF_PARENT',perMetric:{roe:{fsDivision:'CFS',roeBasis:'TOTAL_SAME_DIVISION',periodEnd:'2025-12-31'}}}});
 const r=selectValueListAnalysis(input([row]));assert.equal(r.targetPrice,null);assert.equal(r.w,null);assert.equal(r.missingReasons.targetPrice,'RIM_BASIS_UNCONFIRMED');
});

test('existing manual annual-estimate provenance keeps annual values but rejects interim markers',()=>{
 const estimate=p(2026,'ESTIMATE',{values:{eps:'0',bps:'100',roe:'-10'},provenance:{periodEnd:'2026-12-31',fsDivision:'OFS',perMetric:Object.fromEntries(['eps','bps','roe'].map(k=>[k,{kind:'ANNUAL_ESTIMATE',fiscalYear:2026,division:'OFS',periodType:'ANNUAL'}]))},supplemental:{manualSource:{kind:'ANNUAL_ESTIMATE',fiscalYear:2026,division:'OFS',values:{eps:'0',bps:'100',roe:'-10'}}}});
 const valid=selectValueListAnalysis(input([estimate]));assert.equal(valid.eps,'0');assert.equal(valid.roe,'-10');
 estimate.provenance.perMetric.eps.periodType='Q2';assert.equal(selectValueListAnalysis(input([estimate])).eps,null);
});

test('legacy v1 receipt link is accepted only with the original share basis and capital/BPS reconciliation',()=>{
 const b=basis();Object.assign(b.row.provenance,{version:1});delete b.row.provenance.sharesReceiptNo;
 assert.equal(shareholderTotals(b.metric,b.row,[b.f]).shareholderValue,'1200');
 for(const edit of [(x:any)=>x.row.provenance.version=2,(x:any)=>x.row.provenance.sharesReceiptNo='other',(x:any)=>x.row.supplemental.shares.receiptNo='other',(x:any)=>x.row.supplemental.shares.outstanding='11',(x:any)=>x.row.supplemental.shares.preferred=true]){
  const x=basis();Object.assign(x.row.provenance,{version:1});delete x.row.provenance.sharesReceiptNo;edit(x);assert.equal(shareholderTotals(x.metric,x.row,[x.f]).shareholderValue,null);
 }
});

// A legacy spelling must never become permission to use a mismatching denominator.
test('legacy OFS generic BPS label reconciles exact annual capital and common shares',()=>{
 const b=basis();Object.assign(b.row.provenance,{version:1,bpsBasis:'OWNERS_EQUITY_DIV_PERIOD_END_OUTSTANDING_NO_PREFERRED'});delete b.row.provenance.sharesReceiptNo;
 assert.equal(shareholderTotals(b.metric,b.row,[b.f]).shareholderValue,'1200');
 b.row.supplemental.shares.outstanding='11';assert.equal(shareholderTotals(b.metric,b.row,[b.f]).shareholderValue,null);
 b.row.supplemental.shares.outstanding='10';b.row.provenance.version=2;assert.equal(shareholderTotals(b.metric,b.row,[b.f]).shareholderValue,null);
});

test('reconciled fiscal KIS gaps participate in RIM only with the exact original DART receipt and share denominator',()=>{
 const b=basis();const evidence={...b.row.provenance,source:'KIS_API',validation:'DART_BALANCE_AND_FLOW_RECONCILED',fiscalYear:2025,periodType:'ANNUAL',stacYymm:'202512'};
 b.row.provenance.perMetric={bps:evidence,roe:evidence};b.row.supplemental.kisAnnual={source:'KIS_API',fiscalYear:2025,periodEnd:'2025-12-31',currency:'KRW',matchedReceiptNo:'r',matchedDivision:'OFS',bps:'100',roe:'10'};
 assert.equal(shareholderTotals(b.metric,b.row,[b.f]).shareholderValue,'1200');assert.equal(shareholderTotals(b.metric,b.row,[b.f]).rimBasis?.source,'OPEN_DART/KIS_API');
 b.row.supplemental.kisAnnual.fiscalYear=2024;assert.equal(shareholderTotals(b.metric,b.row,[b.f]).shareholderValue,null);
 b.row.supplemental.kisAnnual.fiscalYear=2025;b.metric.bps=null as any;assert.equal(shareholderTotals(b.metric,b.row,[b.f]).shareholderValue,null);
});

test('combined-class reference BPS remains visible but cannot produce RIM prices or totals',()=>{
 const b=basis();b.row.provenance.bpsReferenceOnly=true;b.row.provenance.bpsBasis='OWNERS_EQUITY_DIV_ALL_OUTSTANDING_REFERENCE';b.row.supplemental.shares.preferred=true;
 const r=selectValueListAnalysis(input([b.row],[b.f]));assert.equal(r.metric?.bps,'100');assert.equal(r.metric?.rimCompatible,false);assert.equal(r.targetPrice,null);assert.equal(r.shareholderValue,null);
});
