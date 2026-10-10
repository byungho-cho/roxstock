import {FairPriceCard} from './FairPriceCard';
import {StockNavigation as StockHeaderNavigation} from '../stocks/StockNavigation';
import {FinancialPeriodHeader} from './FinancialPeriodHeader';
import {ActionButton} from '../../components/common/Common';
import {FinancialRefreshDialog,FinancialRefreshButton,hasSavedFinancialData,type RefreshPeriod} from '../stocks/FinancialRefreshControls';
import {useFinancialCondition,useFinancialCenterYear} from './useFinancialCondition';
import {colors,pageMetrics} from '../../styles/tokens';
import {largeMoney} from '../../utils/largeMoney';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {useDetailSwipe} from '../../hooks/useDetailSwipe';
import {useStocks} from '../../hooks/useMockData';
import type {StockNavigation} from '../../hooks/useStockNeighbors';
import { ValueStockCard } from './ValueStockCard';
import { Box, Button, CircularProgress, Skeleton, Typography, useMediaQuery } from '@mui/material';
import { useEffect,useRef,useState,type ReactNode } from 'react';
import { useLocation,useNavigate,useParams } from 'react-router-dom';
import { PageHeader } from '../../components/navigation/Navigation';
import { OverlayRegionScrollbar } from '../../components/navigation/OverlayRegionScrollbar';
import { usePageMemory, useReturnNavigation } from '../../hooks/navigation/usePageMemory';
import { ValueFinancialCharts } from './ValueFinancialCharts';
import { detailValues,listValues,format,movement,number,seoulYear,type ValueDetail,type ValueList } from './valueApi';
const muted='#94A3B8',cardStyle={bgcolor:'#111827',borderRadius:'8px',p:'8px 16px'},controlStyle={font:'inherit',fontSize:12,color:'#F1F5F9',background:'#111927',border:'1px solid #273244',borderRadius:8,height:28,padding:'0 8px',minWidth:0};
function useStoredQuery<T>(key:string,request:(signal:AbortSignal)=>Promise<T>) {
 const {accountId}=useActiveAccount(),latest=useRef(request);latest.current=request;
 const query=useQuery({queryKey:['valueStored',accountId,key],queryFn:({signal})=>latest.current(signal),staleTime:30_000,gcTime:30*60_000,refetchOnMount:'always'});
 return {data:query.data,pending:query.isFetching,error:query.error?.message,retry:()=>void query.refetch()};
}
function Status({pending,error,retry,hasData}:{pending:boolean;error?:string;retry:()=>void;hasData:boolean}) {
 return <>{error&&<Box role="alert" sx={{fontSize:10,p:'8px',bgcolor:'#111927',borderRadius:'8px',mb:'8px'}}>조회에 실패했습니다. {error}<Button onClick={retry} sx={{fontSize:10,minWidth:0,p:'2px 8px'}}>재시도</Button></Box>}</>;
}
function Empty(){return <Box data-testid="value-empty" sx={{height:'100%',minHeight:160,flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:muted,fontSize:12}}>내용이 없습니다.</Box>;}
function Line({label,children,color}:{label:string;children:ReactNode;color?:string}){return <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',minHeight:20,fontSize:12}}><span style={{color:muted}}>{label}</span><Box sx={{textAlign:'right',overflowWrap:'anywhere',fontWeight:600,color}}>{children}</Box></Box>;}
function Detail({data,openCharts,refresh}:{data:ValueDetail;openCharts:()=>void;refresh:ReactNode}) {
 const price=number(data.security.currentPrice),previous=number(data.security.previousClosePrice),change=price!==null&&previous!==null?price-previous:null;
 const rate=change!==null&&previous!==null&&previous>0?change/previous*100:null,w=number(data.w),upside=w===null?null:(w-1)*100;
 const heading=(title:string,note?:string)=><Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',minHeight:20,mb:'8px'}}><Typography sx={{fontSize:15,fontWeight:600}}>{title}</Typography>{note&&<span style={{fontSize:10,color:muted}}>{note}</span>}</Box>;
 return <Box data-testid="value-detail" sx={{display:'grid',gap:'8px','& [data-value-row]':{minHeight:20}}}>
  <Box sx={{...cardStyle,display:'grid',gap:'8px'}}><Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',minHeight:28}}><Box sx={{display:'flex',alignItems:'center',gap:'8px',minWidth:0,flexWrap:'wrap'}}><span data-testid="value-current-price" style={{fontSize:22,fontWeight:600,color:movement(change)}}>{format(price,0,'원')}</span>{refresh}</Box><Box sx={{color:'#FBBF24',fontSize:10,fontWeight:600,border:'1px solid #FBBF24',borderRadius:'6px',px:'8px',py:'4px',flexShrink:0}}>W {format(w,2)}</Box></Box><Line label="전일대비" color={movement(change)}>{format(change,0,'원')} ({format(rate,1,'%')})</Line><Line label="상승여력 (W 0.8 기준)" color={movement(upside)}>{price===null||w===null?'—':format(price*(w-1),0,'원')} ({format(upside,1,'%')})</Line></Box>
  <FairPriceCard data={data}/>
  <Box sx={cardStyle}>{heading('계산 기준','최근 결산')}<Box sx={{display:'grid',gap:'8px'}}><Line label="자기자본">{largeMoney(data.equity)}</Line><Line label="예상 ROE">{format(data.valuation?.roe,1,'%')}</Line><Line label="할인율">{format(data.requiredReturn,1,'%')}</Line></Box></Box>
  <Box sx={cardStyle}>{heading('핵심 재무지표',data.shareBasis?data.shareBasis.periodEndDate+' '+data.shareBasis.stockKind:data.year+' 기준')}<Box sx={{display:'grid',gap:'8px'}}><Box data-testid="value-issued-shares" sx={{fontWeight:700,'& span,& .MuiBox-root':{fontWeight:700}}}><Line label="발행주식수">{format(data.issuedShares,0,'주')}</Line></Box><Box data-testid="value-treasury-shares"><Line label="자기주식수">{format(data.treasuryShares,0,'주')}</Line></Box><Box data-testid="value-outstanding-shares"><Line label="유통주식수">{format(data.outstandingShares,0,'주')}</Line></Box><Line label="BPS">{format(data.valuation?.bps,0,'원')}</Line><Line label="EPS">{format(data.valuation?.eps,0,'원')}</Line><Line label="예상 ROE">{format(data.valuation?.roe,1,'%')}</Line><Line label="요구수익률">{format(data.requiredReturn,1,'%')}</Line><Line label="PER">{format(data.valuation?.per,2,'배')}</Line><Line label="PBR">{format(data.valuation?.pbr,2,'배')}</Line></Box></Box>
  <Button onClick={openCharts} sx={{height:36,fontSize:12,bgcolor:'#111827',borderRadius:'8px',color:'#F1F5F9'}}>재무지표 보기</Button>
  <Box sx={cardStyle}>{heading('적정주가 계산식')}<Typography sx={{fontSize:10,color:muted,lineHeight:'18px',overflowWrap:'anywhere'}}>BPS × [1 + (ROE ÷ 100 − 0.08) × 지속계수 ÷ 0.08]<br/>W = 지속계수 0.8 적정주가 ÷ 현재가</Typography></Box>
  <Box sx={cardStyle}>{heading('데이터 기준')}<Line label="기준연도">{data.year}</Line><Line label="결산 기준일">{data.closingDate??'—'}</Line><Line label="지표 기준일">{data.valuation?.metricDate??'—'}</Line><Line label="주가 기준일">{data.security.priceUpdatedAt?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(data.security.priceUpdatedAt)):'—'}</Line>{(!data.valuation||price===null)&&<Typography sx={{fontSize:10,color:muted,mt:'8px'}}>지표 또는 주가가 미수집되어 적정주가·W를 계산할 수 없습니다.</Typography>}</Box>
 </Box>;
}
export function ValueAnalysisPage(){
 const tablet=useMediaQuery('(min-width:600px)'),location=useLocation(),navigate=useNavigate(),{stockId}=useParams(),params=new URLSearchParams(location.search),currentYear=seoulYear();
 const returnToSource=useReturnNavigation('/more'),client=useQueryClient(),{accountId}=useActiveAccount(),{data:accountStocks}=useStocks(undefined,{enabled:!!location.state?.stockNavigation});
 const source=location.state?.stockNavigation as StockNavigation|undefined,fromStockList=!!source;
 const sourceItems=source&&source.accountId===accountId?source.ids.flatMap(id=>{const item=accountStocks?.find(s=>s.id===id);return item?[item]:[];}):null;
 const [year,setYear]=useFinancialCondition('year',currentYear,currentYear),[draft,setDraft]=usePageMemory('value-draft',''),[query,setQuery]=usePageMemory('value-query','');
 const [rememberedSelected,setSelected]=usePageMemory<string|null>('value-selected',()=>stockId??params.get('selected'));
 const selected=stockId??params.get('selected')??rememberedSelected;
 const [mode,setMode]=useFinancialCondition<'annual'|'quarter'>('mode','annual',currentYear);
 const [centerYear,setCenterYear]=useFinancialCenterYear(currentYear,'annualStart'),[quarterStart,setQuarterStart]=useFinancialCondition('quarterStart',currentYear+':1',currentYear),[refreshOpen,setRefreshOpen]=useState(false);
 const endYear=centerYear+1,annualStart=centerYear-1;
 useEffect(()=>{if(mode==='annual'&&(params.get('centerYear')!==String(centerYear)||params.has('annualStart')||params.has('endYear')))setCenterYear(centerYear);},[endYear,mode,location.search]);
 const [visibleCount,setVisibleCount]=usePageMemory('value-visible-count',100);
 const view=params.get('view')??(stockId?'detail':'list'),chart=view==='chart',coverDetail=(!tablet||fromStockList)&&view==='detail';
 const listKey=JSON.stringify([year,query]),list=useStoredQuery<ValueList>(listKey,signal=>listValues(year,query,signal));
 const [retainedList,setRetainedList]=useState<ValueList>();
 useEffect(()=>{if(list.data)setRetainedList(list.data);},[list.data]);
 const listData=list.data??retainedList,listCurrent=!!list.data;
 const [startYear,startQuarter]=mode==='annual'?[annualStart,1]:quarterStart.split(':').map(Number),[quarterCount]=useFinancialCondition('count',tablet?10:3,currentYear);
 const count=mode==='annual'?3:quarterCount;
 const detailKey=JSON.stringify([selected,year,mode,startYear,startQuarter,count]);
 const detail=useStoredQuery<ValueDetail|null>(detailKey,signal=>selected?detailValues(selected,year,mode,startYear,startQuarter,count,signal):Promise.resolve(null));
 const [retainedDetail,setRetainedDetail]=useState<ValueDetail>();
 useEffect(()=>{if(detail.data)setRetainedDetail(detail.data);},[detail.data]);
 const shownDetail=detail.data??(retainedDetail?.security.id===selected&&retainedDetail.year===year?retainedDetail:undefined);
 const detailStatus=<><Status pending={detail.pending} error={detail.error} retry={detail.retry} hasData={!!shownDetail}/>{shownDetail&&!detail.data&&<Typography sx={{fontSize:10,color:muted,mb:'8px'}}>이전 기간 결과 · {shownDetail.mode==='annual'?'연간':'분기'} {shownDetail.rows[0]?.label}부터</Typography>}</>;
 const leftRef=useRef<HTMLDivElement>(null),rightRef=useRef<HTMLDivElement>(null),searchRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(view==='list')searchRef.current?.focus({preventScroll:true});},[view]);
 useEffect(()=>{if(sourceItems||stockId||!list.data)return;const rows=list.data.rows;if(rows.length&&!rows.some(row=>row.id===selected))setSelected(rows[0].id);else if(!rows.length&&!stockId)setSelected(null);},[list.data,selected,setSelected,stockId,!!sourceItems]);
 const rows=fromStockList?(sourceItems??[]):list.data?.rows??[],index=rows.findIndex(row=>row.id===selected),previous=index>0?rows[index-1]:null,next=index>=0&&index<rows.length-1?rows[index+1]:null;
 const goView=(target:string,id=selected,replace=false)=>{const search=new URLSearchParams(location.search);search.set('view',target);for(const [k,v] of Object.entries({year,mode,centerYear,quarterStart,count}))search.set(k,String(v));if(id)search.set('selected',id);else search.delete('selected');navigate(location.pathname+'?'+search,{replace,state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key}});};
 const choose=(id:string)=>{setSelected(id);goView(!tablet&&view==='list'?'detail':view,id);};
 const move=(direction:number)=>{const target=direction<0?previous:next;if(target&&(sourceItems||!fromStockList&&listCurrent)){setSelected(target.id);const search=new URLSearchParams(location.search);for(const [k,v] of Object.entries({selected:target.id,year,mode,centerYear,quarterStart,count}))search.set(k,String(v));navigate((sourceItems?`/stocks/${target.id}/value`:location.pathname)+'?'+search,{replace:true,state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key}});}};
 useEffect(()=>{
  for(const neighbor of [previous,next]){if(!neighbor)continue;const key=JSON.stringify([neighbor.id,year,mode,startYear,startQuarter,count]);
   void client.prefetchQuery({queryKey:['valueStored',accountId,key],staleTime:30_000,queryFn:({signal})=>detailValues(neighbor.id,year,mode,startYear,startQuarter,count,signal)});
  }
 },[client,accountId,previous?.id,next?.id,year,mode,startYear,startQuarter,count]);
 const currentName=detail.data?.security.name??rows.find(row=>row.id===selected)?.name??(selected?'종목 조회 중':'가치분석');
 const currentSymbol=detail.data?.security.symbol??rows.find(row=>row.id===selected)?.symbol??'—';
 const composing=useRef(false),confirmedQuery=useRef(query);
 useEffect(()=>{confirmedQuery.current=query;},[query]);
 const confirmSearch=()=>{if(composing.current)return;const next=(searchRef.current?.value??draft).trim();if(next!==confirmedQuery.current){confirmedQuery.current=next;setQuery(next);setVisibleCount(100);}searchRef.current?.blur();};
 const listContent=<><Box sx={{display:'flex',gap:'8px',mb:'8px'}}>
  <Box component="form" onSubmit={event=>{event.preventDefault();confirmSearch();}} sx={{flex:1,minWidth:0,display:'flex',gap:'8px',height:36,border:'1px solid #1e293b',alignItems:'center',bgcolor:'#111927','&:focus-within':{borderColor:'#3b82f6'},borderRadius:'8px',px:'8px'}}>
   <button aria-label="검색 확인" type="submit" style={{border:0,padding:0,background:'transparent',height:28,display:'flex',alignItems:'center'}}><img src="/value-v04/search.svg" width="16" height="16" alt=""/></button>   <input ref={searchRef} enterKeyHint="done" onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={event=>{if(event.key==='Enter'&&(composing.current||event.nativeEvent.isComposing||event.keyCode===229))event.preventDefault();}} aria-label="종목 검색" placeholder="종목명 또는 코드 검색" value={draft} onChange={event=>setDraft(event.target.value)} style={{...controlStyle,border:0,flex:1,minWidth:0,padding:0,outline:0}}/>{draft&&<button type="button" aria-label="검색어 지우기" onClick={()=>{setDraft('');setQuery('');setVisibleCount(100);searchRef.current?.focus();}} style={{background:'transparent',border:0,padding:0,display:'flex'}}><img src="/stocks-v03/clear.svg" alt="" width="16" height="16"/></button>}
  </Box><select aria-label="기준연도" value={year} onChange={event=>{setYear(Number(event.target.value));setVisibleCount(100);}} style={{...controlStyle,height:36,width:78,appearance:'none',paddingRight:24,backgroundImage:'url(/value-v04/select.svg)',backgroundRepeat:'no-repeat',backgroundPosition:'right 8px center'}}>{Array.from({length:currentYear-2015+1},(_,i)=>currentYear-i).map(y=><option key={y} value={y}>{y}</option>)}</select></Box>
  <Status pending={list.pending} error={list.error} retry={list.retry} hasData={!!listData}/>
  {list.pending&&!listData&&<Box aria-label="가치분석 목록 로딩" sx={{display:'grid',gap:'8px'}}>{[0,1,2].map(i=><Skeleton key={i} variant="rounded" height={148} sx={{borderRadius:'8px'}}/>)}</Box>}
  {listData&&<><Box sx={{display:'flex',justifyContent:'space-between',fontSize:10,color:muted,mb:'8px'}}><span>{listData.year}년 · W 내림차순{!listCurrent?' · 이전 조회 결과':''}</span><span>{listData.total.toLocaleString()}개</span></Box>{listData.rows.length===0?<Empty/>:<Box sx={{display:'grid',gap:'8px'}}>{listData.rows.slice(0,visibleCount).map(row=><ValueStockCard key={row.id} row={row} selected={row.id===selected} disabled={!listCurrent} onClick={()=>choose(row.id)}/>)}{visibleCount<listData.total&&<Button sx={{fontSize:12}} onClick={()=>setVisibleCount(n=>n+100)}>더 보기 ({Math.min(visibleCount,listData.total)} / {listData.total})</Button>}</Box>}</>}
 </>;
 const detailContent=<>{detailStatus}{shownDetail?<Detail data={shownDetail} openCharts={()=>goView('chart')} refresh={<FinancialRefreshButton stockId={selected!} compact onClick={()=>setRefreshOpen(true)}/>}/>:!selected&&!list.pending&&!list.error?<Empty/>:detail.pending?<Box sx={{p:'24px',textAlign:'center'}}><CircularProgress size={20}/></Box>:!detail.error?<Empty/>:null}</>;
 const swipe=useDetailSwipe(move,!refreshOpen&&(chart||coverDetail||tablet));
 const detailHeader=chart||coverDetail||(tablet&&!!selected);
 const headerBack=fromStockList?()=>chart?goView('detail',selected,true):returnToSource():detailHeader?undefined:returnToSource;
 const stockNavigation=fromStockList?<StockHeaderNavigation symbol={currentSymbol} previousName={previous?.name} nextName={next?.name} onPrevious={()=>move(-1)} onNext={()=>move(1)}/>:undefined;
 return <Box className="rox-home" data-testid={tablet?'T1700':'C1700'} data-restoration-ready={list.pending&&!listData?'false':'true'} data-list-condition={chart?JSON.stringify(['chart',selected,mode,...(mode==='quarter'?[startYear,startQuarter]:[])]):coverDetail?JSON.stringify(['detail',selected,year]):listKey} sx={{height:tablet&&!chart?'100%':undefined,minHeight:!chart&&!coverDetail?'100%':undefined,fontFamily:'RoxHomeInter, sans-serif',fontSize:12,color:'#F1F5F9'}}>
  <PageHeader embedded valueAnalysis title={fromStockList?currentName:detailHeader?<Box component="span" sx={{display:'flex',alignItems:'baseline',gap:.5,minWidth:0}}><Box component="span" title={currentName} sx={{fontSize:14,overflow:'hidden',textOverflow:'ellipsis'}}>{currentName}</Box><Box component="span" sx={{fontSize:10,color:muted,fontWeight:400,flexShrink:0}}> ({currentSymbol})</Box></Box>:'가치분석'} showAdd={false} stockNavigation={stockNavigation} variant={fromStockList?'detail':detailHeader?'standard':'detail'} showBackTablet={fromStockList||!detailHeader} onBack={headerBack} backIcon={<img src="/stocks-v03/back.svg" width="11" height="17" alt=""/>}/>
  {selected&&<FinancialRefreshDialog hasExistingData={hasSavedFinancialData(shownDetail?.rows??[])} initialPeriod={(chart&&mode==='quarter'?`Q${startQuarter}`:'ANNUAL') as RefreshPeriod} open={refreshOpen} onClose={()=>setRefreshOpen(false)} stockId={selected} startYear={chart?startYear:Math.max(2015,year-2)} endYear={chart?mode==='annual'?endYear:Math.floor((startYear*4+startQuarter-1+count-1)/4):year} collectedAt={shownDetail?.rows.flatMap(r=>r.collectedAt?[r.collectedAt]:[]).sort().at(-1)??null} onComplete={detail.retry}/>}
  {chart?<Box {...swipe} data-detail-swipe data-financial-chart sx={{touchAction:'pan-y'}}>
   <Box data-testid="financial-sticky-header" sx={{position:'sticky',top:0,zIndex:10,bgcolor:colors.canvas,pt:1,pb:0,mb:0,borderBottom:`1px solid ${colors.borderStrong}`}}>
   <Box sx={{display:'flex',gap:1,mb:1,height:28,alignItems:'center'}}>
    <Typography sx={{fontSize:14,fontWeight:600,whiteSpace:'nowrap'}}>재무지표</Typography>
    <FinancialRefreshButton stockId={selected!} compact onClick={()=>setRefreshOpen(true)}/>
    {shownDetail&&!detail.data&&<Typography noWrap role="status" title={`이전 기간 결과 · ${shownDetail.mode==='annual'?'연간':'분기'} ${shownDetail.rows[0]?.label}부터`} sx={{fontSize:10,color:muted,flex:1,minWidth:0}}>이전 기간 결과 · {shownDetail.mode==='annual'?'연간':'분기'} {shownDetail.rows[0]?.label}부터</Typography>}
    <Box sx={{display:'flex',gap:.5,ml:'auto'}}>{(['annual','quarter'] as const).map(value=><ActionButton key={value} size="small" aria-pressed={mode===value} tone={mode===value?'primary':'muted'} onClick={()=>setMode(value)}>{value==='annual'?'연간':'분기'}</ActionButton>)}</Box>
   </Box>
   {mode==='quarter'&&<select aria-label="시작기간" value={quarterStart} onChange={e=>setQuarterStart(e.target.value)} style={{...controlStyle,height:28,width:150,marginBottom:8}}>{Array.from({length:(currentYear-2015+1)*4},(_,i)=>{const y=currentYear-Math.floor(i/4),q=4-i%4;return <option key={y+':'+q} value={y+':'+q}>{y}년 {q}분기부터</option>;})}</select>}
   <FinancialPeriodHeader rows={mode==='annual'?Array.from({length:3},(_,i)=>{const year=centerYear+i-1;return {key:String(year),year,quarter:null,label:String(year),isEstimated:shownDetail?.rows.find(row=>row.year===year)?.isEstimated,collectionState:shownDetail?.rows.find(row=>row.year===year)?.collectionState};}):shownDetail?.rows??[]} centerYear={centerYear} currentYear={currentYear} onCenterChange={mode==='annual'?setCenterYear:undefined}/>
   </Box>
   <Status pending={detail.pending} error={detail.error} retry={detail.retry} hasData={!!shownDetail}/>{shownDetail&&<ValueFinancialCharts rows={shownDetail.rows} notes={shownDetail.notices} stockId={selected!} mode={mode} currentYear={currentYear}/>}
  </Box>:tablet&&!coverDetail?<Box sx={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:'8px',height:'100%',minHeight:0}}>
   <Box ref={leftRef} data-scroll-region="value-left" data-list-condition={listKey} sx={{overflowY:'auto',scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'},pb:'80px',minWidth:0,display:'flex',flexDirection:'column'}}>{listContent}</Box><OverlayRegionScrollbar scrollRef={leftRef} label="가치분석 목록 스크롤" offset={0}/>
   <Box ref={rightRef} {...swipe} data-detail-swipe data-scroll-region="value-right" data-list-condition={JSON.stringify([year,selected])} sx={{touchAction:'pan-y',overflowY:'auto',scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'},pb:'80px',minWidth:0}}>{!sourceItems&&list.data?.rows.length===0?<Empty/>:detailContent}</Box><OverlayRegionScrollbar scrollRef={rightRef} label="가치분석 상세 스크롤" offset={0}/>
  </Box>:coverDetail?<Box {...swipe} data-detail-swipe data-scroll-region={tablet?"value-right":undefined} sx={{touchAction:'pan-y',minHeight:`calc(100dvh - ${pageMetrics.headerHeight * 2}px)`}}>{detailContent}</Box>:listContent}
 </Box>;
}
