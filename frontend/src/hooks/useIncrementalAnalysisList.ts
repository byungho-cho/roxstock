import {useEffect,useMemo} from 'react';
import {useInfiniteQuery,type QueryKey} from '@tanstack/react-query';
import {usePageMemory} from './navigation/usePageMemory';

type ListRow={id:string;name:string;symbol:string};
type ListPage<T extends ListRow>={rows:T[];total:number;navigation?:ListRow[]};

/** Paint 20 + 30 rows, keeping one undisplayed 50-row page ready ahead. */
export function useIncrementalAnalysisList<T extends ListRow,P extends ListPage<T>>(
 queryKey:QueryKey,load:(offset:number,limit:number,signal:AbortSignal)=>Promise<P>,enabled=true,
) {
 const [visiblePages,setVisiblePages]=usePageMemory('analysis-visible-pages:'+JSON.stringify(queryKey),2,{adoptInitialAccount:true});
 const query=useInfiniteQuery({queryKey,initialPageParam:0,
  queryFn:async({pageParam,signal})=>{const page=await load(pageParam,pageParam===0?20:pageParam===20?30:50,signal);if(!Array.isArray(page?.rows)||!Number.isFinite(page.total))throw new Error("목록 응답 형식이 올바르지 않습니다.");return page;},
  getNextPageParam:(last,_pages,offset)=>last.rows.length&&offset+last.rows.length<last.total?offset+last.rows.length:undefined,
  enabled,staleTime:30_000,gcTime:30*60_000,refetchOnWindowFocus:false,refetchOnReconnect:false,refetchInterval:false,
 });
 const pageCount=query.data?.pages.length??0;
 useEffect(()=>{
  if(!enabled||!pageCount||pageCount>visiblePages||!query.hasNextPage||query.isFetching||query.isFetchNextPageError)return;
  const frame=requestAnimationFrame(()=>void query.fetchNextPage({cancelRefetch:false}));
  return()=>cancelAnimationFrame(frame);
 },[enabled,pageCount,visiblePages,query.hasNextPage,query.isFetching,query.isFetchNextPageError,query.fetchNextPage]);
 const data=useMemo(()=>{
  if(!query.data)return undefined;
  const first=query.data.pages[0],seen=new Set<string>();
  return {...first,rows:query.data.pages.slice(0,visiblePages).flatMap(page=>page.rows).filter(row=>{if(seen.has(row.id))return false;seen.add(row.id);return true;})} as P;
 },[query.data,visiblePages]);
 const hasMore=!!data&&data.rows.length<data.total;
 const loadingMore=query.isFetching&&visiblePages>pageCount;
 return {...query,data,hasNextPage:hasMore,isLoadingMore:loadingMore,pending:enabled&&query.isPending,error:query.error?.message,
  retry:()=>void(query.isFetchNextPageError?query.fetchNextPage({cancelRefetch:false}):query.refetch()),
  loadMore:()=>{
   if(!hasMore||loadingMore)return;
   setVisiblePages(count=>Math.max(count,visiblePages+1));
   if(query.isFetchNextPageError)void query.fetchNextPage({cancelRefetch:false});
  },
 };
}
