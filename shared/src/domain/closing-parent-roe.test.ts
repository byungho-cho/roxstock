import {Prisma} from '../generated/prisma/index.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {closingParentRoe,closingRoeReview,closingRoeNotices,closingParentRoePolicy} from './closing-parent-roe.js';
const f=(profit='10',equity='100')=>({periodType:'ANNUAL',fsDivision:'CFS',receiptNo:'20260301000001',periodEndDate:new Date('2025-12-31'),accountSources:{parentNetIncome:{amount:profit,ytdAmount:profit},parentEquity:{amount:equity}}}) as any;
test('closing parent annual ROE accepts loss and zero; rejects absent or nonpositive equity and mixed scope',()=>{assert.equal(closingParentRoe(f())!.value,'10');assert.equal(closingParentRoe(f('-10'))!.value,'-10');assert.equal(closingParentRoe(f('0'))!.value,'0');for(const eq of ['0','-1'])assert.equal(closingParentRoe(f('10',eq)),null);assert.equal(closingParentRoe({...f(),periodType:'Q2'}),null);assert.equal(closingParentRoe({...f(),fsDivision:'OFS'}),null);assert.equal(closingParentRoe({...f(),accountSources:{}}),null);});
test('1pp boundary both directions, no extra previous value below threshold, and warnings carry exact receipt',()=>{assert.equal(closingRoeReview('10','10.9999','r'),null);assert.equal(closingRoeReview(null,'10','r'),null);for(const next of ['9','11']){const review=closingRoeReview('10',next,'r')!;assert.equal(review.previousRoe,'10');const p={perMetric:{roe:{roePolicy:closingParentRoePolicy,receiptNo:'r',roeReview:review}}};assert.match(closingRoeNotices(p)[0]!,/투자 주의/);assert.deepEqual(closingRoeNotices({perMetric:{roe:{...p.perMetric.roe,receiptNo:'other'}}}),[]);}});

test('matched supplemental derived parent equity enables closing ROE without altering originals',()=>{
 const filing={...f('-2671697096','100'),totalEquity:new Prisma.Decimal('34184546979'),accountSources:{parentNetIncome:{amount:'-2671697096'}}} as any;
 const extra={accounts:{receiptNo:filing.receiptNo,fsDivision:'CFS',currency:'KRW',sources:{parentEquity:{amount:'32694408672',periodEnd:'2025-12-31',derivation:{method:'EXACT_SAME_STATEMENT_EQUITY_MINUS_NCI',receiptNo:filing.receiptNo,currency:'KRW',operands:[{accountId:'ifrs-full_Equity',amount:'34184546979'},{accountId:'ifrs-full_NoncontrollingInterests',amount:'1490138307'}]}}}}};
 const original=JSON.stringify([filing,extra]);assert.equal(closingParentRoe(filing),null);const result=closingParentRoe(filing,extra)!;assert.equal(result.value,'-8.1717');assert.equal(result.inputEvidence?.source,'MATCHED_DART_SUPPLEMENTAL_ACCOUNTS');assert.equal(JSON.stringify([filing,extra]),original);
 for(const mutate of [(x:any)=>x.accounts.receiptNo='other',(x:any)=>x.accounts.fsDivision='OFS',(x:any)=>x.accounts.currency='USD',(x:any)=>x.accounts.sources.parentEquity.periodEnd='2024-12-31',(x:any)=>x.accounts.sources.parentEquity.derivation.currency='USD',(x:any)=>x.accounts.sources.parentEquity.derivation.operands[1].amount='1',(x:any)=>x.accounts.sources.parentEquity.derivation.operands.push(x.accounts.sources.parentEquity.derivation.operands[0])]){const invalid=JSON.parse(JSON.stringify(extra));mutate(invalid);assert.equal(closingParentRoe(filing,invalid),null);}
 assert.equal(closingParentRoe({...filing,totalEquity:new Prisma.Decimal('1')},extra),null);
});
test('direct sources win; matched supplemental income and capital accept zero, reject unsupported derivation',()=>{
 const extra={accounts:{receiptNo:f().receiptNo,fsDivision:'CFS',currency:'KRW',sources:{parentNetIncome:{amount:'0'},parentEquity:{amount:'100'}}}};
 assert.equal(closingParentRoe(f(),extra)!.value,'10');assert.equal(closingParentRoe({...f(),accountSources:{}},extra)!.value,'0');
 assert.equal(closingParentRoe({...f(),accountSources:{}},{accounts:{...extra.accounts,sources:{...extra.accounts.sources,parentEquity:{amount:'100',derivation:{method:'UNKNOWN'}}}}}),null);
 assert.equal(closingParentRoe({...f(),accountSources:{parentEquity:{amount:'invalid'}}},extra),null);
});

test('validated owner capital components require exact totals, receipt, source and unique operands',()=>{
 const f:any={periodType:'ANNUAL',fsDivision:'CFS',receiptNo:'r',periodEndDate:new Date('2025-12-31'),totalEquity:new Prisma.Decimal('1200'),accountSources:{parentNetIncome:{amount:'100'}}};
 const d:any={method:'DART_PUBLIC_OWNER_CAPITAL_COMPONENTS_RECONCILED',calculation:'DECLARED_OWNER_COMPONENTS_SUM',receiptNo:'r',end:'2025-12-31',unit:'원',totalEquity:'1200',nonControlling:'200',components:[{label:'자본금',current:'400'},{label:'자본잉여금',current:'300'},{label:'이익잉여금',current:'300'}],sourceUrl:'https://dart.fss.or.kr/report/viewer.do?rcpNo=r',contentSha256:'a'.repeat(64)},sup:any={accounts:{receiptNo:'r',fsDivision:'CFS',currency:'KRW',sources:{parentEquity:{amount:'1000',derivation:d}}}};
 assert.equal(closingParentRoe(f,sup)?.value,'10');
 for(const label of ['이익잉여금(결손금)','결손금']){const alias=structuredClone(sup);alias.accounts.sources.parentEquity.derivation.components[2].label=label;assert.equal(closingParentRoe(f,alias)?.value,'10');}
 const other=structuredClone(sup);other.accounts.sources.parentEquity.derivation.components[2].label='영업이익';assert.equal(closingParentRoe(f,other),null);
 const duplicate=structuredClone(sup);duplicate.accounts.sources.parentEquity.derivation.components[1].label='이익잉여금(결손금)';assert.equal(closingParentRoe(f,duplicate),null);
 for(const edit of[(x:any)=>x.components[0].current='401',(x:any)=>x.nonControlling='201',(x:any)=>x.receiptNo='other',(x:any)=>x.contentSha256='bad',(x:any)=>x.components[1].label='자본금',(x:any)=>x.unit='천원']){const s=structuredClone(sup);edit(s.accounts.sources.parentEquity.derivation);assert.equal(closingParentRoe(f,s),null);}
});

test('standalone closing-equity ROE caution is visible and never labelled parent equity',()=>{const p={perMetric:{roe:{roePolicy:'CLOSING_STANDALONE_EQUITY_REFERENCE_V1',receiptNo:'r',fsDivision:'OFS',roeReview:closingRoeReview('-26.5553','-20.3172','r')}}};assert.match(closingRoeNotices(p)[0]!,/별도 자본/);assert.doesNotMatch(closingRoeNotices(p)[0]!,/지배주주 자본/);});

test('claimed public native supplemental accounts cannot bypass source proof validation',()=>{const filing={...f(),accountSources:{parentEquity:{amount:'100'}}};const sup={accounts:{receiptNo:filing.receiptNo,fsDivision:'CFS',currency:'KRW',sources:{parentNetIncome:{source:'DART_PUBLIC_NATIVE_PARENT_ACCOUNT',amount:'10',currency:'KRW',periodEnd:'2025-12-31',amountMultiplier:'1'}}}};assert.equal(closingParentRoe(filing,sup),null);});
