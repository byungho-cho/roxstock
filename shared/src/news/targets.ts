import type {PrismaClient} from '../generated/prisma/index.js';
import type {NewsTarget} from './policy.js';
export const accountNewsScope=(accountId:bigint)=>({OR:[{buyTrades:{some:{accountId}}},{accountWatchlistItems:{some:{accountId,listType:'WATCHLIST' as const}}}]});
export async function newsTargets(db:PrismaClient,accountId?:bigint):Promise<NewsTarget[]>{
 const result:NewsTarget[]=[];let cursor=0n;
 const scope=accountId?accountNewsScope(accountId):{OR:[{buyTrades:{some:{account:{isActive:true}}}},{accountWatchlistItems:{some:{account:{isActive:true},listType:'WATCHLIST' as const}}}]};
 for(;;){const rows=await db.security.findMany({where:{id:{gt:cursor},...scope,...(!accountId?{collectionExcluded:false,NOT:{symbol:{startsWith:'Z99'}}}:{})},select:{id:true,symbol:true,name:true,securityType:true,dartCorpMapping:{select:{corpCode:true}}},orderBy:{id:'asc'},take:200});
  result.push(...rows.map(r=>({id:r.id,symbol:r.symbol,name:r.name,securityType:r.securityType,corpCode:r.dartCorpMapping?.corpCode??null})));if(rows.length<200)break;cursor=rows.at(-1)!.id;
 }return result;
}
