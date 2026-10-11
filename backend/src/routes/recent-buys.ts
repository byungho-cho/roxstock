import type {FastifyInstance} from 'fastify';
import {Prisma} from '../generated/prisma/index.js';
import {prisma} from '../lib/prisma.js';
import {id} from '../lib/input.js';
import {ApiError} from '../lib/api-error.js';
import {valueBuyLot} from '../domain/lot-valuation.js';
import {calculateRemainingQuantity} from '../domain/trade.js';
import {realtimePriceCache} from '../realtime/price-cache.js';

export async function recentBuysRoutes(app:FastifyInstance){
 app.get<{Params:{accountId:string};Querystring:{months?:string}}>('/accounts/:accountId/recent-buys',async request=>{
  const accountId=id(request.params.accountId,'accountId'),months=Number(request.query.months??0);
  if(!Number.isInteger(months)||months<0||months>2400)throw new ApiError(400,'INVALID_INPUT','Invalid months.');
  const now=new Date(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(now);
  const from=new Date(Date.UTC(Number(today.slice(0,4)),Number(today.slice(5,7))-1-months,1)-9*3600000);
  const result=await prisma.$transaction(async tx=>{
   const account=await tx.account.findUnique({where:{id:accountId},select:{isActive:true}});
   if(!account?.isActive)throw new ApiError(404,'ACCOUNT_NOT_FOUND','Account not found.');
   const orderBy=[{boughtAt:'desc' as const},{id:'desc' as const}];
   const initial=await tx.buyTrade.findMany({where:{accountId},select:{id:true},orderBy,take:5});
   const total=await tx.buyTrade.count({where:{accountId}});
   const lots=await tx.buyTrade.findMany({where:{accountId,OR:[{id:{in:initial.map(row=>row.id)}},...(months?[{boughtAt:{gte:from}}]:[])]},orderBy,
    select:{id:true,securityId:true,boughtAt:true,quantity:true,unitPrice:true,
     security:{select:{id:true,symbol:true,name:true,marketType:true,marketPrice:true}},sellTrades:{select:{quantity:true}}}});
   return {lots,total};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  const prices=new Map(realtimePriceCache.get().map(row=>[row.securityId,row]));
  const data=result.lots.map(lot=>{
   const stored=lot.security.marketPrice,live=prices.get(String(lot.securityId));
   const useLive=live&&(!stored||Date.parse(live.observedAt)>=stored.priceUpdatedAt.getTime());
   const remaining=calculateRemainingQuantity(lot.quantity,lot.sellTrades.map(row=>row.quantity));
   const valuation=valueBuyLot(lot.boughtAt,String(lot.quantity),String(lot.unitPrice),useLive?live.currentPrice:stored?.currentPrice.toString()??null,useLive?new Date(live.observedAt):stored?.priceUpdatedAt??null,now);
   return {...valuation,id:String(lot.id),boughtAt:lot.boughtAt.toISOString(),security:{id:String(lot.security.id),symbol:lot.security.symbol,name:lot.security.name,marketType:lot.security.marketType},
    quantity:String(lot.quantity),unitPrice:String(lot.unitPrice),remainingQuantity:String(remaining),soldQuantity:lot.quantity.minus(remaining).toString(),remainingPurchaseAmount:remaining.mul(lot.unitPrice).toString(),
    profitLoss:valuation.currentPrice===null?null:new Prisma.Decimal(valuation.currentPrice).minus(lot.unitPrice).mul(remaining).toString(),memo:null,sellTrades:[]};
  });
  return {data,meta:{accountId:String(accountId),count:data.length,total:result.total,more:result.total>data.length,months,calculatedAt:now.toISOString()}};
 });
}
