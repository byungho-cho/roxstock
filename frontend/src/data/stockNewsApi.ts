import {apiEnvelope} from './apiClient';
export type NewsFilter='ALL'|'REPORT'|'ARTICLE'|'DISCLOSURE'|'SCRAP';
export type StockNews={isScrapped:boolean;isHeld:boolean;id:string;title:string;originalUrl:string|null;originalAvailable:boolean;sourceName:string;publishedAt:string;publishedPrecision:'TIME'|'DATE';type:Exclude<NewsFilter,'ALL'|'SCRAP'>;importance:'IMPORTANT'|'MAJOR';access:'FREE'|'PAID'|'LOGIN'|'UNKNOWN';summary:string|null;summaryMethod:string;collectedAt:string;securities:{id:string;symbol:string;name:string;isHeld:boolean}[]};
export type NewsCollection={status:string;updatedAt:string|null;initialCompleted:boolean;enabled:boolean;nextAt:string|null;intervalHours:number;startTime:string;anchorAt:string;timezone:string;lastAttemptAt:string|null;lastFinishedAt:string|null;lastFullSuccessAt:string|null;lastNewStoredAt:string|null;nextRetryAt:string|null;providers:{id:string;status:string;error:string|null;nextRetryAt:string|null;attempts:number;gaps:{from:string;to:string;reason:string;section?:string}[]|null;diagnostics:Record<string,number>|null}[]};
export type NewsPage={data:StockNews[];meta:{accountId:string;type:NewsFilter;count:number;total:number;snapshot:string;nextCursor:string|null;dailyCounts?:Record<string,number>;collection:NewsCollection}};
export type NewsDetail={data:StockNews;meta:{accountId:string;snapshot:string;type:NewsFilter;ordinal:number;total:number;previousId:string|null;nextId:string|null}};
export type NewsPageParam={snapshot?:string;cursor?:string}|undefined;
export function newsParams(type:NewsFilter,snapshot?:string,cursor?:string,held=false){return new URLSearchParams({type,...(held?{held:"true"}:{}),...(snapshot?{snapshot}:{}),...(cursor?{cursor}:{})}).toString();}
export async function getNewsPage(accountId:string,type:NewsFilter,page:NewsPageParam,signal?:AbortSignal,held=false){
 const result=await apiEnvelope<NewsPage>(`/accounts/${accountId}/stock-news?${newsParams(type,page?.snapshot,page?.cursor,held)}`,{signal});
 if(result.meta.accountId!==accountId||result.meta.type!==type||!Array.isArray(result.data)||result.data.length>10||result.meta.count!==result.data.length)throw Error('소식 목록 응답을 확인해 주세요.');return result;
}
export const getNewsDetail=(accountId:string,id:string,type:NewsFilter,snapshot?:string,signal?:AbortSignal,held=false)=>apiEnvelope<NewsDetail>(`/accounts/${accountId}/stock-news/${encodeURIComponent(id)}?${newsParams(type,snapshot,undefined,held)}`,{signal});
