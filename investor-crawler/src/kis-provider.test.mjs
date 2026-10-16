import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KisInvestorProvider} from './kis-provider.mjs';

const sample=()=>Object.assign({stck_bsop_date:'20261015',stck_clpr:'36950',prdy_vrss:'950',prdy_vrss_sign:'5'},...['prsn','frgn','orgn'].map(prefix=>({[prefix+'_shnu_vol']:'9007199254740993',[prefix+'_seln_vol']:'2',[prefix+'_ntby_qty']:'9007199254740991',[prefix+'_shnu_tr_pbmn']:'10',[prefix+'_seln_tr_pbmn']:'12',[prefix+'_ntby_tr_pbmn']:'-2'})));
test('KIS shares one token request, requests KRX only and converts source million-KRW exactly',async()=>{
 const calls=[];const provider=new KisInvestorProvider({appKey:'test-key',appSecret:'test-secret',fetcher:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(url.endsWith('/tokenP')?{access_token:'test-token',expires_in:86400}:{rt_cd:'0',output2:[sample()]}));}});
 const results=await Promise.all([provider.stockFlows('008770','2026-10-15'),provider.stockFlows('005930','2026-10-15')]);
 assert.equal(calls.filter(c=>c.url.endsWith('/tokenP')).length,1);
 const request=calls.find(c=>!c.url.endsWith('/tokenP'));assert.equal(new URL(request.url).searchParams.get('FID_COND_MRKT_DIV_CODE'),'J');assert.equal(request.init.headers.tr_id,'FHPTJ04160001');
 assert.equal(results[0][0].netAmount,'-2000000');assert.equal(results[0][0].buyQuantity,'9007199254740993');assert.equal(results[0][0].source,'KIS_API');assert.equal(results[0][0].raw.amountUnit,'MILLION_KRW');assert.equal(results[0][0].raw.closeChange,'-950');
 assert.ok(!JSON.stringify(results).includes('test-secret'));assert.ok(!JSON.stringify(results).includes('test-token'));
 assert.equal(results[0].length,10);assert.equal(results[0].find(row=>row.investorCode==='BANK').netAmount,null);
});
test('institution subcategories remain separate observations and private-fund quantity uses its volume field',async()=>{
 const data=sample();Object.assign(data,{pe_fund_shnu_vol:'10',pe_fund_seln_vol:'4',pe_fund_ntby_vol:'6',pe_fund_shnu_tr_pbmn:'100',pe_fund_seln_tr_pbmn:'40',pe_fund_ntby_tr_pbmn:'60'});
 const provider=new KisInvestorProvider({appKey:'key',appSecret:'secret',accessToken:'token',expiresAt:Date.now()+3600000,fetcher:async()=>new Response(JSON.stringify({rt_cd:'0',output2:[data]}))});
 const result=await provider.stockFlows('008770','2026-10-15');assert.equal(result.find(row=>row.investorCode==='PRIVATE_EQUITY').netQuantity,'6');assert.equal(result.find(row=>row.investorCode==='PRIVATE_EQUITY').netAmount,'60000000');assert.equal(result.find(row=>row.investorCode==='INSTITUTION').netAmount,'-2000000');
});
test('KIS rejects malformed, duplicate and future observations without replacing missing amounts with zero',async()=>{
 let data=sample();const provider=new KisInvestorProvider({appKey:'key',appSecret:'secret',accessToken:'token',expiresAt:Date.now()+3600000,fetcher:async()=>new Response(JSON.stringify({rt_cd:'0',output2:Array.isArray(data)?data:[data]}))});
 data.prsn_ntby_tr_pbmn='';await assert.rejects(provider.stockFlows('008770','2026-10-15'),{code:'KIS_FIELD_MISSING_OR_INVALID'});
 data=sample();data.prsn_ntby_qty='0';await assert.rejects(provider.stockFlows('008770','2026-10-15'),{code:'KIS_NET_QUANTITY_MISMATCH'});
 data=sample();data.prsn_ntby_tr_pbmn='99';await assert.rejects(provider.stockFlows('008770','2026-10-15'),{code:'KIS_NET_AMOUNT_MISMATCH'});
 data=[sample(),sample()];await assert.rejects(provider.stockFlows('008770','2026-10-15'),{code:'KIS_DATE_MISMATCH_OR_DUPLICATE'});
 await assert.rejects(provider.stockFlows('Z99001','2026-10-15'),{code:'EXCLUDED_SYMBOL'});
 data=sample();data.stck_bsop_date='20261016';await assert.rejects(provider.stockFlows('008770','2026-10-15'),{code:'KIS_DATE_MISMATCH_OR_DUPLICATE'});
});
test('KIS respects rounded source amounts, preserves zeros and sanitizes authorization failures',async()=>{
 const data=sample();data.prsn_ntby_tr_pbmn='-1';data.frgn_shnu_tr_pbmn='0';data.frgn_seln_tr_pbmn='0';data.frgn_ntby_tr_pbmn='0';
 const provider=new KisInvestorProvider({appKey:'key',appSecret:'secret',accessToken:'token',expiresAt:Date.now()+3600000,fetcher:async()=>new Response(JSON.stringify({rt_cd:'0',output2:[data]}))});
 const rows=await provider.stockFlows('008770','2026-10-15');assert.equal(rows[0].netAmount,'-1000000');assert.equal(rows[0].raw.amountRoundingDifference,'-1');assert.equal(rows[1].netAmount,'0');
 const denied=new KisInvestorProvider({appKey:'key',appSecret:'secret',fetcher:async()=>new Response(JSON.stringify({msg1:'secret token'}),{status:403})});await assert.rejects(denied.stockFlows('008770'),e=>e.code==='KIS_AUTH_OR_PERMISSION_FAILED'&&!e.message.includes('secret'));
});

test('NXT collection uses NX and keeps separate exchange identity',async()=>{
 const provider=new KisInvestorProvider({appKey:'key',appSecret:'secret',accessToken:'token',expiresAt:Date.now()+3600000,fetcher:async(url)=>{assert.equal(new URL(url).searchParams.get('FID_COND_MRKT_DIV_CODE'),'NX');return new Response(JSON.stringify({rt_cd:'0',output2:[sample()]}));}});
 const rows=await provider.stockFlows('005930','2026-10-15','NXT');assert.equal(rows[0].exchangeScope,'NXT');assert.equal(rows[0].raw.branch,'NX');assert.equal(rows[0].netAmount,'-2000000');
 await assert.rejects(provider.stockFlows('005930','2026-10-15','UN'),{code:'INVALID_EXCHANGE_SCOPE'});
});

test('NXT explicit zero flows survive missing optional closing price',async()=>{
 const data=sample();data.stck_clpr='';
 for(const key of Object.keys(data))if(/^(prsn|frgn|orgn)_/.test(key))data[key]='0';
 const provider=new KisInvestorProvider({appKey:'key',appSecret:'secret',accessToken:'token',expiresAt:Date.now()+3600000,fetcher:async()=>new Response(JSON.stringify({rt_cd:'0',output2:[data]}))});
 const rows=await provider.stockFlows('069500','2026-10-15','NXT');assert.equal(rows[0].netQuantity,'0');assert.equal(rows[0].netAmount,'0');assert.equal(rows[0].raw.closingPrice,null);
});
