import {negativeRatioWarning} from './negativeRatioWarning';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import {menuIconSource} from '../../components/navigation/menuItems';
import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {formatShareCount} from '../../utils/shareCount';
import {useIncrementalAnalysisList} from '../../hooks/useIncrementalAnalysisList';
import {AnalysisSortHeader,defaultAnalysisSort,encodeSort,type AnalysisSort,type SortKey} from './AnalysisSort';
import {circularNeighbors} from '../../utils/circularNeighbors';
import {ClickInfo} from '../../components/common/ClickInfo';

import {FairPriceCard} from './FairPriceCard';
import {StockNavigation as StockHeaderNavigation} from '../stocks/StockNavigation';
import {FinancialPeriodHeader} from './FinancialPeriodHeader';
import {ActionButton} from '../../components/common/Common';
import {FinancialRefreshDialog,FinancialRefreshButton,hasSavedFinancialData} from '../stocks/FinancialRefreshControls';
import {useFinancialCondition,useFinancialCenterYear} from './useFinancialCondition';
import {colors,pageMetrics} from '../../styles/tokens';
import {largeMoney} from '../../utils/largeMoney';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {useDetailSwipe} from '../../hooks/useDetailSwipe';
import {useStocks} from '../../hooks/useMockData';
import type {StockNavigation} from '../../hooks/useStockNeighbors';
import { ValueStockCard } from './ValueStockCard';
import { Box, Button, Typography, useMediaQuery } from '@mui/material';
import { useCallback,memo,useEffect,useRef,useState,type ReactNode } from 'react';
import { useLocation,useNavigate,useParams } from 'react-router-dom';
import { PageHeader } from '../../components/navigation/Navigation';
import { OverlayRegionScrollbar } from '../../components/navigation/OverlayRegionScrollbar';
import { usePageMemory, useReturnNavigation, useListNavigation } from '../../hooks/navigation/usePageMemory';
import { ValueFinancialCharts } from './ValueFinancialCharts';
import { detailValues,listValues,format,movement,number,seoulYear,type ValueDetail,type ValueList,type ValueRow } from './valueApi';
const muted='#94A3B8',cardStyle={bgcolor:'#111827',borderRadius:'8px',p:'8px 16px'},controlStyle={font:'inherit',fontSize:12,color:'#F1F5F9',background:'#111927',border:'1px solid #273244',borderRadius:8,height:28,padding:'0 8px',minWidth:0};
function useStoredQuery<T>(key:string,request:(signal:AbortSignal)=>Promise<T>,enabled=true,accountScoped=true) {
 const {accountId,accounts}=useActiveAccount(),latest=useRef(request);latest.current=request;
 const query=useQuery({queryKey:['valueStored',accountScoped?accountId:'global',key],queryFn:({signal})=>latest.current(signal),enabled:enabled&&(!accountScoped||!accounts.isLoading),staleTime:30_000,gcTime:30*60_000,refetchOnMount:true});
 return {data:query.data,pending:enabled&&(query.isFetching||(accountScoped&&accounts.isLoading)),error:query.error?.message,retry:()=>void query.refetch()};
}
function Status({pending,error,retry,hasData}:{pending:boolean;error?:string;retry:()=>void;hasData:boolean}) {
 return <>{error&&<Box sx={{fontSize:10,p:'8px',bgcolor:'#111927',borderRadius:'8px',mb:'8px'}}><QueryErrorNotice message="조회에 실패했습니다." onRetry={retry}/></Box>}</>;
}
function Empty(){return <Box data-testid="value-empty" sx={{height:'100%',minHeight:160,flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:muted,fontSize:12}}>내용이 없습니다.</Box>;}
function Line({label,children,color}:{label:ReactNode;children:ReactNode;color?:string}){return <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',minHeight:20,fontSize:12}}><span style={{color:muted}}>{label}</span><Box sx={{textAlign:'right',overflowWrap:'anywhere',fontWeight:600,color}}>{children}</Box></Box>;}
function Detail({data,openCharts,openFinancials,refresh}:{data:ValueDetail;openCharts:()=>void;openFinancials:()=>void;refresh:ReactNode}) {
 const price=number(data.security.currentPrice),previous=number(data.security.previousClosePrice),change=price!==null&&previous!==null?price-previous:null;
 const rate=change!==null&&previous!==null&&previous>0?change/previous*100:null,w=number(data.w),upside=w===null?null:(w-1)*100;
 const currentYear=data.currentSupplement?.observedDate.slice(0,4)??String(data.year);
 const infoLabel=(name:string,message:string,labelColor='#60A5FA',yearSuffix=' ('+currentYear+')',danger=false)=><Box component="span" sx={{display:'inline-flex',alignItems:'center',gap:'4px',color:labelColor}}>{name}{yearSuffix}<ClickInfo tone={danger?"danger":"muted"} label={name+' 데이터 기준'}>{message}</ClickInfo></Box>;
 const settledColor='#60A5FA',referenceColor='#FDE68A';
 const metricLabel=(name:string,key:'eps'|'bps'|'per'|'pbr'|'roe')=>{
  const latest=(key==='per'||key==='pbr')&&data.valuation?.[key]==null&&data.currentSupplement?.[key]!=null;
  const evidence=data.valuation?.provenance?.perMetric?.[key]??data.valuation?.provenance;
  const source=latest?(data.currentSupplement?.fieldSources?.[key]?.source??data.currentSupplement?.source):evidence?.source;
  if((latest?data.currentSupplement?.[key as 'eps']:data.valuation?.[key])==null)return name;
  const negative=(key==='per'||key==='pbr')&&(number(latest?data.currentSupplement?.[key]:data.valuation?.[key])??0)<0;
  if(negative)return infoLabel(name,negativeRatioWarning(key as 'per'|'pbr'),settledColor,' ('+(data.valuation?.fiscalYear??data.year)+'E)',true);
  const referenceBook=(key==='bps'||key==='pbr')&&evidence?.bpsReferenceOnly===true;
  const provider=source?.includes('KIS')?'한국투자증권':source?.includes('KRX')?'KRX':'DART 또는 저장 결산 자료';
  const estimated=latest||data.valuation?.kind==='ANNUAL_ESTIMATE'||data.valuation?.periodType==='ESTIMATE'||key!=='eps'||(data.valuation?.periodType!=null&&data.valuation.periodType!=='ANNUAL');
  const basisYear=latest?(data.currentSupplement?.fieldSources?.[key]?.sourceAsOf?.slice(0,4)??currentYear):(data.valuation?.provenance?.perMetric?.[key]?.fiscalYear??data.valuation?.fiscalYear??data.year);
  return infoLabel(referenceBook?name+' (참고)':name,referenceBook?'DART 동일 공시의 지배주주(별도는 총) 자기자본 ÷ 공시된 전체 유통주식수\nBPS는 통합 주식수 기준 참고 계산값이며 보통주 전용 자본 배분값이 아닙니다.\nPBR = 해당 기간 말 종가 ÷ 이 참고 BPS\n적정주가·RIM 계산에는 사용하지 않습니다.':latest?provider+' 최신 참고 지표\n조회일 '+data.currentSupplement?.observedDate+'\n선택한 결산 연도의 확정 지표가 아닙니다. 결산·RIM 계산에는 사용하지 않습니다.':provider+' · '+data.valuation?.fiscalYear+'년 결산 지표'+(source?.includes('KIS')?'\n동일 결산 연도의 DART 자료와 대조한 한투 연간 값입니다.':'\n저장된 해당 연도 공시·계산 근거를 사용합니다.'),estimated?referenceColor:settledColor,' ('+basisYear+(estimated?'E':'')+')');
 };
 const shareLabel=(name:string,key:'issuedShares'|'treasuryShares'|'outstandingShares')=>{
  if(key==='issuedShares'&&data.issuedShares==null&&data.currentSupplement?.listedShares!=null){const source=data.currentSupplement.fieldSources?.listedShares;return infoLabel('상장주식수',(source?.source??data.currentSupplement.source).replace('KIS_API','한국투자증권')+' 보완 자료\n조회일 '+data.currentSupplement.observedDate+(source?.sourceAsOf?' · 원천 기준일 '+source.sourceAsOf:'')+'\n현재 상장주식수이며, 결산 발행주식수·유통주식수와 구분합니다.');}
  if(data[key]==null)return name;
  return infoLabel(name,'DART · '+data.shareBasis?.periodEndDate+' · '+data.shareBasis?.stockKind+(key==='treasuryShares'&&data.shareBasis?.treasuryCalculated?'\n공시의 자기주식수 직접값은 미제공입니다.\n동일 공시·동일 주식 종류의 발행주식수 − 유통주식수로 계산했습니다.':'\n해당 공시에서 수집한 값입니다.'),key==='treasuryShares'&&data.shareBasis?.treasuryCalculated?referenceColor:settledColor,' ('+data.shareBasis?.periodEndDate.slice(0,4)+(key==='treasuryShares'&&data.shareBasis?.treasuryCalculated?'E':'')+')');
 };
 const heading=(title:ReactNode,note?:string)=><Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',minHeight:20,mb:'8px'}}><Typography sx={{fontSize:15,fontWeight:600}}>{title}</Typography>{note&&<span style={{fontSize:10,color:muted}}>{note}</span>}</Box>;
 return <Box data-testid="value-detail" sx={{display:'grid',gap:'8px','& [data-value-row]':{minHeight:20}}}>
  <Box sx={{...cardStyle,display:'grid',gap:'8px'}}><Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'8px',minHeight:28}}><Box sx={{display:'flex',alignItems:'center',gap:'8px',minWidth:0,flexWrap:'wrap'}}><span data-testid="value-current-price" style={{fontSize:22,fontWeight:600,color:movement(change)}}>{format(price,0,'원')}</span></Box><Box sx={{color:'#FBBF24',fontSize:10,fontWeight:600,border:'1px solid #FBBF24',borderRadius:'6px',px:'8px',py:'4px',flexShrink:0}}>W {format(w,2)}</Box></Box><Line label="전일대비" color={movement(change)}>{format(change,0,'원')} ({format(rate,1,'%')})</Line><Line label="상승여력 (W 0.8 기준)" color={movement(upside)}>{price===null||w===null?'—':format(price*(w-1),0,'원')} ({format(upside,1,'%')})</Line></Box>
  <FairPriceCard data={data}/>
  <Box data-testid="value-rim-totals" sx={cardStyle}><Box sx={{display:'flex',alignItems:'center',gap:'4px',mb:'8px'}}><Typography sx={{fontSize:15,fontWeight:600}}>RIM 총액{data.rimBasis?.isEstimated?` · ${data.rimBasis.year}E`:""}</Typography><ClickInfo tone="muted" label="RIM 계산 근거">{data.rimReason??`검증된 자본 ${data.rimBasis?.equity}원 · ${data.rimBasis?.year}년 ${data.rimBasis?.division} · 출처 ${data.rimBasis?.source??"OPEN_DART"} · ${data.rimBasis?.shares?`분모 ${data.rimBasis.shares}주`:"분모 미확인"}`}{'\n'}초과이익 = 검증된 자기자본 × (ROE ÷ 100 − 0.08){'\n'}주주가치 = 자기자본 + 초과이익 × 0.8 ÷ 0.08{data.rimShareReason&&`\n${data.rimShareReason}`}{data.rimComparison?.perShare!=null&&`\n주당 ${data.rimComparison.perShare}원 / 기존 W0.8 ${data.rimComparison.existingW08}원 / 차이 ${data.rimComparison.difference}원`}</ClickInfo></Box><Line label={<Box component="span" sx={{display:'inline-flex',alignItems:'center',gap:'4px'}}>결산 총자본{data.equityBasis?.source.endsWith('CFS')?' (비지배주주 포함)':data.equityBasis?.source.endsWith('OFS')?' (별도)':''}<ClickInfo tone="muted" label="결산 총자본">{'결산 기준일: '+(data.closingDate?.slice(0,10)??'미확인')+'\n결산 출처: '+(data.equityBasis?.source??'저장 자료 · 출처 기준 미제공')+(data.equityBasis?.collectedAt?'\n수집: '+new Date(data.equityBasis.collectedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'')+'\n연결 총자본은 지배주주와 비지배주주 지분을 모두 포함합니다.\nRIM은 연결 기준이면 지배주주 자본, 별도 기준이면 별도 자기자본을 사용합니다. 결산 연도와 RIM 기준 연도가 다르면 금액도 다를 수 있습니다.'}</ClickInfo></Box>}>{largeMoney(data.equity)}</Line><Line label={'검증된 RIM 자본'+(data.rimBasis?.division==='CFS'?' (지배주주)':data.rimBasis?.division==='OFS'?' (별도)':'')}>{largeMoney(data.rimBasis?.equity)}</Line><Line label="동일 연간 ROE">{format(data.rimBasis?data.valuation?.roe:null,1,"%")}</Line><Line label="초과이익" color={movement(number(data.excessEarnings))}>{largeMoney(data.excessEarnings)}</Line><Line label="주주가치 총액">{largeMoney(data.shareholderValue)}</Line>{(data.rimReason||data.rimShareReason)&&<Typography sx={{fontSize:11,color:muted,mt:'4px',overflowWrap:'anywhere'}}>{data.rimReason??data.rimShareReason}</Typography>}</Box>
  <Box sx={cardStyle}>{heading(<Box component="span" sx={{display:'inline-flex',alignItems:'center',gap:'4px'}}>핵심 재무지표{data.currentSupplement&&<ClickInfo tone="muted" label="핵심 재무지표 데이터 기준">{'수집 '+new Date(data.currentSupplement.collectedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+'\n원천별 기준일은 다를 수 있습니다.\n최신 참고값은 과거 결산·RIM 계산에 사용하지 않습니다.\n상장 주식 수는 발행·유통 주식 수와 구분합니다.'}</ClickInfo>}</Box>,data.shareBasis?data.shareBasis.periodEndDate+' '+data.shareBasis.stockKind:data.year+' 기준')}<Box sx={{display:'grid',gap:0}}><Box data-testid="value-issued-shares" sx={{fontWeight:700,'& span,& .MuiBox-root':{fontWeight:700}}}><Line label={shareLabel("발행주식수","issuedShares")}>{formatShareCount(data.issuedShares??data.currentSupplement?.listedShares)}</Line></Box><Box data-testid="value-treasury-shares"><Line label={shareLabel("자기주식수","treasuryShares")}>{formatShareCount(data.treasuryShares)}</Line></Box><Box data-testid="value-outstanding-shares"><Line label={shareLabel("유통주식수","outstandingShares")}>{formatShareCount(data.outstandingShares)}</Line></Box>{data.shareMissingReason&&data.currentSupplement?.listedShares==null&&<Typography sx={{fontSize:11,color:muted}}>{data.shareMissingReason}</Typography>}<Line label={metricLabel("BPS","bps")} >{format(data.valuation?.bps,0,'원')}</Line><Line label={metricLabel("EPS","eps")} >{format(data.valuation?.eps,0,'원')}</Line><Line label={metricLabel("예상 ROE","roe")} >{format(data.valuation?.roe,1,'%')}</Line><Line label={metricLabel('PER','per')} color={(number(data.valuation?.per??data.currentSupplement?.per)??0)<0?'#6BA7EE':undefined}>{format(data.valuation?.per??data.currentSupplement?.per,2,'배')}</Line><Line label={metricLabel('PBR','pbr')} color={(number(data.valuation?.pbr??data.currentSupplement?.pbr)??0)<0?'#6BA7EE':undefined}>{format(data.valuation?.pbr??data.currentSupplement?.pbr,2,'배')}</Line>{data.currentSupplement&&<><Line label={infoLabel('외국인 보유 수량','한국투자증권 최신 참고 지표\n조회일 '+data.currentSupplement.observedDate+'\n수집한 외국인 보유 수량이며 결산 주식수와는 별도입니다.')}>{formatShareCount(data.currentSupplement.foreignHoldingShares)}</Line><Line label={infoLabel('외국인 보유 비중','한국투자증권 동일 관측의 외국인 보유 수량 ÷ 상장주식수 × 100\n조회일 '+data.currentSupplement.observedDate+'\n서로 다른 시점·원천의 분자와 분모는 섞지 않습니다.',referenceColor,' ('+currentYear+'E)')}>{format(data.currentSupplement.foreignHoldingRatio,2,'%')}</Line><Line label={infoLabel('외국인 소진율','한국투자증권 HTS 외국인 소진율\n조회일 '+data.currentSupplement.observedDate+'\n외국인 보유 비중과는 기준이 다른 별도 지표입니다.')}>{format(data.currentSupplement.foreignExhaustionRate,2,'%')}</Line></>}<Line label="요구수익률">{format(data.requiredReturn,1,'%')}</Line></Box></Box>

  <Box sx={cardStyle}>{heading('데이터 기준')}<Line label="기준연도">{data.year}</Line><Line label="결산 기준일">{data.closingDate??'—'}</Line><Line label="지표 기준일">{data.valuation?.metricDate??'—'}</Line><Line label="주가 기준일">{data.security.priceUpdatedAt?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(data.security.priceUpdatedAt)):'—'}</Line>{(!data.valuation||price===null)&&<Typography sx={{fontSize:10,color:muted,mt:'8px'}}>지표 또는 주가가 미수집되어 적정주가·W를 계산할 수 없습니다.</Typography>}</Box>
  <Box sx={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:'8px',alignItems:'stretch','&& .MuiButton-root':{height:'36px',minHeight:'36px',maxHeight:'36px',boxSizing:'border-box',py:0,lineHeight:'20px',fontSize:12,'& .MuiButton-startIcon':{ml:0,mr:'4px','& > *:nth-of-type(1)':{fontSize:16}}}}}><Box sx={{minWidth:0,'& button':{width:'100%',height:36,minHeight:36,fontSize:12,borderRadius:'8px',bgcolor:'transparent',color:'#CBD5E1',border:'1px solid #64748B','&:hover':{bgcolor:'transparent',borderColor:'#94A3B8'}}}}>{refresh}</Box><Button onClick={openCharts} startIcon={<ShowChartIcon sx={{fontSize:16}}/>} sx={{height:36,fontSize:12,bgcolor:'#111827',borderRadius:'8px',color:'#F1F5F9'}}>재무지표</Button><ActionButton tone="primary" onClick={openFinancials} startIcon={<Box component="img" src={menuIconSource('financials')} alt="" sx={{width:16,height:16}}/>} sx={{height:36,minHeight:36,fontSize:12,borderRadius:'8px'}}>재무제표</ActionButton></Box>
 </Box>;
}
export function ValueAnalysisPage(){
 const tablet=useMediaQuery('(min-width:600px)'),location=useLocation(),navigate=useNavigate(),{stockId}=useParams(),params=new URLSearchParams(location.search),currentYear=seoulYear();
 const goFinancials=useListNavigation();
 const returnToSource=useReturnNavigation('/more'),client=useQueryClient(),{accountId}=useActiveAccount(),{data:accountStocks}=useStocks(undefined,{enabled:!!location.state?.stockNavigation});
 const source=location.state?.stockNavigation as StockNavigation|undefined,fromStockList=!!source;
 const sourceItems=source&&source.accountId===accountId?source.ids.flatMap(id=>{const item=accountStocks?.find(s=>s.id===id);return item?[item]:[];}):null;
 const [year,setYear]=useFinancialCondition('year',currentYear,currentYear),[draft,setDraft]=usePageMemory('value-draft',''),[query,setQuery]=usePageMemory('value-query','');
 const [market,setMarket]=usePageMemory('value-market','KOSPI');
 const [rememberedSelected,setSelected]=usePageMemory<string|null>('value-selected',()=>stockId??params.get('selected'));
 const selected=stockId??params.get('selected')??rememberedSelected;
 const [mode,setMode]=useFinancialCondition<'annual'|'quarter'>('mode','annual',currentYear);
 const [centerYear,setCenterYear]=useFinancialCenterYear(currentYear,'annualStart'),[quarterStart,setQuarterStart]=useFinancialCondition('quarterStart',currentYear+':1',currentYear),[refreshOpen,setRefreshOpen]=useState(false);
 const endYear=centerYear+1,annualStart=centerYear-1;
 useEffect(()=>{if(mode==='annual'&&(params.get('centerYear')!==String(centerYear)||params.has('annualStart')||params.has('endYear')))setCenterYear(centerYear);},[endYear,mode,location.search]);
 const [sorts,setSorts]=usePageMemory<AnalysisSort[]>('value-multi-sort',defaultAnalysisSort);

 const view=params.get('view')??(stockId?'detail':'list'),chart=view==='chart',coverDetail=(!tablet||fromStockList)&&view==='detail';
 const needsList=!fromStockList||(!chart&&!coverDetail);
 const listKey=JSON.stringify([year,market,query,encodeSort(sorts)]),list=useIncrementalAnalysisList<ValueRow,ValueList>(['valueStored','global',listKey,'pages'],(offset,limit,signal)=>listValues(year,query,signal,sorts,limit,offset,market),needsList);
 const [retainedList,setRetainedList]=useState<{accountId?:string;market:string;data:ValueList}>();
 useEffect(()=>{if(list.data)setRetainedList({accountId,market,data:list.data});},[list.data,accountId,market]);
 const listData=list.data??(retainedList?.accountId===accountId&&retainedList?.market===market?retainedList?.data:undefined),listCurrent=!!list.data;
 const [startYear,startQuarter]=mode==='annual'?[annualStart,1]:quarterStart.split(':').map(Number),[quarterCount]=useFinancialCondition('count',tablet?10:3,currentYear);
 const count=mode==='annual'?3:quarterCount;
 const detailKey=JSON.stringify([selected,year,mode,startYear,startQuarter,count]);
 const detail=useStoredQuery<ValueDetail|null>(detailKey,signal=>selected?detailValues(selected,year,mode,startYear,startQuarter,count,signal):Promise.resolve(null),chart||coverDetail||tablet);
 const [retainedDetail,setRetainedDetail]=useState<{accountId?:string;data:ValueDetail}>();
 useEffect(()=>{if(detail.data)setRetainedDetail({accountId,data:detail.data});},[detail.data,accountId]);
 const shownDetail=detail.data??(retainedDetail?.accountId===accountId&&retainedDetail?.data.security.id===selected&&retainedDetail.data.year===year?retainedDetail.data:undefined);
 const detailStatus=<><Status pending={detail.pending} error={detail.error} retry={detail.retry} hasData={!!shownDetail}/>{shownDetail&&!detail.data&&<Typography sx={{fontSize:10,color:muted,mb:'8px'}}>이전 기간 결과 · {shownDetail.mode==='annual'?'연간':'분기'} {shownDetail.rows[0]?.label}부터</Typography>}</>;
 const leftRef=useRef<HTMLDivElement>(null),rightRef=useRef<HTMLDivElement>(null),searchRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(sourceItems||stockId||!list.data)return;const rows=list.data.navigation??list.data.rows;if(rows.length&&!rows.some(row=>row.id===selected))setSelected(rows[0].id);else if(!rows.length&&!stockId)setSelected(null);},[list.data,selected,setSelected,stockId,!!sourceItems]);
 const rows=fromStockList?(sourceItems??[]):(list.data?.navigation??list.data?.rows)??[],{previous,next}=circularNeighbors<{id:string;name:string}>(rows,selected);
 const goView=(target:string,id=selected,replace=false)=>{const search=new URLSearchParams(location.search);search.set('view',target);for(const [k,v] of Object.entries({year,mode,centerYear,quarterStart,count}))search.set(k,String(v));if(id)search.set('selected',id);else search.delete('selected');navigate(location.pathname+'?'+search,{replace,state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key}});};
 const choose=(id:string)=>{setSelected(id);goView(!tablet&&view==='list'?'detail':view,id);};
 const chooseRef=useRef(choose);chooseRef.current=choose;const stableChoose=useCallback((id:string)=>chooseRef.current(id),[]);
 const move=(direction:number)=>{const target=direction<0?previous:next;if(target&&(sourceItems||!fromStockList&&listCurrent)){setSelected(target.id);const search=new URLSearchParams(location.search);for(const [k,v] of Object.entries({selected:target.id,year,mode,centerYear,quarterStart,count}))search.set(k,String(v));navigate((sourceItems?`/stocks/${target.id}/value`:location.pathname)+'?'+search,{replace:true,state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key}});}};
 useEffect(()=>{
  if ((!chart && !coverDetail && !tablet) || !detail.data) return;
  for(const neighbor of new Set([previous,next])){if(!neighbor)continue;const key=JSON.stringify([neighbor.id,year,mode,startYear,startQuarter,count]);
   void client.prefetchQuery({queryKey:['valueStored',accountId,key],staleTime:30_000,queryFn:({signal})=>detailValues(neighbor.id,year,mode,startYear,startQuarter,count,signal)});
  }
 },[client,accountId,previous?.id,next?.id,year,mode,startYear,startQuarter,count,chart,coverDetail,tablet,detail.data]);
 const currentName=detail.data?.security.name??rows.find(row=>row.id===selected)?.name??(selected?'종목 조회 중':'가치분석');
 const currentSymbol=detail.data?.security.symbol??rows.find(row=>row.id===selected)?.symbol??'—';
 const composing=useRef(false),confirmedQuery=useRef(query);
 useEffect(()=>{confirmedQuery.current=query;},[query]);
 const confirmSearch=()=>{if(composing.current)return;const next=(searchRef.current?.value??draft).trim();if(next!==confirmedQuery.current){confirmedQuery.current=next;setQuery(next);}searchRef.current?.blur();};
 const sortLabels:Record<SortKey,string>={name:'종목명',w:'W',currentPrice:'현재가',targetPrice:'목표가',value:'가치',eps:'EPS',epsYield:'EPS 수익률',priceUpdatedAt:'시세일자',issuedShares:'주식수',roe:'ROE',capital:'자본',netIncome:'당기순이익'};
 const changeMarket=(next:string)=>{setMarket(next);setSelected(null);const search=new URLSearchParams(location.search);search.delete('selected');navigate({search:search.toString()},{replace:true,state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key}});};
 const listContent=<><Box data-testid="value-market-navigation" sx={{display:'flex',justifyContent:'space-between',gap:'16px',height:28,mb:'8px',flexShrink:0}}>{[market==='KOSPI'?'KOSDAQ':'KOSPI',market,market==='KOSPI'?'KOSDAQ':'KOSPI'].map((m,i)=><Button key={i} aria-label={i===1?'현재 시장 '+m:(i===0?'이전':'다음')+' 시장 '+m} onClick={()=>changeMarket(m)} sx={{p:0,minWidth:0,minHeight:0,fontSize:i===1?12:10,color:i===1?'#F8FAFC':muted,fontWeight:400}}>{m}</Button>)}</Box><Box sx={{display:'flex',gap:'8px',mb:'8px'}}>
  <Box component="form" onSubmit={event=>{event.preventDefault();confirmSearch();}} sx={{flex:1,minWidth:0,display:'flex',gap:'8px',height:36,border:'1px solid #1e293b',alignItems:'center',bgcolor:'#111927','&:focus-within':{borderColor:'#3b82f6'},borderRadius:'8px',px:'8px'}}>
   <button aria-label="검색 확인" type="submit" style={{border:0,padding:0,background:'transparent',height:28,display:'flex',alignItems:'center'}}><img src="/value-v04/search.svg" width="16" height="16" alt=""/></button>   <input ref={searchRef} enterKeyHint="done" onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}} onKeyDown={event=>{if(event.key==='Enter'&&(composing.current||event.nativeEvent.isComposing||event.keyCode===229))event.preventDefault();}} aria-label="종목 검색" placeholder="종목명 또는 코드 검색" value={draft} onChange={event=>setDraft(event.target.value)} style={{...controlStyle,border:0,flex:1,minWidth:0,padding:0,outline:0}}/>{draft&&<button type="button" aria-label="검색어 지우기" onClick={()=>{setDraft('');setQuery('');searchRef.current?.focus();}} style={{background:'transparent',border:0,padding:0,display:'flex'}}><img src="/stocks-v03/clear.svg" alt="" width="16" height="16"/></button>}
  </Box><select aria-label="기준연도" value={year} onChange={event=>{setYear(Number(event.target.value));}} style={{...controlStyle,height:36,width:78,appearance:'none',paddingRight:24,backgroundImage:'url(/value-v04/select.svg)',backgroundRepeat:'no-repeat',backgroundPosition:'right 8px center'}}>{Array.from({length:currentYear-2015+1},(_,i)=>currentYear-i).map(y=><option key={y} value={y}>{y}</option>)}</select></Box>
  <Box data-testid="value-sort-headers" sx={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:'4px',mb:'8px'}}>{(Object.keys(sortLabels) as SortKey[]).map(column=><AnalysisSortHeader key={column} label={sortLabels[column]} column={column} sorts={sorts} onChange={next=>{setSorts(next);}}/>)}</Box>
  <Status pending={list.pending} error={list.error} retry={list.retry} hasData={!!listData}/>
  {listData?.cache?.status==='STALE'&&<QueryErrorNotice message="캐시 갱신에 실패했습니다. 마지막 정상 자료를 표시합니다." onRetry={list.retry}/>}
  {list.pending&&!listData&&<Box aria-busy="true" sx={{flex:1,minHeight:160}}/>}
  {listData&&<><Box sx={{display:'flex',justifyContent:'space-between',fontSize:10,color:muted,mb:'8px'}}><span>{listData.year}년 · {sorts.length===1&&sorts[0].key==='w'&&sorts[0].direction==='desc'?'W 내림차순':sorts.length?sorts.map(s=>sortLabels[s.key]+' '+(s.direction==='desc'?'↓':'↑')).join(' → '):'종목코드순'}{!listCurrent?' · 이전 조회 결과':''}</span><span>{listData.total.toLocaleString()}개</span></Box>{listData.rows.length===0?<Empty/>:<Box sx={{display:'grid',gap:'8px'}}>{listData.rows.map(row=><StableValueCard key={row.id} row={row} cacheGeneratedAt={listData.cache?.generatedAt} selected={row.id===selected} disabled={!listCurrent} onChoose={stableChoose}/>)}{list.hasNextPage&&<Button disabled={list.isLoadingMore} sx={{fontSize:12,justifySelf:'center'}} onClick={list.loadMore}>더 보기 ({listData.rows.length.toLocaleString()} / {listData.total.toLocaleString()})</Button>}</Box>}</>}
 </>;
 const detailContent=<>{detailStatus}{shownDetail?<Detail data={shownDetail} openCharts={()=>goView('chart')} openFinancials={()=>goFinancials('/detail/financials?'+new URLSearchParams({view:'detail',selected:shownDetail.security.id,centerYear:String(centerYear),year:String(year),quarterYear:String(startYear),mode,quarter:String(startQuarter),chart:'false'}))} refresh={<FinancialRefreshButton stockId={selected!} compact onClick={()=>setRefreshOpen(true)}/>}/>:!selected&&!list.pending&&!list.error?<Empty/>:detail.pending?<Box aria-busy="true" sx={{minHeight:160}}/>:!detail.error?<Empty/>:null}</>;
 const swipe=useDetailSwipe(move,!refreshOpen&&(chart||coverDetail||tablet));
 const detailHeader=chart||coverDetail||(tablet&&!!selected);
 const headerBack=fromStockList?()=>chart?goView('detail',selected,true):returnToSource():chart?()=>goView('detail',selected,true):view==='detail'?()=>goView('list',selected,true):returnToSource;
 const stockNavigation=fromStockList?<StockHeaderNavigation symbol={currentSymbol} previousName={previous?.name} nextName={next?.name} onPrevious={()=>move(-1)} onNext={()=>move(1)}/>:undefined;
 return <Box className="rox-home" data-testid={tablet?'T1700':'C1700'} data-restoration-ready={needsList&&list.pending&&!listData?'false':'true'} data-list-condition={chart?JSON.stringify(['chart',selected,mode,...(mode==='quarter'?[startYear,startQuarter]:[])]):coverDetail?JSON.stringify(['detail',selected,year]):listKey} sx={{height:tablet&&!chart?'100%':undefined,minHeight:!chart&&!coverDetail?'100%':undefined,fontFamily:'RoxHomeInter, sans-serif',fontSize:12,color:'#F1F5F9'}}>
  <PageHeader embedded showBack={fromStockList || chart || view === 'detail'} valueAnalysis title={fromStockList?currentName:detailHeader?<Box component="span" sx={{display:'flex',alignItems:'center',height:'100%',gap:.5,minWidth:0}}><Box component="span" title={currentName} sx={{fontSize:14,lineHeight:'20px',overflow:'hidden',textOverflow:'ellipsis'}}>{currentName}</Box><Box component="span" sx={{fontSize:10,lineHeight:'20px',color:muted,fontWeight:400,flexShrink:0}}> ({currentSymbol})</Box></Box>:'가치분석'} showAdd={false} stockNavigation={stockNavigation} variant={fromStockList?'detail':detailHeader?'standard':'detail'} showBackTablet={fromStockList||chart||view==='detail'} onBack={headerBack} backIcon={<img src="/stocks-v03/back.svg" width="11" height="17" alt=""/>}/>
  {selected&&<FinancialRefreshDialog hasExistingData={hasSavedFinancialData(shownDetail?.rows??[])} initialPeriod={mode==='annual'?'ANNUAL':'ALL'} open={refreshOpen} onClose={()=>setRefreshOpen(false)} stockId={selected} startYear={chart?startYear:Math.max(2015,year-2)} endYear={chart?mode==='annual'?endYear:Math.floor((startYear*4+startQuarter-1+count-1)/4):year} collectedAt={shownDetail?.rows.flatMap(r=>r.collectedAt?[r.collectedAt]:[]).sort().at(-1)??null} onComplete={detail.retry}/>}
  {chart?<Box {...swipe} data-detail-swipe data-financial-chart sx={{touchAction:'pan-y'}}>
   <Box data-testid="financial-sticky-header" sx={{position:'sticky',top:0,zIndex:10,bgcolor:colors.canvas,pt:1,pb:0,mb:0,borderBottom:`1px solid ${colors.borderStrong}`}}>
   <Box sx={{display:'flex',gap:1,mb:1,height:28,alignItems:'center'}}>
    <Typography sx={{fontSize:14,fontWeight:600,whiteSpace:'nowrap'}}>재무지표</Typography>
    <FinancialRefreshButton stockId={selected!} compact onClick={()=>setRefreshOpen(true)}/>
    {shownDetail&&!detail.data&&<Typography noWrap role="status" title={`이전 기간 결과 · ${shownDetail.mode==='annual'?'연간':'분기'} ${shownDetail.rows[0]?.label}부터`} sx={{fontSize:10,color:muted,flex:1,minWidth:0}}>이전 기간 결과 · {shownDetail.mode==='annual'?'연간':'분기'} {shownDetail.rows[0]?.label}부터</Typography>}
    <Box sx={{display:'flex',gap:.5,ml:'auto'}}>{(['annual','quarter'] as const).map(value=><ActionButton key={value} size="small" aria-pressed={mode===value} tone={mode===value?'primary':'muted'} onClick={()=>setMode(value)}>{value==='annual'?'연간':'분기'}</ActionButton>)}</Box>
   </Box>
   <FinancialPeriodHeader rows={mode==='annual'?Array.from({length:3},(_,i)=>{const year=centerYear+i-1;return {key:String(year),year,quarter:null,label:String(year),isEstimated:shownDetail?.rows.find(row=>row.year===year)?.isEstimated,collectionState:shownDetail?.rows.find(row=>row.year===year)?.collectionState};}):Array.from({length:3},(_,i)=>{const offset=startYear*4+startQuarter-1+i,year=Math.floor(offset/4),quarter=offset%4+1;return {key:year+':Q'+quarter,year,quarter,label:year+' '+quarter+'Q',collectionState:shownDetail?.rows.find(row=>row.year===year&&row.quarter===quarter)?.collectionState};})} centerYear={centerYear} currentYear={currentYear} onCenterChange={mode==='annual'?setCenterYear:undefined} onQuarterCenterChange={mode==='quarter'?(year,quarter)=>{const start=year*4+quarter-2;setQuarterStart(Math.floor(start/4)+':'+(start%4+1));}:undefined}/>
   </Box>
   <Status pending={detail.pending} error={detail.error} retry={detail.retry} hasData={!!shownDetail}/>{shownDetail&&<ValueFinancialCharts rows={shownDetail.rows} notes={shownDetail.notices} stockId={selected!} mode={mode} currentYear={currentYear}/>}
  </Box>:tablet&&!coverDetail?<Box sx={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1fr)',gap:'8px',height:'100%',minHeight:0}}>
   <Box ref={leftRef} data-scroll-region="value-left" data-list-condition={listKey} sx={{overflowY:'auto',scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'},pb:'80px',minWidth:0,display:'flex',flexDirection:'column'}}>{listContent}</Box><OverlayRegionScrollbar scrollRef={leftRef} label="가치분석 목록 스크롤" offset={0}/>
   <Box ref={rightRef} {...swipe} data-detail-swipe data-scroll-region="value-right" data-list-condition={JSON.stringify([year,selected])} sx={{touchAction:'pan-y',overflowY:'auto',scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'},pb:'80px',minWidth:0}}>{!sourceItems&&list.data?.rows.length===0?<Empty/>:detailContent}</Box><OverlayRegionScrollbar scrollRef={rightRef} label="가치분석 상세 스크롤" offset={0}/>
  </Box>:coverDetail?<Box {...swipe} data-detail-swipe data-scroll-region={tablet?"value-right":undefined} sx={{touchAction:'pan-y',minHeight:`calc(100dvh - ${pageMetrics.headerHeight * 2}px)`}}>{detailContent}</Box>:listContent}
 </Box>;
}

const StableValueCard=memo(function StableValueCard({row,cacheGeneratedAt,selected,disabled,onChoose}:{row:ValueRow;cacheGeneratedAt?:string|null;selected:boolean;disabled:boolean;onChoose:(id:string)=>void}){
 return <ValueStockCard row={{...row,cacheGeneratedAt}} selected={selected} disabled={disabled} onClick={()=>onChoose(row.id)}/>;
});