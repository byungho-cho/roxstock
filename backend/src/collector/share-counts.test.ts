import test from 'node:test';import assert from 'node:assert/strict';
import {OpenDartProvider} from './dart-provider.js';import {completeShares,displayShares,shareClassOf} from '../domain/share-counts.js';import {Prisma} from '../generated/prisma/index.js';
const receipts=['20260310002820','20260814003699'];
test('explicit ordinary variants are ordinary; unknown voting categories and mixed classes stay unknown',()=>{
 for(const name of ['보통주','보통주식','의결권 있는 보통주','기명식 보통주'])assert.equal(shareClassOf(name),'COMMON');
 for(const name of ['우선주','의결권 없는 우선주'])assert.equal(shareClassOf(name),'PREFERRED');
 for(const name of ['보통부','의결권 있는 주식','의결권 없는 주식','보통주 및 우선주'])assert.equal(shareClassOf(name),'OTHER');
 assert.equal(shareClassOf('합 계'),'TOTAL');
 const row={receiptNo:'20260814003699',shareClass:'COMMON'} as any,filing={receiptNo:row.receiptNo,fiscalYear:2026,periodEndDate:new Date('2026-06-30'),receiptDate:new Date('2026-08-14')};
 assert.equal(displayShares([row,{...row,stockKind:'다른 보통주'}],[filing],2026).issuedShares,null);
});
test('DART three counts stay receipt/class/period scoped, zero differs from missing and inconsistent data rejects',async()=>{
 let data:any[]=[];const provider=new OpenDartProvider({apiKey:'fixture',dailyCallLimit:100,minDelayMs:0,fetchFn:async()=>new Response(JSON.stringify({status:'000',list:data})),reserveCall:async()=>true});
 const values=[['5919637922','91828987','5827808935','2025-12-31'],['5846278608','82086705','5764191903','2026-06-30']];
 for(let i=0;i<2;i++){
  const [issued,treasury,outstanding,date]=values[i]!;data=[{rcept_no:receipts[i],se:'보통주',istc_totqy:issued,tesstk_co:treasury,distb_stock_co:outstanding,stlm_dt:date},{rcept_no:receipts[i],se:'우선주',istc_totqy:'100',tesstk_co:'0',distb_stock_co:'100',stlm_dt:date}];
  const result=await provider.fetchPeriodShares('00126380',i?2026:2025,i?'11012':'11011',receipts[i]!);assert.equal(result?.issuedShares,issued);assert.equal(result?.treasuryShares,treasury);assert.equal(result?.outstanding,outstanding);assert.equal(result?.rows[1]?.treasuryShares,'0');assert.equal(completeShares(result,receipts[i]!),true);
  const snapshots=result!.rows.map(r=>({...r,securityId:1n,receiptNo:receipts[i],fiscalYear:i?2026:2025,reportCode:i?'11012':'11011',issuedShares:r.issuedShares===null?null:new Prisma.Decimal(r.issuedShares),treasuryShares:r.treasuryShares===null?null:new Prisma.Decimal(r.treasuryShares),outstandingShares:r.outstandingShares===null?null:new Prisma.Decimal(r.outstandingShares),periodEndDate:new Date(r.periodEndDate),collectedAt:new Date()})) as any;
  const filings=[{receiptNo:receipts[i]!,fiscalYear:i?2026:2025,periodEndDate:new Date(date!),receiptDate:new Date()}];assert.equal(displayShares(snapshots,filings,i?2026:2025).issuedShares,issued);assert.equal(displayShares(snapshots,filings,i?2026:2025,'PREFERRED').issuedShares,'100');assert.equal(displayShares(snapshots,filings,2024).issuedShares,null);
 }
 data.push({rcept_no:receipts[1],se:'비고',istc_totqy:'-',tesstk_co:'-',distb_stock_co:'-',stlm_dt:'2026-06-30'});
 data[1].tesstk_co='-';const explicitMissing=await provider.fetchPeriodShares('00126380',2026,'11012',receipts[1]!);assert.equal(explicitMissing?.rows?.length,2);assert.equal(explicitMissing?.rows?.[1]?.treasuryShares,null);assert.equal(completeShares(explicitMissing,receipts[1]!),true);
 data[0].tesstk_co='-';assert.equal((await provider.fetchPeriodShares('00126380',2026,'11012',receipts[1]!))?.treasuryShares,null);
 data[0].tesstk_co='0';await assert.rejects(()=>provider.fetchPeriodShares('00126380',2026,'11012',receipts[1]!),/관계/);
 await assert.rejects(()=>provider.fetchPeriodShares('00126380',2025,'11011',receipts[0]!),/접수번호/);
 data=[];await assert.rejects(()=>provider.fetchPeriodShares('00126380',2025,'11011',receipts[0]!),/비어/);
});
