import {prisma} from '../auth/scoped-db.js';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {id} from '../lib/input.js';
import {requireActiveAccount} from './classification.js';
/** Apply account membership before pagination and navigation, without changing the shared market cache. */
export async function analysisInterestIds(query:{scope?:string;accountId?:string}){
 if(query.scope!==undefined&&!['all','interest'].includes(query.scope))throw new ApiError(400,'INVALID_INPUT','종목 범위를 확인해 주세요.');
 if(query.scope!=='interest')return null;
 const accountId=id(query.accountId,'accountId');await requireActiveAccount(prisma,accountId);
 const rows=await prisma.security.findMany({where:{OR:[{accountWatchlistItems:{some:{accountId,listType:{in:['HOLDING','WATCHLIST']}}}},{buyTrades:{some:{accountId}}}]},select:{id:true}});
 return new Set(rows.map(row=>String(row.id)));
}
