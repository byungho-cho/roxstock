import {newsProviderNames,newsProviderReason} from './newsCollectionUi';
import {useEffect,useRef,useState} from 'react';
import {useInfiniteQuery,useQuery,useQueryClient} from '@tanstack/react-query';
import {useLocation,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {Box,Button,Typography} from '@mui/material';
import {PageHeader} from '../../components/navigation/Navigation';
import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {ClickInfo} from '../../components/common/ClickInfo';
import {ApiError} from '../../data/apiClient';
import {getNewsPage,getNewsDetail,type NewsFilter,type NewsPageParam,type StockNews} from '../../data/stockNewsApi';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {useListNavigation,useReturnNavigation} from '../../hooks/navigation/usePageMemory';
import {useCardNavigation} from '../../hooks/useCardNavigation';
import {ImportanceIcon,TypeChip,PaidIcon,OriginalLink,newsTime,newsTypeNames} from './newsUi';
const filters:[NewsFilter,string][]=[['ALL','전체'],['REPORT','리포트'],['ARTICLE','기사'],['DISCLOSURE','공시']];
function useNewsList(accountId:string|undefined,type:NewsFilter,entry:string,enabled=true,initialSnapshot?:string){
 const client=useQueryClient();const key=['stockNews',accountId,type,entry];
 const query=useInfiniteQuery({queryKey:key,initialPageParam:(initialSnapshot?{snapshot:initialSnapshot}:undefined) as NewsPageParam,queryFn:({signal,pageParam})=>getNewsPage(accountId!,type,pageParam,signal),getNextPageParam:last=>last.meta.nextCursor?{snapshot:last.meta.snapshot,cursor:last.meta.nextCursor}:undefined,enabled:!!accountId&&enabled,staleTime:60_000,refetchOnWindowFocus:false,refetchOnMount:query=>!initialSnapshot&&query.state.isInvalidated});
 useEffect(()=>{if(!initialSnapshot&&query.error instanceof ApiError&&['NEWS_SCOPE_CHANGED','NEWS_SNAPSHOT_EXPIRED'].includes(query.error.code))void client.resetQueries({queryKey:key,exact:true});},[query.error,client,accountId,type,entry,initialSnapshot]);
 return query;
}
function NewsCard({item,open}:{item:StockNews;open:()=>void}){
 const navigate=useCardNavigation(open);
 return <Box component="article" role="link" tabIndex={0} aria-label={item.title} data-testid="stock-news-card" {...navigate} sx={{border:item.isHeld?'1px solid #FBBF24':'1px solid #1E293B',borderRadius:'8px',bgcolor:'#111827',px:'8px',py:'6px',display:'flex',flexDirection:'column',gap:'2px',cursor:'pointer',minWidth:0,'&:focus-visible':{outline:'2px solid #60A5FA'}}}>
  <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}><Box sx={{display:'flex',gap:'8px',alignItems:'center',minWidth:0}}><Typography noWrap sx={{fontSize:11,fontWeight:600,lineHeight:'17px',minWidth:0,color:item.isHeld?'#FBBF24':undefined}}>{item.securities.map(s=>s.name).join(' · ')}</Typography><ImportanceIcon value={item.importance}/></Box><TypeChip type={item.type}/></Box>
  <Typography component="div" data-testid="stock-news-title" sx={{fontSize:12,fontWeight:600,lineHeight:'18px',overflowWrap:'anywhere'}}>{item.title}{item.access==='PAID'&&<PaidIcon/>}</Typography>
  <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',fontSize:10,lineHeight:'16px'}}><Typography noWrap sx={{fontSize:10,lineHeight:'16px',color:'#CBD5E1',minWidth:0}}>{item.sourceName} · {newsTime(item.publishedAt,item.publishedPrecision==='DATE')}</Typography><OriginalLink item={item}/></Box>
 </Box>;
}
export function StockNewsPage(){
 const location=useLocation(),entry=location.key;
 const {accountId,accounts}=useActiveAccount(),[params,setParams]=useSearchParams(),open=useListNavigation();
 const type=(filters.some(([v])=>v===params.get('type'))?params.get('type'):'ALL') as NewsFilter;
 const query=useNewsList(accountId,type,entry),pages=query.data?.pages,first=pages?.[0],rows=pages?.flatMap(p=>p.data)??[],collection=first?.meta.collection;
 return <Box data-testid="stock-news-list" sx={{pt:'8px',pb:'8px',display:'flex',flexDirection:'column',gap:'8px'}}>
  <PageHeader embedded titleAriaLabel="종목소식" title={<Box component="span" sx={{display:'inline-flex',alignItems:'center',gap:'4px',fontWeight:600,fontSize:20,lineHeight:'26px'}}>종목소식{['PARTIAL','FAILED'].includes(collection?.status??'')&&<ClickInfo label="소식 수집 상태" tone={collection?.status==='FAILED'?'danger':'warning'}>{collection?.status==='PARTIAL'?'일부 구간 확인 불가 · 확인된 소식과 기존 목록을 표시합니다.':'최근 확인 실패 · 신규 여부를 확인할 수 없습니다. 기존 목록을 표시합니다.'}{collection?.providers.filter(p=>['PARTIAL','FAILED'].includes(p.status)).map(p=><Box key={p.id}>{newsProviderNames[p.id]??p.id} · {newsProviderReason(p.error)}</Box>)}{collection?.providers.flatMap(p=>(p.gaps??[]).map((g,i)=><Box key={p.id+i}>{g.section??p.id} · {newsTime(g.from)} ~ {newsTime(g.to)} 미확인</Box>))}{collection?.nextAt&&<Box>다음 정규 실행 {newsTime(collection.nextAt)}</Box>}{collection?.nextRetryAt&&<Box>다음 재시도 {newsTime(collection.nextRetryAt)}</Box>}</ClickInfo>}</Box>} showAdd={false} showBack={false} action={<Typography data-testid="news-collected-at" sx={{fontSize:11,lineHeight:'16px',color:'#CBD5E1'}}>최근 확인 {newsTime(collection?.updatedAt)}</Typography>}/>
  <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'6px'}}><Box role="tablist" aria-label="소식 유형" data-no-pull-refresh sx={{display:'flex',gap:'6px',minWidth:0}}>{filters.map(([value,label])=><Button key={value} role="tab" aria-selected={value===type} onClick={()=>setParams(value==='ALL'?{}:{type:value},{replace:true})} sx={{minWidth:0,px:'16px',py:'4px',height:25,minHeight:25,borderRadius:'6px',fontSize:11,lineHeight:'17px',whiteSpace:'nowrap',fontWeight:value===type?600:400,color:'#F8FAFC',bgcolor:value===type?'#60A5FA':'#111827'}}>{label}</Button>)}</Box><Box sx={{display:'flex',alignItems:'center',gap:'2px',flexShrink:0}}><Typography data-testid="news-display-count" sx={{fontSize:10,lineHeight:'16px',color:'#94A3B8',flexShrink:0}}>{rows.length}/{first?.meta.total??'—'}</Typography></Box></Box>
  {(query.isError||accounts.isError)&&<QueryErrorNotice message="종목소식 조회 실패 · 기존 목록 유지" onRetry={()=>{void query.refetch();void accounts.refetch();}}/>}
  {query.isPending&&<Typography role="status" sx={{fontSize:12,color:'#94A3B8'}}>저장된 소식을 조회하고 있습니다.</Typography>}
  {first&&rows.length===0&&<Typography role="status" sx={{fontSize:12,color:'#94A3B8',py:'16px',textAlign:'center'}}>{!collection?.initialCompleted?collection?.status==='RUNNING'?'최초 소식 수집 중입니다.':'최초 수집 전입니다.':collection.status==='PARTIAL'?'확인된 소식이 없습니다.':'선별된 소식이 없습니다.'}</Typography>}
  <Box sx={{display:'flex',flexDirection:'column',gap:'6px'}}>{rows.map(item=><NewsCard key={item.id} item={item} open={()=>open(`/detail/stock-news/${item.id}?${new URLSearchParams({type,snapshot:first!.meta.snapshot})}`,{state:{newsListKey:entry,newsAccountId:accountId,listEntryKey:location.key}})}/>)}</Box>
  {query.hasNextPage&&<Button data-testid="news-more" fullWidth disabled={query.isFetchingNextPage} onClick={()=>void query.fetchNextPage()} sx={{minHeight:32,borderRadius:'6px',bgcolor:'#243045',color:'#F5F7FF',fontSize:11,fontWeight:600}}>더보기</Button>}
 </Box>;
}
export function StockNewsDetailPage(){
 const {accountId,accounts}=useActiveAccount(),{newsId}=useParams(),[params]=useSearchParams(),location=useLocation(),navigate=useNavigate(),back=useReturnNavigation('/detail/stock-news');
 const type=(filters.some(([v])=>v===params.get('type'))?params.get('type'):'ALL') as NewsFilter,snapshot=params.get('snapshot')??undefined;
 const entry=String(location.state?.newsListKey??'direct'),sameAccount=!location.state?.newsAccountId||location.state.newsAccountId===accountId;
 const listing=useNewsList(accountId,type,entry,sameAccount,snapshot),query=useQuery({queryKey:['stockNewsDetail',accountId,newsId,type,snapshot],queryFn:({signal})=>getNewsDetail(accountId!,newsId!,type,snapshot,signal),enabled:!!accountId&&!!newsId&&sameAccount,staleTime:60_000,refetchOnWindowFocus:false});
 const report=query.data?.meta.accountId===accountId?query.data:undefined,item=report?.data,[busy,setBusy]=useState(false),lock=useRef(false),touch=useRef<{x:number;y:number;t:number}|null>(null);
 const bodyRef=useRef<HTMLDivElement>(null);
 const lastSwipe=useRef(Number.NEGATIVE_INFINITY);
 const scope=useRef(accountId);scope.current=accountId;
 const move=async(direction:number)=>{const target=direction<0?report?.meta.previousId:report?.meta.nextId;if(!target||lock.current||!sameAccount)return;lock.current=true;setBusy(true);const owner=accountId;try{
  {let data=listing.data;if(!data){const first=await listing.refetch();if(first.isError)throw Error('NEWS_LIST_FAILED');data=first.data;}while(data&&!data.pages.some(p=>p.data.some(r=>r.id===target))&&data.pages.at(-1)?.meta.nextCursor){const result=await listing.fetchNextPage();if(result.isError)throw Error('NEWS_NEXT_PAGE_FAILED');data=result.data;}}
  if(scope.current!==owner)return;const p=new URLSearchParams(params);p.set('snapshot',report!.meta.snapshot);navigate(`/detail/stock-news/${target}?${p}`,{replace:true,state:location.state});
 }catch{setNavigationError(true);}finally{lock.current=false;setBusy(false);}};
 const [navigationError,setNavigationError]=useState(false);
 useEffect(()=>{touch.current=null;if(bodyRef.current)bodyRef.current.scrollTop=0;setNavigationError(false);},[newsId,accountId]);
 return <Box data-testid="stock-news-detail" sx={{height:'100%',minHeight:0,display:'flex',flexDirection:'column',touchAction:'pan-y'}}
  onTouchStart={e=>{if(e.touches.length!==1||e.touches[0]!.clientX<24||e.touches[0]!.clientX>innerWidth-24||(e.target as Element).closest('button,a,input,[role=button]')){touch.current=null;return;}const t=e.touches[0]!;touch.current={x:t.clientX,y:t.clientY,t:performance.now()};}}
  onTouchMove={e=>{const s=touch.current,t=e.touches[0];if(!s||!t)return;if(Math.abs(t.clientY-s.y)>16&&Math.abs(t.clientY-s.y)>Math.abs(t.clientX-s.x))touch.current=null;}}
  onTouchCancel={()=>{touch.current=null;}} onTouchEnd={e=>{const s=touch.current;touch.current=null;if(!s||busy||e.changedTouches.length!==1||performance.now()-lastSwipe.current<400)return;const t=e.changedTouches[0]!,dx=t.clientX-s.x,dy=t.clientY-s.y;if(performance.now()-s.t<800&&Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.8){lastSwipe.current=performance.now();void move(dx<0?1:-1);}}}>
  <PageHeader embedded title={<Box component="span" sx={{display:'inline-flex',alignItems:'center',gap:'6px',fontWeight:600,fontSize:20}}>소식 요약</Box>} backIcon={<span>‹</span>} showBack showBackTablet onBack={back} showAdd={false} action={<Typography data-testid="news-detail-count" sx={{fontSize:11,color:'#94A3B8'}}>{report?`${report.meta.ordinal}/${report.meta.total}`:'—'}</Typography>}/>
  <Box data-testid="news-detail-navigation" sx={{display:'flex',flexShrink:0,height:32,mt:0,mb:'8px',alignItems:'center',justifyContent:'space-between',gap:'8px'}}><Button disabled={busy||!report?.meta.previousId} onClick={()=>void move(-1)} sx={{p:0,minWidth:40,minHeight:32,height:32,fontSize:12,color:'#F0F5FF'}}>‹ 이전</Button><Typography noWrap sx={{fontSize:12,minWidth:0}}>{item?`${item.securities.map(s=>s.name).join(' · ')} · ${newsTypeNames[item.type]}`:''}</Typography><Button disabled={busy||!report?.meta.nextId} onClick={()=>void move(1)} sx={{p:0,minWidth:40,minHeight:32,height:32,fontSize:12,color:'#F0F5FF'}}>다음 ›</Button></Box>
  <Box data-testid="news-summary-card" aria-busy={query.isPending&&sameAccount} sx={{p:{xs:'16px',sm:'12px'},borderRadius:{xs:'12px',sm:'8px'},bgcolor:{xs:'#101826',sm:'#111827'},border:item?.isHeld&&sameAccount?'1px solid #FBBF24':'1px solid transparent',display:'flex',flexDirection:'column',gap:'8px',minWidth:0,minHeight:0,flex:1,overflow:'hidden'}}>
   {item&&sameAccount&&<Box data-testid="news-summary-metadata" sx={{flexShrink:0,display:'flex',alignItems:'baseline',justifyContent:'space-between',gap:'8px',flexWrap:'wrap'}}><Box sx={{display:'flex',gap:'4px',alignItems:'baseline',flexWrap:'wrap',minWidth:0}}><Typography component="h2" sx={{fontSize:{xs:15,sm:16},lineHeight:{xs:'22px',sm:'23px'},fontWeight:{xs:400,sm:600},overflowWrap:'anywhere',color:item.isHeld?'#FBBF24':undefined}}>{item.securities.map(s=>s.name).join(' · ')} · {newsTypeNames[item.type]}</Typography><Typography sx={{fontSize:10,lineHeight:'16px',color:'#94A3B8'}}>{newsTime(item.publishedAt,item.publishedPrecision==='DATE')}</Typography></Box><Box sx={{fontSize:12,lineHeight:'19px'}}><OriginalLink item={item}/></Box></Box>}
   <Box ref={bodyRef} data-no-pull-refresh data-testid="news-summary-body" sx={{flex:1,minHeight:0,overflowY:'auto',overscrollBehavior:'contain',scrollbarWidth:'thin',display:'flex',flexDirection:'column',gap:'8px'}}>
    {!sameAccount&&<Typography role="status" sx={{fontSize:12}}>계좌가 변경되었습니다. 현재 계좌 목록에서 다시 선택해 주세요.<Button onClick={()=>navigate('/detail/stock-news',{replace:true})}>목록으로</Button></Typography>}
    {(query.isError||accounts.isError)&&<QueryErrorNotice message="소식 요약 조회 실패" onRetry={()=>void query.refetch()}/>}
    {navigationError&&<QueryErrorNotice message="다음 소식 조회 실패 · 현재 소식 유지" onRetry={()=>{setNavigationError(false);void move(1);}}/>}
    {query.isPending&&sameAccount&&<Typography role="status" sx={{fontSize:12,color:'#94A3B8'}}>저장된 요약을 조회하고 있습니다.</Typography>}
    {item&&sameAccount&&<>
     <Typography component="h3" sx={{flexShrink:0,fontSize:{xs:12,sm:14},lineHeight:{xs:'19px',sm:'21px'},fontWeight:{xs:400,sm:600},overflowWrap:'anywhere'}}>{item.title}{item.access==='PAID'&&<PaidIcon/>}</Typography>
     <Typography data-testid="news-content-summary" sx={{flexShrink:0,fontSize:12,lineHeight:{xs:'19px',sm:'18px'},color:{xs:'#EDF2FA',sm:'#CBD5E1'},overflowWrap:'anywhere',whiteSpace:'pre-line'}}>{item.summary??'요약 정보 없음'}</Typography>
     {item.access==='LOGIN'&&<Typography sx={{flexShrink:0,fontSize:10,color:'#94A3B8'}}>원문 열람에 로그인이 필요합니다.</Typography>}
     {item.access==='UNKNOWN'&&<Typography sx={{flexShrink:0,fontSize:10,color:'#94A3B8'}}>원문 열람 조건 미확인</Typography>}
    </>}
   </Box>
  </Box>
 </Box>;
}
