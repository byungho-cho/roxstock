import {test} from 'node:test';
import assert from 'node:assert/strict';
import {KisInvestorProvider} from './kis-provider.mjs';

test('market endpoints select their total index, preserve net-only fields and never guess quantity units',async()=>{
 const requests=[];
 const item={stck_bsop_date:'20261015',bstp_nmix_prpr:'5554.22',bstp_nmix_prdy_vrss:'-454.59',prsn_ntby_tr_pbmn:'0',frgn_ntby_tr_pbmn:'-3758224',orgn_ntby_tr_pbmn:'1712053',prsn_ntby_qty:'-13133',pe_fund_ntby_tr_pbmn:'12'};
 const provider=new KisInvestorProvider({appKey:'key',appSecret:'secret',accessToken:'token',expiresAt:Date.now()+3600000,fetcher:async url=>{requests.push(new URL(url));return new Response(JSON.stringify({rt_cd:'0',output:[item]}));}});
 for(const [market,industry,code] of [['KOSPI','0001','KSP'],['KOSDAQ','1001','KSQ']]){
  const rows=await provider.marketFlows(market,'2026-10-15');assert.equal(rows.length,10);
  assert.equal(requests.at(-1).searchParams.get('FID_INPUT_ISCD'),industry);assert.equal(requests.at(-1).searchParams.get('FID_INPUT_ISCD_2'),industry);assert.equal(requests.at(-1).searchParams.get('FID_INPUT_ISCD_1'),code);
  assert.equal(rows[0].netAmount,'0');assert.equal(rows[1].netAmount,'-3758224000000');assert.equal(rows[0].netQuantity,null);assert.equal(rows[0].quantityUnit,null);assert.equal(rows[0].raw.netQuantity,'-13133');
  assert.equal(rows[0].buyAmount,null);assert.equal(rows[0].sellAmount,null);assert.equal(rows[0].exchangeScope,'KIS_MARKET');assert.equal(rows[0].raw.closeChange,'-454.59');assert.equal(rows[2].netAmount,'1712053000000');
 }
 await assert.rejects(provider.marketFlows('INVALID'),{code:'INVALID_MARKET'});
 item.prsn_ntby_tr_pbmn='';await assert.rejects(provider.marketFlows('KOSPI','2026-10-15'),{code:'KIS_FIELD_MISSING_OR_INVALID'});
});
