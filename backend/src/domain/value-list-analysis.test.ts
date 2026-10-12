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
test('group order precedes W; missing last including negative and zero',()=>{
 const rows=[{id:'3',symbol:'3',dataPriority:2,w:'99'},{id:'2',symbol:'2',dataPriority:1,w:null},{id:'1',symbol:'1',dataPriority:1,w:'0'},{id:'4',symbol:'4',dataPriority:3,w:'100'},{id:'5',symbol:'5',dataPriority:1,w:'-1'}];assert.deepEqual(orderValueGroups(rows).map(r=>r.id),['1','5','2','3','4']);
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
