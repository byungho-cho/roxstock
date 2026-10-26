import assert from 'node:assert/strict';
import test from 'node:test';
import {planFinancialFill,parseFillTargets,fieldPlanFingerprint,type FillTarget,type FillState,type FillEvidence} from './financial-fill-plan.js';

function fixture(eps='-2',equity='100'){
 const receiptNo='20260318001655',target:FillTarget={symbol:'056730',year:2025,period:'ANNUAL',receiptNo,fields:['eps','bps','roe','per','pbr']};
 const sources:any={basicEps:{amount:eps,ordinaryEpsVerified:true},totalAssets:{amount:String(Number(equity)+100)},totalLiabilities:{amount:'100'},totalEquity:{amount:equity},netIncome:{amount:'-20'},revenue:{amount:'300'}};
 const f:any={id:'1',securityId:'1',fiscalYear:2025,periodType:'ANNUAL',receiptNo,reportCode:'11011',fsDivision:'OFS',periodEndDate:'2025-12-31T00:00:00.000Z',receiptDate:'2026-03-18T00:00:00.000Z',collectedAt:'2026-03-18T00:00:00.000Z',currency:'KRW',accountSources:sources,totalAssets:sources.totalAssets.amount,totalLiabilities:'100',totalEquity:equity,netIncomeYtd:'-20',revenueYtd:'300',normalizationVersion:3,isWithdrawn:false};
 const supplemental:any={accounts:{currency:'KRW',receiptNo,fsDivision:'OFS',collectedAt:'2026-03-18T00:00:00.000Z',sources},shares:{receiptNo,outstanding:'10',preferred:false},price:{value:'100',date:'2025-12-30',source:'KIS_KRX_UNADJUSTED_CLOSE'},basis:{receiptNo,epsPriceCompatible:true,bpsPriceCompatible:true},fiscalDuration:{method:'DART_MAJOR_ACCOUNTS_MATCH',receiptNo,fsDivision:'OFS',start:'2025-01-01',end:'2025-12-31',months:12,openingDate:'2024-12-31',openingEquity:'100',verifiedAt:'2026-03-18T00:00:00.000Z'}};
 const evidence:FillEvidence={symbol:target.symbol,receiptNo,supplemental};
 const state:FillState={security:{id:'1',symbol:target.symbol,securityType:'STOCK',collectionExcluded:false,collectionRevision:0,codeRevision:0,excludedFeatures:[],dartCorpMapping:{corpCode:'00318662'}},filings:[f],valuations:[]};
 return {target,state,evidence};
}
test('negative, zero and positive denominators retain signed bases and distinguish normal non-applicability',async()=>{
 for(const eps of ['-2','0','2'])for(const equity of ['-20','0','100']){
  const f=fixture(eps,equity),p=await planFinancialFill(f.target,f.state,f.evidence),get=(k:string)=>p.fields.find(v=>v.field===k)!;
  assert.equal(get('eps').candidate,eps);assert.equal(get('bps').candidate,String(Number(equity)/10));
  assert.equal(get('per').disposition,Number(eps)<=0?'NOT_APPLICABLE':'SAVE');assert.equal(get('pbr').disposition,Number(equity)<=0?'NOT_APPLICABLE':'SAVE');
  assert.equal(p.data!.values.eps,eps);assert.equal(p.data!.values.bps,String(Number(equity)/10));
 }
});
test('a missing EPS holds EPS/PER only, while valid BPS, PBR and ROE save independently',async()=>{
 const f=fixture();delete (f.state.filings[0].accountSources as any).basicEps;
 delete f.evidence.supplemental.accounts!.sources.basicEps;
 const p=await planFinancialFill(f.target,f.state,f.evidence);
 assert.deepEqual(p.fields.filter(f=>f.disposition==='SAVE').map(f=>f.field),['bps','roe','pbr']);
 assert.equal(p.data!.values.eps,null);assert.equal(p.data!.values.per,null);
});
test('common identity, original anchors and currency conflicts block all new fields',async()=>{
 for(const mutate of [(f:ReturnType<typeof fixture>)=>f.evidence.supplemental.accounts!.receiptNo='wrong',(f:ReturnType<typeof fixture>)=>f.evidence.supplemental.accounts!.currency='USD',(f:ReturnType<typeof fixture>)=>f.evidence.supplemental.accounts!.sources.totalEquity={amount:'200'}]){
  const f=fixture();f.evidence=structuredClone(f.evidence);mutate(f);const p=await planFinancialFill(f.target,f.state,f.evidence);assert.equal(p.expectedSaves,0);assert.equal(p.data,null);assert.ok(p.fields.every(f=>f.disposition==='HOLD'));
 }
});
test('existing manual values and evidence remain exact; replay skips completed fields, independent of order',async()=>{
 const f=fixture();const provenance={perMetric:{eps:{source:'MANUAL',receiptNo:f.target.receiptNo,fsDivision:'OFS',periodEnd:'2025-12-31'}}};
 f.state.valuations=[{securityId:'1',fiscalYear:2025,periodType:'ANNUAL',status:'PARTIAL',values:{eps:'-999'},supplemental:{},provenance,reasons:{}}];
 const p=await planFinancialFill(f.target,f.state,f.evidence);assert.equal(p.data!.values.eps,'-999');assert.deepEqual(p.data!.provenance.perMetric.eps,provenance.perMetric.eps);
 const reverse=await planFinancialFill({...f.target,fields:[...f.target.fields].reverse()},f.state,f.evidence);assert.deepEqual(p.data!.values,reverse.data!.values);
 f.state.valuations=[{...f.state.valuations[0],...p.data}];const repeat=await planFinancialFill(f.target,f.state,f.evidence);assert.equal(repeat.expectedSaves,0);assert.equal(repeat.data,null);
});
test('invalid duration holds flow metrics without suppressing point-in-time BPS; actual non-December year is accepted',async()=>{
 const f=fixture('2');f.evidence.supplemental.fiscalDuration!.months=6;
 const p=await planFinancialFill(f.target,f.state,f.evidence);assert.equal(p.fields.find(f=>f.field==='eps')!.disposition,'HOLD');assert.equal(p.fields.find(f=>f.field==='bps')!.disposition,'SAVE');
 f.state.filings[0].periodEndDate='2025-06-30T00:00:00.000Z';f.evidence.supplemental.fiscalDuration={...f.evidence.supplemental.fiscalDuration!,start:'2024-07-01',end:'2025-06-30',months:12,openingDate:'2024-06-30'};f.evidence.supplemental.price!.date='2025-06-30';
 const valid=await planFinancialFill(f.target,f.state,f.evidence);assert.equal(valid.fields.find(f=>f.field==='eps')!.candidate,'2');
});
test('CSV scope and fields are explicit; calculated timestamps alone do not stale an approved plan',()=>{
 const h='symbol,fiscal_year,period,category,missing_fields,receipt_no\n';assert.equal(parseFillTargets(h+'056730,2025,ANNUAL,DEVELOPMENT_WAIT,eps|per,20260318001655\n').length,1);
 assert.throws(()=>parseFillTargets(h+'056730,2024,ANNUAL,DEVELOPMENT_WAIT,eps,20260318001655\n'));
 assert.throws(()=>parseFillTargets(h+'056730,2025,ANNUAL,DEVELOPMENT_WAIT,unknown,20260318001655\n'));
 assert.equal(fieldPlanFingerprint({value:'3',source:{receiptNo:'a',calculatedAt:'before'}}),fieldPlanFingerprint({value:'3',source:{receiptNo:'a',calculatedAt:'after'}}));
 assert.notEqual(fieldPlanFingerprint({value:'3'}),fieldPlanFingerprint({value:'4'}));
});
test('unordered old and corrected filing rows always calculate against the latest exact receipt',async()=>{
 const f=fixture('2'),older=structuredClone(f.state.filings[0]);older.receiptNo='20260317000001';older.receiptDate='2026-03-17T00:00:00.000Z';older.accountSources.basicEps.amount='999';
 f.state.filings.unshift(older);
 const result=await planFinancialFill(f.target,f.state,f.evidence);assert.equal(result.fields.find(f=>f.field==='eps')!.candidate,'2');assert.equal(result.fields.find(f=>f.field==='eps')!.source.receiptNo,f.target.receiptNo);
 f.state.filings.reverse();const reversed=await planFinancialFill(f.target,f.state,f.evidence);assert.deepEqual(result.data!.values,reversed.data!.values);
});
test('incomplete preferred-share evidence can be enriched only by matching dated reconciled rows',async()=>{
 const f=fixture();f.target.fields=['bps','pbr'];const receiptNo=f.target.receiptNo;
 f.state.valuations=[{securityId:'1',fiscalYear:2025,periodType:'ANNUAL',status:'PARTIAL',values:{eps:'-2'},provenance:{},reasons:{},supplemental:{shares:{receiptNo,outstanding:'10',preferred:true}}}];
 const row=(shareClass:string,n:string)=>({stockKind:shareClass,shareClass,outstandingShares:n,issuedShares:n,treasuryShares:'0',periodEndDate:'2025-12-31'});
 f.evidence.supplemental.shares={receiptNo,outstanding:'10',preferred:true,collectedAt:'2026-03-19T00:00:00Z',rows:[row('COMMON','10'),row('PREFERRED','2'),row('TOTAL','12')]};
 const result=await planFinancialFill(f.target,f.state,f.evidence);assert.equal(result.expectedSaves,2);assert.equal(result.data!.provenance.perMetric.bps.bpsReferenceOnly,true);assert.equal(result.data!.supplemental.shares.rows.length,3);
 for(const change of ['different-count','different-period','older']){
  const altered=structuredClone(f);
  if(change==='different-count')altered.state.valuations[0].supplemental.shares.outstanding='9';
  if(change==='different-period')altered.evidence.supplemental.shares!.rows![0]!.periodEndDate='2024-12-31';
  if(change==='older')altered.state.valuations[0].supplemental.shares.collectedAt='2026-03-20T00:00:00Z';
  assert.equal((await planFinancialFill(altered.target,altered.state,altered.evidence)).expectedSaves,0);
 }
});
