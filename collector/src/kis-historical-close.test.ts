import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {kisHistoricalClose,verifyPeriodPriceBasis} from './kis-historical-close.js';
import {calculatePeriod} from '@roxstock/shared/domain/period-valuation';
import {Prisma} from '@roxstock/shared/prisma';
const tokenDirectory=await mkdtemp(join(tmpdir(),'roxstock-price-token-test-'));
const previousDirectory=process.env.KIS_TOKEN_CACHE_DIR;process.env.KIS_TOKEN_CACHE_DIR=tokenDirectory;
test.after(async()=>{if(previousDirectory===undefined)delete process.env.KIS_TOKEN_CACHE_DIR;else process.env.KIS_TOKEN_CACHE_DIR=previousDirectory;await rm(tokenDirectory,{recursive:true,force:true});});
test('KIS requests original KRX period-end close and separately checks adjusted share basis',async()=>{
 const old=[process.env.KIS_APP_KEY,process.env.KIS_APP_SECRET];process.env.KIS_APP_KEY='period-test';process.env.KIS_APP_SECRET='never-print';
 try{
  const queries:URL[]=[];let changed=false;
  const fetcher:typeof fetch=async input=>{const u=new URL(String(input));if(u.pathname.endsWith('tokenP'))return Response.json({access_token:'private',expires_in:86400});queries.push(u);assert.equal(u.searchParams.get('FID_COND_MRKT_DIV_CODE'),'J');assert.equal(u.searchParams.get('FID_PERIOD_DIV_CODE'),'D');assert.equal(u.searchParams.get('FID_INPUT_ISCD'),'008420');assert.equal(u.searchParams.get('FID_INPUT_DATE_2'),'20251231');return Response.json({rt_cd:'0',output1:{stck_shrn_iscd:'008420'},output2:[{stck_bsop_date:'20260102',stck_clpr:'9999'},{stck_bsop_date:'20251230',stck_clpr:changed&&u.searchParams.get('FID_ORG_ADJ_PRC')==='0'?'100':'200'}]});};
  const price=await kisHistoricalClose('008420',new Date('2025-12-31'),fetcher);assert.equal(price?.value,'200');assert.equal(price?.date,'2025-12-30');assert.equal(price?.source,'KIS_KRX_UNADJUSTED_CLOSE');assert.equal(price?.shareBasis,'ORIGINAL_EQUALS_ADJUSTED');assert.deepEqual(queries.map(u=>u.searchParams.get('FID_ORG_ADJ_PRC')),['1','0']);
  changed=true;const mismatch=await kisHistoricalClose('008420',new Date('2025-12-31'),fetcher);assert.equal(mismatch?.shareBasis,'CORPORATE_ACTION_BASIS_UNCONFIRMED');
  const f:any={receiptNo:'receipt',fiscalYear:2025,periodType:'ANNUAL',periodEndDate:new Date('2025-12-31'),receiptDate:new Date('2026-03-01'),fsDivision:'OFS',totalEquity:new Prisma.Decimal(1000),netIncomeYtd:new Prisma.Decimal(100),accountSources:{basicEps:{amount:'10'}}};
  const sources:any={price,shares:{receiptNo:'receipt',outstanding:'10',preferred:false}};assert.equal(calculatePeriod(f,undefined,sources).values.per,null);
  sources.basis={receiptNo:'receipt',epsPriceCompatible:true,bpsPriceCompatible:true};const value=calculatePeriod(f,undefined,sources).values;assert.equal(value.per,'20');assert.equal(value.pbr,'2');
  sources.basis.epsPriceCompatible=false;sources.basis.bpsPriceCompatible=false;assert.equal(calculatePeriod(f,undefined,sources).values.pbr,null);
 }finally{for(const [i,key]of ['KIS_APP_KEY','KIS_APP_SECRET'].entries()){if(old[i]===undefined)delete process.env[key];else process.env[key]=old[i];}}
});

test('period evidence permits a common later adjustment but rejects changes, missing coverage, split flags and mismatched dates',()=>{
 const row=(date:string,value:string)=>({stck_bsop_date:date,stck_clpr:value,prtt_rate:'0.00',mod_yn:'N',revl_issu_reas:''});
 const raw=[row('20211230','24600'),row('20220104','25000'),row('20220110','26000')],adjusted=[row('20211230','22738'),row('20220104','23108'),row('20220110','24032')];
 assert.ok(verifyPeriodPriceBasis(raw,adjusted,'20211230','20220110'));
 assert.equal(verifyPeriodPriceBasis(raw,[adjusted[0]!,adjusted[1]!,row('20220110','13000')],'20211230','20220110'),undefined);
 assert.equal(verifyPeriodPriceBasis(raw.slice(1),adjusted.slice(1),'20211230','20220110'),undefined);
 assert.equal(verifyPeriodPriceBasis(raw,adjusted.slice(1),'20211230','20220110'),undefined);
 assert.equal(verifyPeriodPriceBasis(raw,adjusted,'20211230','20220120'),undefined);
 assert.equal(verifyPeriodPriceBasis([raw[0]!,{...raw[1]!,mod_yn:'Y'},raw[2]!],adjusted,'20211230','20220110'),undefined);
});
