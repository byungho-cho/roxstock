import {apiEnvelope} from './apiClient';
export type NewsFilter='ALL'|'REPORT'|'ARTICLE'|'DISCLOSURE';
export type StockNews={id:string;title:string;originalUrl:string|null;originalAvailable:boolean;sourceName:string;publishedAt:string;publishedPrecision:'TIME'|'DATE';type:Exclude<NewsFilter,'ALL'>;importance:'IMPORTANT'|'MAJOR';access:'FREE'|'PAID'|'LOGIN'|'UNKNOWN';summary:string|null;summaryMethod:string;collectedAt:string;securities:{id:string;symbol:string;name:string}[]};
export type NewsCollection={status:string;updatedAt:string|null;initialCompleted:boolean;enabled:boolean;nextAt:string|null;providers:{id:string;error:string|null}[]};
export type NewsPage={data:StockNews[];meta:{accountId:string;type:NewsFilter;count:number;total:number;snapshot:string;nextCursor:string|null;collection:NewsCollection}};
export type NewsDetail={data:StockNews;meta:{accountId:string;snapshot:string;type:NewsFilter;ordinal:number;total:number;previousId:string|null;nextId:string|null}};
export type NewsPageParam={snapshot?:string;cursor?:string}|undefined;
export function newsParams(type:NewsFilter,snapshot?:string,cursor?:string){return new URLSearchParams({type,...(snapshot?{snapshot}:{}),...(cursor?{cursor}:{})}).toString();}
export async function getNewsPage(accountId:string,type:NewsFilter,page:NewsPageParam,signal?:AbortSignal){
 const result=await apiEnvelope<NewsPage>(`/accounts/${accountId}/stock-news?${newsParams(type,page?.snapshot,page?.cursor)}`,{signal});
 if(result.meta.accountId!==accountId||result.meta.type!==type||!Array.isArray(result.data)||result.data.length>10||result.meta.count!==result.data.length)throw Error('소식 목록 응답을 확인해 주세요.');return result;
}
export const getNewsDetail=(accountId:string,id:string,type:NewsFilter,snapshot?:string,signal?:AbortSignal)=>apiEnvelope<NewsDetail>(`/accounts/${accountId}/stock-news/${encodeURIComponent(id)}?${newsParams(type,snapshot)}`,{signal});
