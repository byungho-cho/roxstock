import {useEffect,useRef,useState} from 'react';
import {useInfiniteQuery,useQuery,useQueryClient} from '@tanstack/react-query';
import {Box,Button,Tooltip,Typography} from '@mui/material';
import {useSearchParams} from 'react-router-dom';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {useListNavigation,useReturnNavigation,usePageMemory} from '../../hooks/navigation/usePageMemory';
import {PageHeader} from '../../components/navigation/Navigation';
import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {ApiError} from '../../data/apiClient';
import {amount,won,rate,type Totals} from './profitData';
import {getProfitStatistics,getProfitEntries,profitEntriesPath,type ProfitScope,type MoneyTotals} from './profitDetailApi';
const card={bgcolor:'#101725',borderRadius:'8px',px:'12px',py:'8px',minWidth:0};
const tone=(v:string|null)=>v===null||Number(v)===0?'#F0F2F7':v.startsWith('-')?'#60A5FA':'#FB7185';
const annualTone=(v:string|null)=>v===null||Number(v)===0?'#F0F2F7':v.startsWith('-')?'#63A3F5':'#F26E7A';
const text={fontSize:12,lineHeight:'20px',fontWeight:600};
const decimalTotals=(t:MoneyTotals)=>Object.fromEntries(Object.entries(t).map(([k,v])=>[k,amount(v)])) as Totals;
export function StockProfitYearsPage(){
 const {accountId,accounts}=useActiveAccount(),[params]=useSearchParams(),security=params.get('securityId')??'',year=params.get('year'),back=useReturnNavigation('/detail/investment-profit'),go=useListNavigation();
 const query=useQuery({queryKey:['profitStatistics',accountId,security],queryFn:({signal})=>getProfitStatistics(accountId!,security,signal),enabled:!!accountId&&!!security,staleTime:30_000});
 const selected=useRef<HTMLDivElement>(null),[positioned,setPositioned]=usePageMemory('profit-year-initial:'+security,false);
 useEffect(()=>{if(query.data&&!positioned){setPositioned(true);if(year)requestAnimationFrame(()=>selected.current?.scrollIntoView({block:'start'}));}},[query.data,positioned,year]);
 return <><PageHeader embedded title={<Box component="span" sx={{fontSize:20,lineHeight:'28px',fontWeight:700}}>종목별 연도 손익</Box>} titleAriaLabel="종목별 연도 손익" showBack showBackTablet showAdd={false} onBack={back}/><Box data-testid="profit-stock-years" data-restoration-ready={!!query.data} sx={{display:'flex',flexDirection:'column',gap:'8px',pb:'80px'}}>
  {(query.isError||accounts.isError)&&<QueryErrorNotice message="연도별 손익을 조회하지 못했습니다." onRetry={()=>{void query.refetch();void accounts.refetch();}}/>}
  {query.isPending&&<Typography role="status" sx={text}>손익을 조회하고 있습니다.</Typography>}
  {query.data&&<><Box sx={{display:'flex',justifyContent:'space-between',...text}}><span>{query.data.security.name}({query.data.security.symbol})</span><Box component="span" sx={{color:'#9EABBF'}}>연도별 손익</Box></Box>{!query.data.years.length&&<Typography sx={{...text,textAlign:'center',py:2}}>내용이 없습니다.</Typography>}
  {query.data.years.map(y=>{const t=decimalTotals(y.totals);return <Box key={y.year} ref={String(y.year)===year?selected:undefined} data-testid="profit-year-card" data-scroll-item={String(y.year)} sx={{...card,display:'flex',flexDirection:'column',gap:'4px',color:'#F0F2F7'}}>
   <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #2E384A',pb:'4px'}}><Typography component="h2" sx={{fontSize:16,lineHeight:'24px',fontWeight:600}}>{y.year}년</Typography><Button onClick={()=>go(profitEntriesPath({securityId:security,year:String(y.year)}))} sx={{p:0,minWidth:0,minHeight:20,height:20,...text,color:'#63A3F5'}}>상세보기</Button></Box>
   {([['매수총액',t.buy,undefined],['매도총액',t.sell,undefined],['매매손익',t.trading,t.buy],['배당포함 총손익',t.total,t.buy]] as const).map(([label,value,denominator])=><Box key={label} sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:1,minHeight:20,...text}}><span>{label}{denominator!==undefined?'  '+rate(value,denominator):''}</span><Typography sx={{...text,textAlign:'right',color:label==='매수총액'||label==='매도총액'?'#9EABBF':annualTone(y.totals[label==='매매손익'?'trading':'total'])}}>{won(value,denominator!==undefined)}</Typography></Box>)}
   <Box sx={{borderTop:'1px solid #2E384A',pt:'4px',display:'flex',flexDirection:'column',gap:'4px'}}><Typography sx={text}>월별 손익 · 배당</Typography>{y.months.map(m=><Box key={m.month} sx={{display:'contents'}}>{(['trading','dividend'] as const).filter(kind=>kind==='trading'?m.hasTrading!==false:m.hasDividend!==false).map(kind=><Button key={kind} fullWidth onClick={()=>go(profitEntriesPath({securityId:security,year:String(y.year),month:String(Number(m.month.slice(5)))}))} data-testid="profit-year-month-row" sx={{p:0,minHeight:20,display:'grid',gridTemplateColumns:'76px 30px minmax(0,1fr) minmax(0,40%)',alignItems:'center',gap:'8px',...text,color:'#F0F2F7',textTransform:'none',borderRadius:0,textAlign:'left'}}><Box component="span" sx={{whiteSpace:'nowrap'}}>{m.month.replace('-','.')}</Box><Box component="span" data-testid="profit-year-month-kind" sx={{color:kind==='dividend'?'#F7C44A':tone(m.totals[kind])}}>{kind==='trading'?'매매':'배당'}</Box><Tooltip title={kind==='trading'?'매매손익 ÷ 해당 월 매도분 매수원가':'배당액 ÷ 해당 연도 매수총액'} enterTouchDelay={0}><Box component="span" data-testid="profit-year-month-rate" sx={{color:tone(m.totals[kind]),textAlign:'right',whiteSpace:'nowrap'}}>{rate(amount(m.totals[kind]),kind==='trading'?amount(m.totals.cost):t.buy)}</Box></Tooltip><Box component="span" sx={{color:tone(m.totals[kind]),whiteSpace:'nowrap',textAlign:'right'}}>{won(amount(m.totals[kind]),true)}</Box></Button>)}</Box>)}</Box>
  </Box>;})}</>}
 </Box></>;
}
export function ProfitEntriesPage(){
 const {accountId,accounts}=useActiveAccount(),[params]=useSearchParams(),back=useReturnNavigation('/detail/investment-profit'),client=useQueryClient();
 const scope:ProfitScope=Object.fromEntries(['securityId','year','month'].flatMap(k=>params.has(k)?[[k,params.get(k)!]]:[])),signature=JSON.stringify(scope);
 // Do not reuse cached pages created before per-entry purchase-cost denominators were added.
 const key=['profitEntries',accountId,signature,'RATE_BASIS_V2'],scopeId=String(accountId)+':'+signature;
 const liveScope=useRef(scopeId);liveScope.current=scopeId;
 const [visible,setVisible]=usePageMemory('profit-visible:'+signature,1),[moreError,setMoreError]=useState(false),[waiting,setWaiting]=useState(false),lock=useRef(false);
 const query=useInfiniteQuery({queryKey:key,initialPageParam:undefined as {snapshot:string;cursor:string}|undefined,queryFn:({signal,pageParam})=>getProfitEntries(accountId!,scope,pageParam,signal),getNextPageParam:last=>last.nextCursor?{snapshot:last.snapshot,cursor:last.nextCursor}:undefined,enabled:!!accountId,staleTime:30_000,refetchOnMount:false,refetchOnWindowFocus:false,retry:false});
 const pages=query.data?.pages??[],first=pages[0],rows=pages.slice(0,visible).flatMap(p=>p.rows),groups=new Map<string,typeof rows>();for(const row of rows){const month=row.date.slice(0,7);groups.set(month,[...(groups.get(month)??[]),row]);}
 useEffect(()=>{if(pages.length===visible&&query.hasNextPage&&!query.isFetchingNextPage&&!query.isFetchNextPageError)void query.fetchNextPage({cancelRefetch:false});},[pages.length,visible,query.hasNextPage,query.isFetchingNextPage,query.isFetchNextPageError,query.fetchNextPage]);
 useEffect(()=>{lock.current=false;setWaiting(false);setMoreError(false);},[scopeId]);
 const more=async()=>{if(lock.current)return;lock.current=true;const owner=scopeId;setMoreError(false);try{if(pages.length>visible){setVisible(visible+1);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));return;}setWaiting(true);const result=await query.fetchNextPage({cancelRefetch:false});if(liveScope.current!==owner)return;if(result.isError)throw result.error;setVisible(visible+1);}catch(e){if(liveScope.current!==owner)return;if(e instanceof ApiError&&e.code==='PROFIT_SOURCE_CHANGED'){setVisible(1);await client.resetQueries({queryKey:key,exact:true});}setMoreError(true);}finally{if(liveScope.current===owner){lock.current=false;setWaiting(false);}}};
 const amountWidth=Math.min(210,Math.max(115,...rows.map(r=>won(amount(r.amount),true).length*7)));
 const heading=first?.security?`${first.security.name}(${first.security.symbol})`:[scope.year?scope.year+'년':'전체 기간',scope.month?scope.month+'월':'','전체 종목'].filter(Boolean).join(' ');
 return <><PageHeader embedded title="손익·배당 내역" showBack showBackTablet showAdd={false} onBack={back}/><Box data-testid="profit-entries" data-restoration-ready={!!first} sx={{display:'flex',flexDirection:'column',gap:'8px',pb:'80px'}}>
  {(query.isError&&!first||accounts.isError)&&<QueryErrorNotice message="손익·배당 내역을 조회하지 못했습니다." onRetry={()=>{void query.refetch();void accounts.refetch();}}/>}
  {query.isPending&&<Typography role="status" sx={text}>내역을 조회하고 있습니다.</Typography>}
  {first&&<><Box sx={{display:'flex',justifyContent:'space-between',gap:1,...text}}><span>{heading}</span><Box component="span" data-testid="profit-visible-count" sx={{whiteSpace:'nowrap',color:'#9EABBF'}}>{rows.length}/{first.total}건</Box></Box>{!rows.length&&<Typography sx={{...text,textAlign:'center',py:2}}>내용이 없습니다.</Typography>}
   {[...groups].map(([month,entries])=><Box key={month} data-testid="profit-month-group" sx={card}><Box sx={{display:'flex',justifyContent:'space-between',gap:1,borderBottom:'1px solid #2E384A',pb:'4px',mb:'4px'}}><Typography sx={{fontSize:16,lineHeight:'24px',fontWeight:600}}>{month.replace('-','.')}</Typography><Typography data-testid="profit-month-total" sx={{fontSize:16,lineHeight:'24px',fontWeight:600,textAlign:'right',color:tone(first.months.find(m=>m.month===month)?.totals.total??null)}}>{won(amount(first.months.find(m=>m.month===month)?.totals.total),true)}</Typography></Box>
    {entries.map(r=><Box key={r.key} data-testid="profit-entry" data-entry-id={r.key} sx={{display:'grid',gridTemplateColumns:`60px 30px minmax(0,1fr) minmax(0,1fr) ${amountWidth}px`,gap:'8px',alignItems:'center',py:'4px',...text}}><Box component="span" sx={{whiteSpace:'nowrap'}}>{r.date.slice(5).replace('-','.')}</Box><Box component="span" data-testid="profit-entry-kind" sx={{color:r.kind==='DIVIDEND'?'#F7C44A':tone(r.amount)}}>{r.kind==='DIVIDEND'?'배당':'매매'}</Box><Typography noWrap title={scope.securityId?'':r.security.name} sx={text}>{scope.securityId?'':r.security.name}</Typography><Tooltip title={r.kind==='DIVIDEND'?'배당액 ÷ 해당 종목·연도 매수총액':'매매손익 ÷ 해당 매도분 매수원가'} enterTouchDelay={0}><Box component="span" data-testid="profit-entry-rate" sx={{...text,textAlign:'right',color:tone(r.amount),overflowWrap:'anywhere'}}>{rate(amount(r.amount),amount(r.rateDenominator))}</Box></Tooltip><Typography noWrap title={won(amount(r.amount),true)} sx={{...text,fontSize:won(amount(r.amount),true).length>28?10:12,textAlign:'right',color:tone(r.amount)}}>{won(amount(r.amount),true)}</Typography></Box>)}
   </Box>)}
   {moreError&&<QueryErrorNotice message="추가 내역을 조회하지 못했습니다. 기존 내역은 유지합니다." onRetry={()=>void more()}/>}
   {(pages.length>visible||query.hasNextPage)&&<Button data-testid="profit-more" fullWidth disabled={waiting} onClick={()=>void more()} sx={{mt:'8px',minHeight:36,bgcolor:'#1F293B',fontSize:12}}>{waiting?'불러오는 중…':'더보기'}</Button>}
  </>}
 </Box></>;
}
