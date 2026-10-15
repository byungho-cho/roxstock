import test from 'node:test';import assert from 'node:assert/strict';
import {latestDisplayShares,latestStoredDisplayShares} from '@roxstock/shared/domain/share-counts';
import {Prisma} from '@roxstock/shared/prisma';
const filing=(receiptNo:string,year:number,date:string)=>({receiptNo,fiscalYear:year,periodEndDate:new Date(date),receiptDate:new Date(date)});
const shares=(receiptNo:string,year:number,date:string,treasury:string|null='0',shareClass='COMMON')=>({receiptNo,fiscalYear:year,periodEndDate:new Date(date),collectedAt:new Date(),shareClass,stockKind:shareClass==='COMMON'?'보통주':'우선주',issuedShares:new Prisma.Decimal(100),treasuryShares:treasury===null?null:new Prisma.Decimal(treasury),outstandingShares:new Prisma.Decimal(100)}) as any;
test('display latest stored quarter as a single receipt, preserving zero, class and year',()=>{
 const filings=[filing('annual',2025,'2025-12-31'),filing('half',2026,'2026-06-30'),filing('third',2026,'2026-09-30')];
 const rows=[shares('annual',2025,'2025-12-31'),shares('half',2026,'2026-06-30'),shares('half',2026,'2026-06-30',null,'PREFERRED')];
 const common=latestDisplayShares(rows,filings,2026);assert.equal(common.issuedShares,'100');assert.equal(common.treasuryShares,'0');assert.equal(common.shareBasis?.receiptNo,'half');
 assert.equal(latestDisplayShares(rows,filings,2026,'PREFERRED').treasuryShares,null);
 assert.equal(latestDisplayShares(rows,filings,2024).issuedShares,null);
 assert.equal(latestDisplayShares(rows,[...filings.map(f=>({...f,isWithdrawn:true}))],2026).issuedShares,null);
 assert.equal(latestDisplayShares([...rows,rows[1]],filings,2026).issuedShares,null);
 assert.equal(latestDisplayShares(rows,filings,2025).shareBasis?.receiptNo,'annual');
});

test('estimate display may use previous annual counts as one basis, never older or previous interim',()=>{
 const annual={...filing('annual',2025,'2025-12-31'),periodType:'ANNUAL'};
 const interim={...filing('interim',2025,'2025-09-30'),periodType:'Q3'};
 const rows=[shares('annual',2025,'2025-12-31'),shares('interim',2025,'2025-09-30')];
 const result=latestDisplayShares(rows,[annual,interim],2026,'COMMON',true);
 assert.equal(result.shareBasis?.fiscalYear,2025);assert.equal(result.shareBasis?.receiptNo,'annual');assert.equal(result.treasuryShares,'0');
 assert.equal(latestDisplayShares(rows,[interim],2026,'COMMON',true).issuedShares,null);
 assert.equal(latestDisplayShares(rows,[annual],2027,'COMMON',true).issuedShares,null);
 const current=filing('current',2026,'2026-06-30');const both=[...rows,shares('current',2026,'2026-06-30')];
 assert.equal(latestDisplayShares(both,[annual,current],2026,'COMMON',true).shareBasis?.receiptNo,'current');
});

test('latest stored display is independent of financial basis but never uses a future year, preferred or mixed receipt',()=>{
 const rows=[shares('old',2023,'2023-12-31'),shares('latest',2026,'2026-06-30'),shares('future',2027,'2027-03-31')];
 assert.equal(latestStoredDisplayShares(rows,[],2026).shareBasis?.receiptNo,'latest');
 assert.equal(latestStoredDisplayShares(rows,[],2025).shareBasis?.receiptNo,'old');
 assert.equal(latestStoredDisplayShares(rows,[],2022).issuedShares,null);
 assert.equal(latestStoredDisplayShares(rows,[],2026,'PREFERRED').issuedShares,null);
 assert.equal(latestStoredDisplayShares([...rows,rows[1]],[],2026).issuedShares,null);
});