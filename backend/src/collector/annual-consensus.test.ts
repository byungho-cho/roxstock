import test from 'node:test';import assert from 'node:assert/strict';
import {validateConsensus,consensusRatios,fetchAnnualConsensus,settleAnnualConsensus} from './annual-consensus.js';
import type {PrismaClient} from '../generated/prisma/index.js';
const sample={symbol:'005930',fiscalYear:2026,kind:'ANNUAL_ESTIMATE' as const,asOf:'2026-10-08T00:00:00Z',source:'LICENSED_FIXTURE',sourceUrl:'https://provider.example/terms',division:'CFS' as const,ownership:'OWNERS_OF_PARENT' as const,shareClass:'ORDINARY' as const,shareBasisDate:'2026-10-08',eps:'10',bps:'20',netIncome:'20',openingEquity:'180',closingEquity:'220'};
test('estimated annual figures do not accept final or TTM or mixed ownership; missing values remain missing',()=>{
 assert.equal(validateConsensus(sample,'005930',2026).kind,'ANNUAL_ESTIMATE');
 for(const extra of [{kind:'TTM'},{kind:'FINAL_ANNUAL'},{ownership:'TOTAL'},{shareClass:'PREFERRED'},{fiscalYear:2025}])assert.throws(()=>validateConsensus({...sample,...extra},'005930',2026));
 const v=consensusRatios(sample,{value:'100',date:'2026-10-08',source:'FIXTURE'});assert.equal(v.per,'10');assert.equal(v.pbr,'5');assert.equal(v.roe,'10');
 assert.equal(consensusRatios({...sample,eps:null},undefined).per,null);assert.equal(consensusRatios(sample,{value:'100',date:'2026-10-09',source:'FIXTURE'}).per,null);
});
test('year-end close is immutable and final promotion preserves the original estimate payload',async()=>{
 const original={...sample,fiscalYear:2025};let stored:any={state:'ESTIMATED',data:original,frozenClose:null};let writes=0;
 const db={annualConsensusSnapshot:{findFirst:async()=>stored,updateMany:async(q:any)=>{writes++;if(stored.state!==q.where.state)return {count:0};if(q.where.frozenClose&&stored.frozenClose!==null)return {count:0};stored={...stored,...q.data};return {count:1};}}} as unknown as PrismaClient;
 await settleAnnualConsensus(db,1n,2025,{}, {value:'100',date:'2025-12-30',source:'KRX_UNADJUSTED_CLOSE'},false);
 await settleAnnualConsensus(db,1n,2025,{values:{eps:'10',bps:'20',per:'20',pbr:'10'}}, {value:'200',date:'2025-12-30',source:'KRX_UNADJUSTED_CLOSE'},true);
 assert.equal(stored.frozenClose.value,'100');assert.equal(stored.state,'FINALIZED');assert.deepEqual(stored.data,original);assert.equal(stored.finalValues.values.per,'10');assert.equal(stored.finalValues.values.pbr,'5');
 const before=writes;await settleAnnualConsensus(db,1n,2025,{}, {value:'999',date:'2026-10-08',source:'LATEST'},true);assert.equal(writes,before);
});
test('provider collection is gated by verified terms and derives year from Seoul',async()=>{
 const old={approved:process.env.CONSENSUS_TERMS_APPROVED,url:process.env.CONSENSUS_PROVIDER_URL,terms:process.env.CONSENSUS_TERMS_URL};let calls=0;
 try{delete process.env.CONSENSUS_TERMS_APPROVED;await assert.rejects(fetchAnnualConsensus('005930',new Date(),async()=>{calls++;return Response.json(sample);}),/CONSENSUS_TERMS_NOT_APPROVED/);assert.equal(calls,0);
 process.env.CONSENSUS_TERMS_APPROVED='true';process.env.CONSENSUS_TERMS_URL='https://provider.example/terms';process.env.CONSENSUS_PROVIDER_URL='https://provider.example/consensus';
 const value=await fetchAnnualConsensus('005930',new Date('2025-12-31T16:00:00Z'),async input=>{assert.equal(new URL(String(input)).searchParams.get('fiscalYear'),'2026');return Response.json(sample);});assert.equal(value.fiscalYear,2026);
 }finally{for(const [key,value]of [['CONSENSUS_TERMS_APPROVED',old.approved],['CONSENSUS_PROVIDER_URL',old.url],['CONSENSUS_TERMS_URL',old.terms]])if(value===undefined)delete process.env[key!];else process.env[key!]=value;}
});
