import {Prisma} from '@roxstock/shared/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';

type CostSample = {amount:Prisma.Decimal;feeTaxAmount:Prisma.Decimal};
export function weightedFee(amount:Prisma.Decimal, rows:CostSample[]) {
  const total=rows.reduce((n,r)=>n.plus(r.amount),new Prisma.Decimal(0));
  if(!rows.length||total.lte(0))return null;
  const costs=rows.reduce((n,r)=>n.plus(r.feeTaxAmount),new Prisma.Decimal(0));
  // Keep intermediate precision; the existing cash ledger stores DECIMAL(19,4).
  const Exact=Prisma.Decimal.clone({precision:60,rounding:Prisma.Decimal.ROUND_HALF_UP});
  return {amount:new Exact(amount.toString()).mul(costs.toString()).div(total.toString()).toDecimalPlaces(4).toString(),count:rows.length};
}

export async function estimateCashFee(db:Prisma.TransactionClient,accountId:bigint,cashId:bigint) {
  const current=await db.cashTransaction.findFirst({
    where:{id:cashId,accountId},
    include:{buyTrade:{include:{security:true}},sellTrade:{include:{buyTrade:{include:{security:true}}}}},
  });
  if(!current)throw new ApiError(404,'CASH_TRANSACTION_NOT_FOUND','연결된 예수금 내역을 찾을 수 없습니다.');
  const trade=current.transactionType==='BUY'?current.buyTrade:current.transactionType==='SELL'?current.sellTrade:null;
  const security=current.buyTrade?.security??current.sellTrade?.buyTrade.security;
  const linkedAccount=current.buyTrade?.accountId??current.sellTrade?.buyTrade.accountId;
  if(linkedAccount!==accountId||!!current.buyTradeId===!!current.sellTradeId)return null;
  if(!trade||!security||security.marketType==='OTHER'||security.securityType==='OTHER')return null;
  if(current.feeTaxStatus==='CONFIRMED'||current.feeTaxStatus==='UNKNOWN'&&!current.feeTaxAmount.isZero())return null;
  const amount=trade.quantity.mul(trade.unitPrice);
  if(amount.lte(0)||!amount.eq(current.amount))return null;
  const classification={marketType:security.marketType,securityType:security.securityType};
  const sideFilter:Prisma.CashTransactionWhereInput=current.transactionType==='BUY'
    ? {buyTrade:{accountId,security:classification}}
    : {sellTrade:{buyTrade:{accountId,security:classification}}};
  const rows:CostSample[]=[];
  let cursor:bigint|undefined;
  while(rows.length<3) {
    const batch=await db.cashTransaction.findMany({
      where:{
        accountId,transactionType:current.transactionType,feeTaxStatus:'CONFIRMED',
        amount:{gt:0},feeTaxAmount:{gte:0},createdAt:{lte:current.createdAt},id:{lt:current.id},
        OR:[{transactionDate:{lt:current.transactionDate}},{transactionDate:current.transactionDate,id:{lt:current.id}}],
        ...sideFilter,
      },
      include:{buyTrade:true,sellTrade:true},orderBy:[{transactionDate:'desc'},{id:'desc'}],take:25,
      ...(cursor?{cursor:{id:cursor},skip:1}:{}),
    });
    for(const row of batch) {
      const source=current.transactionType==='BUY'?row.buyTrade:row.sellTrade;
      if(source&&!!row.buyTradeId!==!!row.sellTradeId&&row.amount.eq(source.quantity.mul(source.unitPrice))&&row.feeTaxAmount.lte(row.amount)) {
        rows.push(row);
        if(rows.length===3)break;
      }
    }
    if(batch.length<25)break;
    cursor=batch.at(-1)!.id;
  }
  return weightedFee(amount,rows);
}
