import type {PrismaClient} from '../generated/prisma/index.js';
import type {NewsTarget} from './policy.js';
import {Prisma} from '../generated/prisma/index.js';
export async function newsHoldingIds(db:PrismaClient):Promise<Set<bigint>>{
 const lots=await db.buyTrade.findMany({where:{account:{isActive:true}},select:{securityId:true,quantity:true,sellTrades:{select:{quantity:true}}}});
 return new Set(lots.filter(lot=>lot.quantity.minus(lot.sellTrades.reduce((sum,sale)=>sum.plus(sale.quantity),new Prisma.Decimal(0))).greaterThan(0)).map(lot=>lot.securityId));
}
export const accountNewsScope=(accountId:bigint)=>({OR:[{buyTrades:{some:{accountId}}},{accountWatchlistItems:{some:{accountId,listType:'WATCHLIST' as const}}}]});
export async function newsTargets(db:PrismaClient,accountId?:bigint):Promise<NewsTarget[]>{
 const result:NewsTarget[]=[];let cursor=0n;
 const scope=accountId?accountNewsScope(accountId):{OR:[{buyTrades:{some:{account:{isActive:true}}}},{accountWatchlistItems:{some:{account:{isActive:true},listType:'WATCHLIST' as const}}}]};
 for(;;){const rows=await db.security.findMany({where:{id:{gt:cursor},...scope,...(!accountId?{collectionExcluded:false,NOT:{symbol:{startsWith:'Z99'}}}:{})},select:{id:true,symbol:true,name:true,securityType:true,dartCorpMapping:{select:{corpCode:true}}},orderBy:{id:'asc'},take:200});
  result.push(...rows.map(r=>({id:r.id,symbol:r.symbol,name:r.name,securityType:r.securityType,corpCode:r.dartCorpMapping?.corpCode??null})));if(rows.length<200)break;cursor=rows.at(-1)!.id;
 }return result;
}
