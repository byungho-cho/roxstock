import { Box, Button, CircularProgress, Typography, useMediaQuery } from '@mui/material';
import { useEffect,useRef,useState,type ReactNode,type TouchEvent } from 'react';
import { useLocation,useNavigate,useParams } from 'react-router-dom';
import { PageHeader } from '../../components/navigation/Navigation';
import { OverlayRegionScrollbar } from '../../components/navigation/OverlayRegionScrollbar';
import { usePageMemory } from '../../hooks/navigation/usePageMemory';
import { ValueFinancialCharts } from './ValueFinancialCharts';
import { detailValues,listValues,format,movement,number,seoulYear,type ValueDetail,type ValueList } from './valueApi';
const muted='#94A3B8',cardStyle={bgcolor:'#111927',borderRadius:'8px',p:'8px'},controlStyle={font:'inherit',fontSize:12,color:'#F1F5F9',background:'#111927',border:'1px solid #273244',borderRadius:8,height:28,padding:'0 8px',minWidth:0};
function useStoredQuery<T>(key:string,request:(signal:AbortSignal)=>Promise<T>) {
 const [slot,setSlot]=useState<{key:string;data?:T;error?:string;pending:boolean}>({key,pending:true}),[revision,setRevision]=useState(0);
 const latest=useRef(request);latest.current=request;
 useEffect(()=>{const controller=new AbortController();let active=true;
  setSlot(previous=>({key,data:previous.key===key?previous.data:undefined,pending:true}));
  latest.current(controller.signal).then(data=>{if(active)setSlot({key,data,pending:false});}).catch((error:unknown)=>{if(active)setSlot(previous=>({key,data:previous.key===key?previous.data:undefined,pending:false,error:error instanceof Error?error.message:'조회 실패'}));});
  return()=>{active=false;controller.abort();};
 },[key,revision]);
 return {...(slot.key===key?slot:{key,pending:true,data:undefined,error:undefined}),retry:()=>setRevision(n=>n+1)};
}
function Status({pending,error,retry,hasData}:{pending:boolean;error?:string;retry:()=>void;hasData:boolean}) {
 return <>{pending&&<Typography role="status" sx={{fontSize:10,color:muted,py:'4px'}}>{hasData?'갱신 중 · 마지막 성공 데이터를 표시합니다.':'조회 중…'}</Typography>}{error&&<Box role="alert" sx={{fontSize:10,p:'8px',bgcolor:'#111927',borderRadius:'8px',mb:'8px'}}>조회에 실패했습니다. {error}<Button onClick={retry} sx={{fontSize:10,minWidth:0,p:'2px 8px'}}>재시도</Button></Box>}</>;
}
function Empty(){return <Box data-testid="value-empty" sx={{height:'100%',minHeight:160,flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:muted,fontSize:12}}>내용이 없습니다.</Box>;}
function Line({label,children,color}:{label:string;children:ReactNode;color?:string}){return <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',minHeight:20,fontSize:12}}><span style={{color:muted}}>{label}</span><Box sx={{textAlign:'right',overflowWrap:'anywhere',color}}>{children}</Box></Box>;}
function Detail({data,openCharts}:{data:ValueDetail;openCharts:()=>void}) {
 const price=number(data.security.currentPrice),previous=number(data.security.previousClosePrice),change=price!==null&&previous!==null?price-previous:null;
 const rate=change!==null&&previous!==null&&previous>0?change/previous*100:null,w=number(data.w),upside=w===null?null:(w-1)*100;
 return <Box data-testid="value-detail" sx={{display:'grid',gap:'8px'}}>
  <Box sx={cardStyle}><Line label="현재가"><Box component="span" sx={{fontSize:22,fontWeight:700,color:movement(change)}}>{format(price,0,'원')}</Box><Box component="span" sx={{ml:'8px',fontSize:10,color:'#FBBF24'}}>W {format(w,2)}</Box></Line><Line label="전일 대비" color={movement(change)}>{format(change,0,'원')} / {format(rate,2,'%')}</Line><Line label="상승 여력 (W 0.8)" color={movement(upside)}>{format(upside,2,'%')}</Line></Box>
  <Box sx={cardStyle}><Typography sx={{fontSize:12,mb:'8px'}}>적정주가</Typography><Box sx={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:'4px'}}>{data.fairPrices.map(fair=>{const value=number(fair.price),delta=value===null||price===null?null:value-price;return <Box key={fair.persistence} sx={{p:'8px 2px',borderRadius:'4px',bgcolor:delta===null||delta===0?'#273244':delta>0?'#A12E37':'#244E87',textAlign:'center',fontSize:10,overflowWrap:'anywhere'}}><Box sx={{mb:'4px',color:'#CBD5E1'}}>W {fair.persistence}</Box>{format(value,0,'원')}</Box>;})}</Box></Box>
  <Box sx={cardStyle}><Typography sx={{fontSize:12,mb:'8px'}}>계산 기준</Typography><Box sx={{display:'grid',gap:'8px'}}><Line label="자기자본">{format(data.equity,0,'원')}</Line><Line label="예상 ROE">{format(data.valuation?.roe,2,'%')}</Line><Line label="요구수익률">{format(data.requiredReturn,1,'%')}</Line></Box></Box>
  <Box sx={cardStyle}><Typography sx={{fontSize:12,mb:'8px'}}>핵심 지표</Typography><Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px'}}><Line label="BPS">{format(data.valuation?.bps,0,'원')}</Line><Line label="EPS">{format(data.valuation?.eps,0,'원')}</Line><Line label="PER">{format(data.valuation?.per,2,'배')}</Line><Line label="PBR">{format(data.valuation?.pbr,2,'배')}</Line></Box></Box>
  <Button onClick={openCharts} sx={{height:36,fontSize:12,bgcolor:'#111927',borderRadius:'8px',color:'#F1F5F9'}}>재무지표 보기</Button>
  <Box sx={cardStyle}><Typography sx={{fontSize:12,mb:'8px'}}>적정주가 계산</Typography><Typography sx={{fontSize:10,color:muted,lineHeight:'18px',overflowWrap:'anywhere'}}>BPS × [1 + (ROE ÷ 100 − 0.08) × 지속계수 ÷ 0.08]<br/>W = 지속계수 0.8 적정주가 ÷ 현재가</Typography></Box>
  <Box sx={cardStyle}><Typography sx={{fontSize:12,mb:'8px'}}>데이터 기준</Typography><Line label="기준연도">{data.year}</Line><Line label="결산 기준일">{data.closingDate??'—'}</Line><Line label="지표 기준일">{data.valuation?.metricDate??'—'}</Line><Line label="주가 기준일">{data.security.priceUpdatedAt?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(data.security.priceUpdatedAt)):'—'}</Line>{(!data.valuation||price===null)&&<Typography sx={{fontSize:10,color:muted,mt:'8px'}}>지표 또는 주가가 미수집되어 적정주가·W를 계산할 수 없습니다.</Typography>}</Box>
 </Box>;
}
export function ValueAnalysisPage(){
 const tablet=useMediaQuery('(min-width:600px)'),location=useLocation(),navigate=useNavigate(),{stockId}=useParams(),params=new URLSearchParams(location.search),currentYear=seoulYear();
 const [year,setYear]=usePageMemory('value-year',currentYear),[draft,setDraft]=usePageMemory('value-draft',''),[query,setQuery]=usePageMemory('value-query','');
 const [selected,setSelected]=usePageMemory<string|null>('value-selected',()=>stockId??params.get('selected'));
 const [mode,setMode]=usePageMemory<'annual'|'quarter'>('value-mode','annual');
 const [annualStart,setAnnualStart]=usePageMemory('value-annual-start',currentYear-(tablet?9:2)),[quarterStart,setQuarterStart]=usePageMemory('value-quarter-start',currentYear+':1');
 const [visibleCount,setVisibleCount]=usePageMemory('value-visible-count',100);
 const view=params.get('view')??(stockId?'detail':'list'),chart=view==='chart',coverDetail=!tablet&&view==='detail';
 const listKey=JSON.stringify([year,query]),list=useStoredQuery<ValueList>(listKey,signal=>listValues(year,query,signal));
 const [retainedList,setRetainedList]=useState<ValueList>();
 useEffect(()=>{if(list.data)setRetainedList(list.data);},[list.data]);
 const listData=list.data??retainedList,listCurrent=!!list.data;
 const [startYear,startQuarter]=mode==='annual'?[annualStart,1]:quarterStart.split(':').map(Number),count=tablet?10:3;
 const detailKey=JSON.stringify([selected,year,mode,startYear,startQuarter,count]);
 const detail=useStoredQuery<ValueDetail|null>(detailKey,signal=>selected?detailValues(selected,year,mode,startYear,startQuarter,count,signal):Promise.resolve(null));
 const [retainedDetail,setRetainedDetail]=useState<ValueDetail>();
 useEffect(()=>{if(detail.data)setRetainedDetail(detail.data);},[detail.data]);
 const shownDetail=detail.data??(retainedDetail?.security.id===selected&&retainedDetail.year===year?retainedDetail:undefined);
 const detailStatus=<><Status pending={detail.pending} error={detail.error} retry={detail.retry} hasData={!!shownDetail}/>{shownDetail&&!detail.data&&<Typography sx={{fontSize:10,color:muted,mb:'8px'}}>이전 기간 결과 · {shownDetail.mode==='annual'?'연간':'분기'} {shownDetail.rows[0]?.label}부터</Typography>}</>;
 const leftRef=useRef<HTMLDivElement>(null),rightRef=useRef<HTMLDivElement>(null),searchRef=useRef<HTMLInputElement>(null),touch=useRef<{x:number;y:number}|null>(null);
 useEffect(()=>{if(view==='list')searchRef.current?.focus({preventScroll:true});},[view]);
 useEffect(()=>{if(!list.data)return;const rows=list.data.rows;if(rows.length&&!rows.some(row=>row.id===selected))setSelected(rows[0].id);else if(!rows.length&&!stockId)setSelected(null);},[list.data,selected,setSelected]);
 const rows=list.data?.rows??[],index=rows.findIndex(row=>row.id===selected),previous=index>0?rows[index-1]:null,next=index>=0&&index<rows.length-1?rows[index+1]:null;
 const goView=(target:string,id=selected)=>{const search=new URLSearchParams(location.search);search.set('view',target);if(id)search.set('selected',id);else search.delete('selected');navigate(location.pathname+'?'+search,{state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key}});};
 const choose=(id:string)=>{setSelected(id);if(!tablet&&view==='list')goView('detail',id);};
 const move=(direction:number)=>{const target=direction<0?previous:next;if(target&&listCurrent){setSelected(target.id);}};
 const back=()=>{if(chart||coverDetail){if(Number(window.history.state?.idx)>0)navigate(-1);else goView('list');}else navigate('/more');};
 const currentName=detail.data?.security.name??rows.find(row=>row.id===selected)?.name??(selected?'종목 조회 중':'가치분석');
 const currentSymbol=detail.data?.security.symbol??rows.find(row=>row.id===selected)?.symbol??'—';
 const navigation=(chart||coverDetail)?<Box sx={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto minmax(0,1fr)',gap:'8px',alignItems:'center',fontSize:10}}>
  <Button disabled={!previous||!listCurrent} onClick={()=>move(-1)} sx={{p:0,minWidth:0,fontSize:10,justifyContent:'flex-start',color:muted,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{previous?.name??''}</Button><span style={{color:muted}}>{currentSymbol}</span><Button disabled={!next||!listCurrent} onClick={()=>move(1)} sx={{p:0,minWidth:0,fontSize:10,justifyContent:'flex-end',color:muted,overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis'}}>{next?.name??''}</Button></Box>:undefined;
 const listContent=<><Box sx={{display:'flex',gap:'8px',mb:'8px'}}>
  <Box component="form" onSubmit={event=>{event.preventDefault();setQuery(draft.trim());setVisibleCount(100);}} sx={{flex:1,minWidth:0,display:'flex',gap:'4px',alignItems:'center',bgcolor:'#111927',borderRadius:'8px',px:'8px'}}>
   <input ref={searchRef} aria-label="종목 검색" placeholder="종목명 또는 코드 검색" value={draft} onChange={event=>setDraft(event.target.value)} style={{...controlStyle,border:0,width:'100%',padding:0}}/><button aria-label="검색 확인" type="submit" style={{border:0,padding:0,background:'transparent',height:28,display:'flex',alignItems:'center'}}><img src="/value-v04/search.svg" width="16" height="16" alt=""/></button>
  </Box><select aria-label="기준연도" value={year} onChange={event=>{setYear(Number(event.target.value));setVisibleCount(100);}} style={{...controlStyle,width:78}}>{Array.from({length:currentYear-1990+1},(_,i)=>currentYear-i).map(y=><option key={y} value={y}>{y}</option>)}</select></Box>
  <Status pending={list.pending} error={list.error} retry={list.retry} hasData={!!listData}/>
  {listData&&<><Box sx={{display:'flex',justifyContent:'space-between',fontSize:10,color:muted,mb:'8px'}}><span>{listData.year}년 · W 내림차순{!listCurrent?' · 이전 조회 결과':''}</span><span>{listData.total.toLocaleString()}개</span></Box>{listData.rows.length===0?<Empty/>:<Box sx={{display:'grid',gap:'8px'}}>{listData.rows.slice(0,visibleCount).map(row=>{const p=number(row.currentPrice),before=number(row.previousClosePrice),delta=p!==null&&before!==null?p-before:null;return <Box component="button" key={row.id} data-scroll-item={row.id} data-testid={'value-row-'+row.symbol} disabled={!listCurrent} onClick={()=>choose(row.id)} sx={{font:'inherit',color:'#F1F5F9',textAlign:'left',cursor:'pointer',border:0,borderBottom:'1px solid #273244',bgcolor:'transparent',p:'0 0 8px',minHeight:46,width:'100%',opacity:1,'&:focus-visible':{outline:'1px solid #FBBF24'},'&:disabled':{cursor:'progress'}}}>
   <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',mb:'4px'}}><Typography noWrap sx={{fontSize:12,fontWeight:row.id===selected?700:500,minWidth:0}}>{row.name}<Box component="span" sx={{ml:'6px',color:muted,fontSize:10}}>{row.symbol}</Box></Typography><Box sx={{flexShrink:0,border:'1px solid #FBBF24',color:'#FBBF24',borderRadius:'4px',px:'4px',fontSize:10,lineHeight:'16px'}}>W {format(row.w,2)}</Box></Box>
   <Box sx={{display:'flex',justifyContent:'space-between',gap:'4px',fontSize:10,color:muted}}><span>PER {format(row.per,1)} · PBR {format(row.pbr,2)} · ROE {format(row.roe,1,'%')}</span><Box component="span" sx={{textAlign:'right',color:movement(delta),whiteSpace:'nowrap'}}>{format(p,0,'원')}</Box></Box>
  </Box>;})}{visibleCount<listData.total&&<Button sx={{fontSize:12}} onClick={()=>setVisibleCount(n=>n+100)}>더 보기 ({Math.min(visibleCount,listData.total)} / {listData.total})</Button>}</Box>}</>}
 </>;
 const detailContent=<>{tablet&&!chart&&selected&&<Box sx={{textAlign:'center',mb:'8px',fontSize:14,fontWeight:600}}>{currentName}<Typography sx={{fontSize:10,color:muted}}>{currentSymbol}</Typography></Box>}{detailStatus}{shownDetail?<Detail data={shownDetail} openCharts={()=>goView('chart')}/>:!selected&&!list.pending&&!list.error?<Empty/>:detail.pending?<Box sx={{p:'24px',textAlign:'center'}}><CircularProgress size={20}/></Box>:null}</>;
 const swipe={onTouchStart:(event:TouchEvent<HTMLDivElement>)=>{touch.current=(event.target as HTMLElement).closest('input,select,button,a,[data-no-stock-swipe]')?null:{x:event.touches[0].clientX,y:event.touches[0].clientY};},onTouchEnd:(event:TouchEvent<HTMLDivElement>)=>{const start=touch.current;touch.current=null;if(!start)return;const dx=event.changedTouches[0].clientX-start.x,dy=event.changedTouches[0].clientY-start.y;if(Math.abs(dx)>=70&&Math.abs(dx)>Math.abs(dy)*1.8&&Math.abs(dy)<40)move(dx>0?-1:1);}};
 return <Box className="rox-home" data-testid={tablet?'T1700':'C1700'} data-restoration-ready={list.pending&&!listData?'false':'true'} data-list-condition={chart?JSON.stringify(['chart',selected,mode,startYear,startQuarter]):coverDetail?JSON.stringify(['detail',selected,year]):listKey} sx={{height:tablet&&!chart?'100%':undefined,minHeight:!chart&&!coverDetail?'100%':undefined,fontFamily:'RoxHomeInter, sans-serif',fontSize:12,color:'#F1F5F9'}}>
  <PageHeader embedded valueAnalysis title={chart||coverDetail?currentName:'가치분석'} showAdd={false} variant="detail" showBackTablet onBack={back} stockNavigation={navigation}/>
  {chart?<Box {...swipe}><Box sx={{display:'flex',gap:'8px',mb:'8px'}}><Button onClick={()=>setMode('annual')} aria-pressed={mode==='annual'} sx={{fontSize:12,height:28,borderRadius:'8px',minWidth:0,px:'12px',color:mode==='annual'?'#F1F5F9':muted,bgcolor:mode==='annual'?'#273244':'#111927'}}>연간</Button><Button onClick={()=>setMode('quarter')} aria-pressed={mode==='quarter'} sx={{fontSize:12,height:28,borderRadius:'8px',minWidth:0,px:'12px',color:mode==='quarter'?'#F1F5F9':muted,bgcolor:mode==='quarter'?'#273244':'#111927'}}>분기</Button>
   <select aria-label="시작기간" value={mode==='annual'?String(annualStart):quarterStart} onChange={event=>mode==='annual'?setAnnualStart(Number(event.target.value)):setQuarterStart(event.target.value)} style={{...controlStyle,marginLeft:'auto'}}>{mode==='annual'?Array.from({length:currentYear-1990+1},(_,i)=>currentYear-i).map(y=><option key={y} value={y}>{y}년부터</option>):Array.from({length:(currentYear-1990+1)*4},(_,i)=>{const y=currentYear-Math.floor(i/4),q=4-i%4;return <option key={y+':'+q} value={y+':'+q}>{y}년 {q}분기부터</option>;})}</select></Box>
   {detailStatus}{shownDetail&&<><ValueFinancialCharts rows={shownDetail.rows}/><Box sx={{mt:'8px',...cardStyle}}>{shownDetail.notices.map(notice=><Typography key={notice} sx={{fontSize:10,color:muted,lineHeight:'18px'}}>{notice}</Typography>)}</Box></>}
  </Box>:tablet?<Box sx={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:'8px',height:'100%',minHeight:0}}>
   <Box ref={leftRef} data-scroll-region="value-left" data-list-condition={listKey} sx={{overflowY:'auto',scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'},pb:'80px',minWidth:0,display:'flex',flexDirection:'column'}}>{listContent}</Box><OverlayRegionScrollbar scrollRef={leftRef} label="가치분석 목록 스크롤" offset={0}/>
   <Box ref={rightRef} data-scroll-region="value-right" data-list-condition={JSON.stringify([year,selected])} sx={{overflowY:'auto',scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'},pb:'80px',minWidth:0}}>{list.data?.rows.length===0?<Empty/>:detailContent}</Box><OverlayRegionScrollbar scrollRef={rightRef} label="가치분석 상세 스크롤" offset={0}/>
  </Box>:coverDetail?<Box {...swipe}>{detailContent}</Box>:listContent}
 </Box>;
}
