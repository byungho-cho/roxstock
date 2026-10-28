import test from 'node:test';import assert from 'node:assert/strict';
import {annualWAssessment,summarizeAnnual} from './security-w-readiness.js';
const row=(year:number,periodType='ANNUAL',extra:any={})=>({securityId:1n,fiscalYear:year,periodType,status:'SUCCESS',values:{eps:'10',bps:'100',roe:'10',per:'10',pbr:'1'},provenance:{source:'OPEN_DART',fsDivision:'OFS',currency:'KRW',roeBasis:'TOTAL_SAME_DIVISION',periodEnd:`${year}-12-31`},supplemental:{},...extra}) as any;
const input=(periods:any[],price:string|null='100')=>({year:2026,price,periods,filings:[],manual:[],metrics:[]});
test('annual W exactly reuses W0.8; final and estimate do not substitute for each other or quarters',()=>{
 const f=row(2025),estimate=row(2026,'ESTIMATE',{provenance:{kind:'ANNUAL_ESTIMATE',fsDivision:'OFS',currency:'KRW',roeBasis:'TOTAL_SAME_DIVISION'},supplemental:{manualSource:{kind:'ANNUAL_ESTIMATE',fiscalYear:2026,division:'OFS'}}}),source=input([f,estimate,row(2026,'Q3')]);
 const before=JSON.stringify(source,(_,v)=>typeof v==='bigint'?String(v):v),final=annualWAssessment(source,2025,'final'),estimated=annualWAssessment(source,2026,'estimate');assert.equal(final.w,'1.2');assert.equal(estimated.w,'1.2');assert.equal(final.indicatorReady,true);assert.equal(annualWAssessment(input([f]),2026,'estimate').wReady,false);assert.equal(annualWAssessment(input([estimate]),2025,'final').wReady,false);assert.equal(annualWAssessment(input([row(2026,'Q3')]),2026,'estimate').wReady,false);assert.equal(JSON.stringify(source,(_,v)=>typeof v==='bigint'?String(v):v),before);
});
test('missing EPS is second-stage only, price/basis/currency block W, legitimate nonpositive EPS is NA not missing',()=>{
 const v=row(2025);v.values.eps=null;v.values.per=null;const a=annualWAssessment(input([v]),2025,'final');assert.equal(a.wReady,true);assert.equal(a.indicatorReady,false);assert.deepEqual(a.missingIndicators,['eps','per']);assert.equal(annualWAssessment(input([v],null),2025,'final').wReady,false);
 v.values.eps='-10';const negative=annualWAssessment(input([v]),2025,'final');assert.equal(negative.indicatorReady,true);assert.ok(negative.notApplicable.includes('per'));
 v.provenance.bpsReferenceOnly=true;assert.equal(annualWAssessment(input([v]),2025,'final').wReady,false);delete v.provenance.bpsReferenceOnly;v.provenance.currency='USD';assert.equal(annualWAssessment(input([v]),2025,'final').wReady,false);
});
test('blue includes yellow; both annual buckets use unchanged targets; zero numerator and zero denominator differ',()=>{
 const complete=annualWAssessment(input([row(2025)]),2025,'final'),partial=annualWAssessment(input([row(2025,'ANNUAL',{values:{eps:null,bps:'100',roe:'10',per:null,pbr:'1'}})]),2025,'final'),missing=annualWAssessment(input([]),2025,'final');
 const s=summarizeAnnual([{excludedReason:null,assessment:complete},{excludedReason:null,assessment:partial},{excludedReason:null,assessment:missing},{excludedReason:'ETF',assessment:complete}]);assert.deepEqual({target:s.target,wReady:s.wReady,wMissing:s.wMissing,indicatorMissing:s.indicatorMissing,fullyReady:s.fullyReady},{target:3,wReady:2,wMissing:1,indicatorMissing:1,fullyReady:1});assert.equal(s.wReady,s.fullyReady+s.indicatorMissing);assert.equal(summarizeAnnual([{excludedReason:null,assessment:missing}]).wRate,0);assert.equal(summarizeAnnual([]).wRate,null);
 const zero=row(2025);zero.values.bps='0';assert.equal(annualWAssessment(input([zero]),2025,'final').w,'0');
});
