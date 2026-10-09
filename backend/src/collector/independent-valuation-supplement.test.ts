import assert from 'node:assert/strict';import test from 'node:test';
import {mergeAnnualSupplement,runIndependentSupplement} from './independent-valuation-supplement.js';
import {dartWindowOpen} from './dart-policy.js';
import type {NaverAnnual} from './naver-annual.js';
import type {PrismaClient} from '../generated/prisma/index.js';
const source={fiscalYear:2022,kind:'FINAL_ANNUAL',values:{eps:'10',bps:'100',per:'5',pbr:'0.5',roe:'8'}} as NaverAnnual;
test('stage 2 preserves existing manual/normal values and rejects incompatible ratio groups',()=>{
 assert.deepEqual(mergeAnnualSupplement(null,source),source.values);
 assert.equal(mergeAnnualSupplement({eps:'20',roe:'9'},source).per,null);assert.equal(mergeAnnualSupplement({eps:'20',roe:'9'},source).roe,'9');
 assert.equal(mergeAnnualSupplement({per:'7'},source).eps,null);assert.equal(mergeAnnualSupplement({per:'7'},source).per,'7');
 assert.equal(mergeAnnualSupplement({eps:'0'},source).eps,'0');assert.equal(mergeAnnualSupplement({eps:'0'},source).per,null);
 assert.equal(mergeAnnualSupplement({eps:'10'},source,{perMetric:{eps:{source:'MANUAL'}}}).per,null);
 assert.equal(mergeAnnualSupplement({eps:'10'},source,{perMetric:{eps:{source:'NAVER_FNGUIDE_ANNUAL',fiscalYear:2022,division:source.division}}}).per,'5');
});
test('weekend all day and weekday night follow Seoul boundary independently of DART enable',()=>{
 assert.equal(dartWindowOpen(new Date('2026-10-10T03:00:00Z'),18,6,[],true),true);
 assert.equal(dartWindowOpen(new Date('2026-10-09T03:00:00Z'),18,6,[],true),false);
 assert.equal(dartWindowOpen(new Date('2026-10-09T12:00:00Z'),18,6,[],true),true);
});
test('disabled independent collector and daytime do not query DB or sources',async()=>{
 const db=new Proxy({}, {get(){throw Error('unexpected DB call');}}) as PrismaClient;
 const prior=process.env.VALUATION_SUPPLEMENT_ENABLED;try{process.env.VALUATION_SUPPLEMENT_ENABLED='false';assert.equal((await runIndependentSupplement(db,{windowStartHour:18,windowEndHour:6})).status,'DISABLED');delete process.env.VALUATION_SUPPLEMENT_ENABLED;assert.equal((await runIndependentSupplement(db,{windowStartHour:18,windowEndHour:6},new Date('2026-10-09T03:00:00Z'))).status,'OUTSIDE_WINDOW');}finally{if(prior===undefined)delete process.env.VALUATION_SUPPLEMENT_ENABLED;else process.env.VALUATION_SUPPLEMENT_ENABLED=prior;}
});
