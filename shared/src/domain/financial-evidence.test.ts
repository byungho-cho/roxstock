import test from 'node:test';
import assert from 'node:assert/strict';
import {Prisma} from '../generated/prisma/index.js';
import {supplementedFilings} from './financial-evidence.js';

test('both screens can read exact DART supplementary accounts without overwriting original figures',()=>{
 const filing={securityId:329n,fiscalYear:2025,periodType:'ANNUAL',receiptNo:'20260319000530',fsDivision:'OFS',isWithdrawn:false,totalAssets:null,totalLiabilities:null,totalEquity:new Prisma.Decimal(100),revenueYtd:null,revenueQuarter:null,operatingProfitYtd:null,operatingProfitQuarter:null,netIncomeYtd:null,netIncomeQuarter:null,operatingCashFlowYtd:null,accountSources:{totalEquity:{amount:'100'},revenue:{amount:null}}} as any;
 const accounts={receiptNo:filing.receiptNo,fsDivision:'OFS',sources:{revenue:{amount:'500',ytdAmount:null},totalEquity:{amount:'999'},investingCashFlow:{statementDivision:'CF',amount:'0'},financingCashFlow:{statementDivision:'CF',amount:'-25'},cashEquivalents:{amount:'80'}}};
 const period={securityId:329n,fiscalYear:2025,periodType:'ANNUAL',supplemental:{accounts}};
 const [result]=supplementedFilings([filing],[period]);
 assert.equal(result!.revenueYtd?.toString(),'500');assert.equal(result!.totalEquity?.toString(),'100');assert.equal((result!.accountSources as any).investingCashFlow.amount,'0');assert.equal((result!.accountSources as any).financingCashFlow.amount,'-25');assert.equal(filing.revenueYtd,null);
 for(const changed of [{receiptNo:'other'},{fsDivision:'CFS'}])assert.equal(supplementedFilings([filing],[{...period,supplemental:{accounts:{...accounts,...changed}}}])[0],filing);
 assert.equal(supplementedFilings([filing],[{...period,fiscalYear:2024}])[0],filing);
 assert.equal(supplementedFilings([filing],[{...period,securityId:1n}])[0],filing);
});
