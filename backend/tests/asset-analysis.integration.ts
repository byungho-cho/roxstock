import assert from 'node:assert/strict';
import test from 'node:test';
import {buildApp} from '../src/app.js';
import {prisma} from '../src/lib/prisma.js';
import {seoulYear} from '../src/domain/compound-growth.js';

test('asset analysis response joins real stored snapshots, ledger and plan with one interval', async () => {
  const app = buildApp();
  const account = await prisma.account.create({data:{name:'Analysis integration',brokerName:'test',cashBalance:'0'}});
  const security = await prisma.security.create({data:{symbol:'989140',name:'Analysis test',marketType:'OTHER'}});
  const firstTime = new Date('2026-09-01T07:00:00Z'), lastTime = new Date('2026-09-03T07:00:00Z');
  try {
    const snapshots = [{date:'2026-09-01',cash:'400',stock:'600',total:'1000',unrealized:'100'}, {date:'2026-09-03',cash:'600',stock:'900',total:'1500',unrealized:'250'}];
    for (const point of snapshots) {
      const snapshotDate=new Date(point.date);
      await prisma.dailyAccountSnapshot.create({data:{accountId:account.id,snapshotDate,cashBalance:point.cash,stockValue:point.stock,totalAssetValue:point.total,updatedAt:point.date==='2026-09-01'?firstTime:lastTime}});
      await prisma.dailyPositionSnapshot.create({data:{accountId:account.id,securityId:security.id,snapshotDate,quantity:'10',purchaseAmount:String(Number(point.stock)-Number(point.unrealized)),marketPrice:'60',marketValue:point.stock,unrealizedProfitLoss:point.unrealized}});
    }
    const time=new Date('2026-09-02T03:00:00Z');
    await prisma.cashTransaction.create({data:{accountId:account.id,transactionType:'DEPOSIT',transactionDate:time,amount:'200',balanceAfter:'0',createdAt:time}});
    // Already included in opening snapshot, so excluded from the period.
    await prisma.cashTransaction.create({data:{accountId:account.id,transactionType:'DEPOSIT',transactionDate:firstTime,amount:'999',balanceAfter:'0',createdAt:firstTime}});
    const buy=await prisma.buyTrade.create({data:{accountId:account.id,securityId:security.id,boughtAt:firstTime,quantity:'5',unitPrice:'50'}});
    const sell=await prisma.sellTrade.create({data:{buyTradeId:buy.id,soldAt:time,quantity:'2',unitPrice:'100'}});
    await prisma.cashTransaction.create({data:{accountId:account.id,sellTradeId:sell.id,transactionType:'SELL',transactionDate:time,amount:'200',feeTaxAmount:'10',balanceAfter:'0',createdAt:time}});
    const divcash=await prisma.cashTransaction.create({data:{accountId:account.id,transactionType:'DIVIDEND',transactionDate:time,amount:'80',balanceAfter:'0',createdAt:time}});
    await prisma.dividend.create({data:{accountId:account.id,securityId:security.id,cashTransactionId:divcash.id,receivedDate:time,grossAmount:'100',netAmount:'80'}});
    const year = seoulYear();
    await prisma.compoundGrowthPlan.create({data:{accountId:account.id,planName:'Ended plan',startDate:new Date(Date.UTC(year-2,0,1)),endDate:new Date(Date.UTC(year-1,11,31)),initialAssetValue:'500',annualContributionAmount:'0',displayOrder:0}});
    await prisma.compoundGrowthPlan.create({data:{accountId:account.id,planName:'Future plan',startDate:new Date(Date.UTC(year+2,0,1)),endDate:new Date(Date.UTC(year+3,11,31)),initialAssetValue:'500',annualContributionAmount:'0',displayOrder:1}});
    const plan=await prisma.compoundGrowthPlan.create({data:{accountId:account.id,planName:'Stored plan',startDate:new Date(Date.UTC(year,0,1)),endDate:new Date(Date.UTC(year+1,11,31)),initialAssetValue:'1000',annualContributionAmount:'100',displayOrder:2}});
    await prisma.compoundGrowthGoal.create({data:{planId:plan.id,goalName:'Default',annualTargetRate:'10',isDefault:true}});
    const read=async(from='2026-09-01')=>{const r=await app.inject({method:'GET',url:`/api/accounts/${account.id}/asset-history?from=${from}&to=2026-09-03`});assert.equal(r.statusCode,200,r.body);return r.json();};
    const result=await read();
    assert.equal(result.summary.depositAmount,'200');assert.equal(result.summary.profitLoss,'300');
    assert.equal(result.summary.unrealizedChange,'150');assert.equal(result.summary.realizedProfitLoss,'100');
    assert.equal(result.summary.dividendIncome,'100');assert.equal(result.summary.feeTaxAmount,'30');
    assert.equal(result.summary.detailedProfitLoss,'320');assert.equal(result.summary.reconciliationDifference,'-20');
    assert.equal(result.summary.ledgerFrom,firstTime.toISOString());assert.equal(result.summary.ledgerTo,lastTime.toISOString());
    assert.equal(result.compoundPlan.initialAssetValue,'1000');assert.equal(result.compoundPlan.assetBasis,'PLAN_INITIAL_ASSET');assert.equal(result.compoundPlan.yearTarget,'1210');
    assert.equal(result.compoundPlan.id, plan.id.toString());
    const plansResponse = await app.inject({method:'GET',url:`/api/accounts/${account.id}/compound-plans`});
    assert.equal(plansResponse.statusCode,200,plansResponse.body);
    const matching = plansResponse.json().data.plans.find((row:{id:string}) => row.id === plan.id.toString());
    assert.equal(result.compoundPlan.yearTarget,matching.goals[0].yearTarget);
    await prisma.compoundGrowthPlan.update({where:{id:plan.id},data:{isActive:false}});
    assert.equal((await read()).compoundPlan,null);
    await prisma.dailyPositionSnapshot.deleteMany({where:{accountId:account.id,snapshotDate:new Date('2026-09-01')}});
    assert.equal((await read()).summary.unrealizedChange,null);
    const one=await read('2026-09-03');assert.equal(one.summary.profitLoss,null);assert.equal(one.summary.realizedProfitLoss,null);
    const empty=await read('2026-09-02');assert.equal(empty.data.length,1);
  } finally {
    await prisma.compoundGrowthGoal.deleteMany({where:{plan:{accountId:account.id}}});
    await prisma.compoundGrowthPlan.deleteMany({where:{accountId:account.id}});
    await prisma.dividend.deleteMany({where:{accountId:account.id}});
    await prisma.cashTransaction.deleteMany({where:{accountId:account.id}});
    await prisma.sellTrade.deleteMany({where:{buyTrade:{accountId:account.id}}});await prisma.buyTrade.deleteMany({where:{accountId:account.id}});
    await prisma.dailyPositionSnapshot.deleteMany({where:{accountId:account.id}});await prisma.dailyAccountSnapshot.deleteMany({where:{accountId:account.id}});
    await prisma.account.delete({where:{id:account.id}});await prisma.security.delete({where:{id:security.id}});
    await app.close();await prisma.$disconnect();
  }
});
