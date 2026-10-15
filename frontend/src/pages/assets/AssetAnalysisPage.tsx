import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {useCompoundPlans} from '../compound/useCompoundPlans';
import {CompoundGoalSummary} from '../compound/CompoundGoalSummary';
import {cashAllocation} from '../../utils/cashAllocation';
import '../dashboard/home-font.css';
import { Box, Button, CardActionArea, Dialog, Snackbar, Stack, Typography, useMediaQuery } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { AssetAnalysisChart } from './AssetAnalysisChart';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppCard } from '../../components/common/Common';
import { PageHeader } from '../../components/navigation/Navigation';
import { OverlayRegionScrollbar } from '../../components/navigation/OverlayRegionScrollbar';
import { getAccountDashboard, getAssetHistory } from '../../data/roxstockApi';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { useListNavigation, usePageMemory, useReturnNavigation } from '../../hooks/navigation/usePageMemory';
import { colors } from '../../styles/tokens';
import { formatPercent, formatRate, formatSignedWon, formatWon, getMarketColor } from '../../utils/format';
import { analysisPeriods, analysisRange, decimalValue, periodLabel, type AnalysisPeriod } from './analysisPeriod';

const cardStyle = { border: 0, borderRadius: '8px', px: '16px', py: '8px', minWidth: 0, flexShrink: 0 };
const titleStyle = { fontSize: 16, fontWeight: 600, lineHeight: '23px' };
const hintStyle = { fontSize: 10, color: colors.textMuted, lineHeight: '14px', whiteSpace: 'nowrap' };

export function AssetAnalysisPage({dashboardPanel = false}: {dashboardPanel?: boolean} = {}) {
  const { accountId, accounts } = useActiveAccount(), location = useLocation();
  const navigate = useListNavigation(), back = useReturnNavigation('/');
  const routeNavigate = useNavigate();
  const detail = new URLSearchParams(location.search).get('chart') === 'detail';
  const openDetail = () => {
    if (dashboardPanel) { routeNavigate(`/assets?period=${period}&chart=detail`); return; }
    setDetailPeriod(period);
    const params = new URLSearchParams(location.search); params.set('chart', 'detail');
    routeNavigate({ pathname: location.pathname, search: `?${params}` }, { state: { ...location.state, listEntryKey: location.state?.listEntryKey ?? location.key, analysisDetailEntry: true } });
  };
  const closeDetail = () => {
    if (location.state?.analysisDetailEntry) routeNavigate(-1);
    else { const params = new URLSearchParams(location.search); params.delete('chart'); routeNavigate({ pathname: location.pathname, search: params.toString() }, { replace: true, state: location.state }); }
  };
  const supplied = new URLSearchParams(location.search).get('period');
  const [period, setPeriod] = usePageMemory<AnalysisPeriod>(dashboardPanel ? 'dashboard-analysis-period' : 'analysis-period', analysisPeriods.some(item => item.value === supplied) ? supplied as AnalysisPeriod : '1y',{adoptInitialAccount:true});
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const range = analysisRange(period, today);
  const [detailPeriod,setDetailPeriod]=useState<AnalysisPeriod>(period);
  const detailRange=analysisRange(detailPeriod,today);
  const detailHistory=useQuery({queryKey:['analysis-history',accountId,detailRange.from,detailRange.to],queryFn:({signal})=>getAssetHistory(accountId!,detailRange,signal),enabled:!!accountId&&detail&&!dashboardPanel});
  const detailData=detailHistory.data;
  const detailLabel=periodLabel(detailData?.summary?.from??detailData?.data.at(0)?.date,detailData?.summary?.to??detailData?.data.at(-1)?.date);
  const dashboard = useQuery({ queryKey: ['analysis-dashboard', accountId], queryFn: ({signal}) => getAccountDashboard(accountId!,signal), enabled: !!accountId && !dashboardPanel });
  const history = useQuery({ queryKey: ['analysis-history', accountId, range.from, range.to], queryFn: ({signal}) => getAssetHistory(accountId!, range,signal), enabled: !!accountId });
  const compound=useCompoundPlans(dashboardPanel ? undefined : accountId);
  const compoundPlan=compound.data?.plans.find(plan=>plan.id===history.data?.compoundPlan?.id);
  const defaultGoal=compoundPlan?.goals.find(goal=>goal.isDefault);
  const leftRef = useRef<HTMLDivElement>(null), rightRef = useRef<HTMLDivElement>(null), tablet = useMediaQuery('(min-width:600px)');
  const data = history.data, summary = data?.summary;
  const from = summary?.from ?? data?.data.at(0)?.date, to = summary?.to ?? data?.data.at(-1)?.date;
  const label = periodLabel(from, to);
  const go = (path: string) => {
    const params = new URLSearchParams({ period, ...(accountId ? { accountId } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) });
    navigate(`${path}?${params}`, { state: { analysisContext: { accountId, period, from, to } } });
  };
  const header = <PageHeader title="자산분석" variant="detail" onBack={back} showBackTablet showAdd={false} embedded assetOverview backIcon={<Box component="span" sx={{ fontSize: 30 }}>‹</Box>} />;
  const failed = accounts.isError || dashboard.isError || history.isError;
  const retry = () => { void accounts.refetch(); void dashboard.refetch(); void history.refetch(); };
  const dashboardPending=accounts.isPending||(!!accountId&&dashboard.isPending);
  const historyPending=accounts.isPending||(!!accountId&&history.isPending);
  const value=(pending:boolean,content:React.ReactNode,width=90,height=14)=>pending?<Box component="span" data-pending-value aria-busy sx={{display:'inline-block',verticalAlign:'top',width,height}}/>:content;
  const current = dashboard.data??{totalAssetValue:null,stockValue:null,cashBalance:null,pricingComplete:false,latestPriceUpdatedAt:null}, total = decimalValue(current.totalAssetValue), stock = decimalValue(current.stockValue), cash = decimalValue(current.cashBalance);
  const rate = decimalValue(summary?.returnRate), profit = decimalValue(summary?.profitLoss);
  const {available,stockPercent:stockRatio,cashPercent:cashRatio,stockColor,cashColor,stockBarColor,cashBarColor}=cashAllocation(stock,cash,current.pricingComplete&&(!dashboard.isError||!!dashboard.data));
  const points = (data?.data ?? []).filter(point => Number.isFinite(decimalValue(point.totalAssetValue)));
  const rows: { label: string; value: number; signed?: boolean; divider?: boolean; percent?: boolean }[] = [
    { label: '기간 시작자산', value: decimalValue(summary?.openingAssetValue ?? points.at(0)?.totalAssetValue) },
    { label: '기간 종료자산', value: decimalValue(summary?.closingAssetValue) },
    { label: '기간 투자손익', value: profit, signed: true },
    { label: '투자수익률', value: rate, percent: true },
    { label: '총입금', value: decimalValue(summary?.depositAmount), signed: true, divider: true },
    { label: '총출금', value: decimalValue(summary?.withdrawalAmount) === 0 ? 0 : -decimalValue(summary?.withdrawalAmount), signed: true },
    { label: '순입출금', value: decimalValue(summary?.depositAmount) - decimalValue(summary?.withdrawalAmount), signed: true },
    { label: '평가손익', value: decimalValue(summary?.unrealizedChange), signed: true, divider: true },
    { label: '실현손익', value: decimalValue(summary?.realizedProfitLoss), signed: true },
    { label: '배당수익', value: decimalValue(summary?.dividendIncome), signed: true },
    { label: '수수료·세금', value: -decimalValue(summary?.feeTaxAmount), signed: true },
  ];
  const trendCard = <AppCard data-testid="analysis-trend" sx={{ ...cardStyle, pb: '2px' }}>
      <CardActionArea data-testid="analysis-trend-title" aria-label="자산추이 상세보기" onClick={openDetail} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px', minHeight: 23 }}>
        <Stack direction="row" sx={{ gap: '4px', alignItems: 'center', flexShrink: 0 }}><Typography sx={titleStyle}>자산추이</Typography><Typography sx={{ ...hintStyle, fontWeight: 400 }}>(상세보기)</Typography></Stack>
        <Typography data-testid="analysis-trend-period" sx={{ ...hintStyle, color: colors.warning, textAlign: 'right', minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{label}</Typography>
      </CardActionArea>
      <Box data-testid="analysis-chart-region" aria-busy={historyPending||history.isFetching} sx={{height:224,position:'relative',display:'flow-root'}}>
        <Box data-testid="analysis-chart"><AssetAnalysisChart points={data?.data??[]} period={period} range={range}/></Box>
        {history.isFetching&&data&&<Typography role="status" sx={{position:'absolute',right:0,top:0,fontSize:10,color:colors.textMuted,zIndex:1}}>갱신 중</Typography>}
        {!historyPending&&((history.isError&&!data)||(accounts.isError&&!accountId))?<Box sx={{position:'absolute',inset:0,display:'grid',placeContent:'center'}}><QueryErrorNotice message="자산 이력 조회에 실패했습니다."/><Button onClick={()=>accounts.isError&&!accountId?accounts.refetch():history.refetch()}>다시 시도</Button></Box>:!historyPending&&!points.length&&<Typography role="status" sx={{...hintStyle,position:'absolute',inset:0,display:'grid',placeItems:'center'}}>{data?.data.length?'기간 계산 불가 · 유효한 스냅샷이 부족합니다.':'내용이 없습니다.'}</Typography>}
      </Box>
      <Stack direction="row" sx={{ gap: '4px', my: '8px' }}>{analysisPeriods.map(item => <Button key={item.value} aria-pressed={item.value === period} onClick={event => { event.stopPropagation(); setPeriod(item.value); }} sx={{ flex: 1, minWidth: 0, height: 24, minHeight: 24, p: 0, borderRadius: '4px', fontSize: 10, bgcolor: item.value === period ? colors.buttonPrimary : colors.raised, color: item.value === period ? colors.textPrimary : colors.textSecondary }}>{item.label}</Button>)}</Stack>
    </AppCard>;
  const left = <>
    <AppCard data-testid="analysis-total" sx={{ ...cardStyle, p: 0,position:'relative' }}><CardActionArea onClick={() => go('/detail/investment')} sx={{ px: '16px', py: '8px' }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', height: 23 }}><Stack direction="row" sx={{ gap: '8px', alignItems: 'center' }}><Typography sx={titleStyle}>총자산</Typography><Typography sx={hintStyle}>(상세보기)</Typography></Stack><Typography sx={{ fontSize: 14, color: getMarketColor(rate), whiteSpace: 'nowrap' }}>{value(historyPending,formatRate(rate),45,14)}</Typography></Stack>
      <Typography data-testid="analysis-total-value" sx={{ my: '4px', textAlign: 'right', fontSize: 24, lineHeight: '29px', height:29, fontWeight: 700, whiteSpace: 'nowrap', color: getMarketColor(profit) }}>{value(dashboardPending,formatWon(total),160,29)}</Typography>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: '8px', height: 16 }}><Typography sx={hintStyle}>{dashboardPending?value(true,'',80,12):current.latestPriceUpdatedAt ? new Date(current.latestPriceUpdatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '시세 미수집'}</Typography><Typography sx={{ fontSize: 11, textAlign: 'right', color: getMarketColor(profit), whiteSpace: 'nowrap' }}>{analysisPeriods.find(item => item.value === period)?.label} · {value(historyPending,formatSignedWon(profit),75,12)}</Typography></Stack>
    </CardActionArea>{(dashboard.isError||accounts.isError)&&!dashboard.data&&<QueryErrorNotice message="총자산 조회 실패 · 다시 시도" onRetry={()=>{if(accounts.isError&&!accountId)void accounts.refetch();else void dashboard.refetch();}}/>}</AppCard>
    <AppCard data-testid="analysis-composition" sx={cardStyle}><Typography sx={titleStyle}>자산구성</Typography>
      <Stack data-testid="composition-amounts" direction="row" sx={{height:14, justifyContent: 'space-between', gap: '4px', mt: '4px', fontSize: 11, lineHeight: '14px', fontWeight: 600, color: stockColor }}><Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>{value(dashboardPending,formatWon(stock))}</Box><Box component="span" sx={{ minWidth: 0, textAlign: 'right', overflowWrap: 'anywhere', color: cashColor }}>{value(dashboardPending,formatWon(cash))}</Box></Stack>
      <Box role="img" aria-label={dashboardPending?'자산구성 조회 중':available ? `주식 ${value(dashboardPending,formatPercent(stockRatio),45)}, 예수금 ${value(dashboardPending,formatPercent(cashRatio),45)}` : '자산구성 계산 불가'} sx={{ display: 'flex', mt: '4px', height: 12, overflow: 'hidden', borderRadius: '6px', bgcolor: dashboardPending?'transparent':colors.raised }}>
        {!dashboardPending&&available && <><Box sx={{ width: `${stockRatio}%`, bgcolor: stockBarColor }} /><Box sx={{ width: `${cashRatio}%`, bgcolor: cashBarColor }} /></>}
      </Box>
      <Stack data-testid="composition-ratios" direction="row" sx={{height:14, justifyContent: 'space-between', mt: '4px', fontSize: 11, lineHeight: '14px', fontWeight: 600, color: stockColor }}><span>{value(dashboardPending,formatPercent(stockRatio),45)}</span><Box component="span" sx={{ color: cashColor }}>{value(dashboardPending,formatPercent(cashRatio),45)}</Box></Stack>
      {!available && dashboard.data && <Typography role="status" sx={{ ...hintStyle, mt: '4px', whiteSpace: 'normal' }}>{current.pricingComplete === false ? '시세 미수집 · 구성 계산 불가' : '자산구성 계산 불가'}</Typography>}
    </AppCard>
    {trendCard}
  </>;
  const right = <>
    <AppCard data-testid="analysis-performance" sx={{ ...cardStyle, pt: 0, pb: '14px', overflow: 'visible' }}>
      <Box data-testid="analysis-sticky" sx={{ position: dashboardPanel ? 'static' : 'sticky', top: 0, zIndex: 2, bgcolor: colors.surface, pt: '14px', pb: '4px', borderBottom: `1px solid ${colors.border}` }}><Stack direction="row" sx={{ height: 23, gap: '8px', display: 'grid', gridTemplateColumns: 'max-content minmax(0, 1fr)', alignItems: 'end' }}><Typography data-testid="analysis-performance-title" sx={{ ...titleStyle, whiteSpace: 'nowrap' }}>기간 성과 구성</Typography><Typography data-testid="analysis-performance-period" sx={{ ...hintStyle, textAlign: 'right', fontWeight: 700, color: colors.warning }}>{label}</Typography></Stack></Box>
      <Stack data-testid="analysis-metrics-region" spacing="4px" sx={{ mt: '4px', minHeight:dashboardPanel?92:270,position:'relative' }}>{(dashboardPanel ? rows.slice(0,4) : rows).map(row=><Box key={row.label}>{row.divider&&<Box sx={{borderTop:`1px solid ${colors.border}`,mb:'4px'}}/>}<Stack data-testid={'analysis-metric-'+row.label} direction="row" sx={{height:20,alignItems:'center',justifyContent:'space-between',gap:'8px'}}><Typography sx={{fontSize:12,color:colors.textSecondary,whiteSpace:'nowrap'}}>{row.label}</Typography><Typography data-metric-value aria-busy={historyPending} sx={{fontSize:12,fontWeight:600,minWidth:90,minHeight:12,whiteSpace:'nowrap',textAlign:'right',color:row.signed||row.percent||row.label==='기간 종료자산'?getMarketColor(row.label==='기간 종료자산'?profit:row.value):colors.textPrimary}}>{historyPending?'':!data?.data.length?'—':row.percent?formatRate(row.value):row.signed?formatSignedWon(row.value):formatWon(row.value)}</Typography></Stack></Box>)}
      {!historyPending&&!history.isError&&data&&!data.data.length&&<Typography role="status" sx={{position:'absolute',bottom:0,right:0,bgcolor:colors.surface,fontSize:10}}>내용이 없습니다.</Typography>}
      {history.isError&&!data&&<QueryErrorNotice message="기간 성과 조회 실패 · 다시 시도" onRetry={()=>void history.refetch()}/>}</Stack>
      {!dashboardPanel && <Typography data-testid="analysis-unavailable" sx={{ ...hintStyle, mt: '8px', whiteSpace: 'normal' }}>평가손익은 기초 대비 증감, 배당은 세전, 수수료·세금은 차감 기준입니다. {summary?.reconciliationDifference != null && decimalValue(summary.reconciliationDifference) !== 0 ? `잔액 수정·과거 내역 변경 등에 따른 차이 ${formatSignedWon(decimalValue(summary.reconciliationDifference))}` : ''}{summary?.calculationUnavailableReason === 'SNAPSHOT_CAPTURE_ORDER_INVALID' ? ' 스냅샷 기록 시각 순서 불일치 · 기간 계산 불가' : data?.data.length && summary?.unrealizedChange == null ? ' 기초·기말 스냅샷 부족 · 세부 손익 계산 불가' : ''}</Typography>}
    </AppCard>
    {!dashboardPanel && <Box data-testid="analysis-compound" sx={{minWidth:0}}>
      {(accounts.isError&&!accountId)||(compound.isError&&!compound.data)||(history.isError&&!data)?<AppCard sx={{...cardStyle,minHeight:114}}><Typography sx={titleStyle}>복리계획</Typography><QueryErrorNotice message="복리계획 조회에 실패했습니다."/><Button aria-label="복리계획 다시 시도" onClick={()=>{if(accounts.isError&&!accountId)void accounts.refetch();else{void compound.refetch();void history.refetch();}}}>다시 시도</Button></AppCard>:(!!accountId&&compound.isPending)||historyPending?<AppCard sx={{...cardStyle,minHeight:114}}><Typography sx={titleStyle}>복리계획</Typography>{['현재 자산','올해 목표','목표 자산'].map(label=><Stack key={label} direction="row" sx={{height:20,justifyContent:'space-between',alignItems:'center'}}><Typography sx={{fontSize:12,color:colors.textMuted}}>{label}</Typography><Box aria-busy sx={{width:100,height:12}}/></Stack>)}<Box aria-busy sx={{height:6}}/></AppCard>:compoundPlan&&defaultGoal?<CardActionArea aria-label={compoundPlan.planName+' 기본 목표 상세'} sx={{borderRadius:'8px','&:focus-visible':{outline:'2px solid '+colors.focus}}} onClick={()=>{
       const params=new URLSearchParams({period,accountId:accountId!,view:'goal',plan:compoundPlan.id,goal:defaultGoal.id,...(from?{from}:{}),...(to?{to}:{})});
       navigate('/detail/compound?'+params,{state:{analysisContext:{accountId,period,from,to}}});
      }}><CompoundGoalSummary testId="analysis-compound-summary" plan={compoundPlan} goal={defaultGoal} assets={compound.data?.pricingComplete===false?null:compound.data?.currentAssets??null}/></CardActionArea>:<AppCard sx={{...cardStyle,minHeight:114}}><Typography sx={titleStyle}>복리계획</Typography><Typography role="status" sx={{fontSize:12,color:colors.textMuted}}>{compoundPlan?'기본 목표가 없습니다.':'현재년도의 복리계획이 없습니다.'}</Typography></AppCard>}
    </Box>}
  </>;
  if (dashboardPanel) return <Stack data-testid="dashboard-analysis-panel" spacing="8px" sx={{minWidth:0}}>{right}{/* Reuse the same history response for metrics and chart. */}{trendCard}{history.isError && data && <QueryErrorNotice message="조회 실패 · 이전 결과" onRetry={()=>void history.refetch()}/>}</Stack>;
  return <>{header}{!accountId&&!accounts.isPending&&!accounts.isError&&<AppCard sx={{p:2}}><Typography>등록된 계좌가 없습니다.</Typography><Button onClick={()=>navigate('/detail/settings?view=add')}>계좌 추가</Button></AppCard>}<QueryErrorNotice active={failed} message={"최신 조회에 실패했습니다. 다시 시도해 주세요."} inlineRetry={false} onRetry={retry}/>
    <Box className="rox-home" data-testid="asset-analysis" data-list-condition={period} data-screen-id={tablet ? 'T1400' : 'C1400'} data-restoration-ready={!history.isPending} sx={{ height: { sm: '100%' }, minHeight: 0, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: '8px' }}>
      <Stack ref={leftRef} data-scroll-region="analysis-left" spacing="8px" sx={{ minWidth: 0, minHeight: 0, overflowY: { xs: 'visible', sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, pb: { xs: 0, sm: '80px' } }}>{left}</Stack>
      <Stack ref={rightRef} data-scroll-region="analysis-right" spacing="8px" sx={{ minWidth: 0, minHeight: 0, overflowY: { xs: 'visible', sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, pb: { xs: 0, sm: '80px' } }}>{right}</Stack>
    </Box>{tablet && <><OverlayRegionScrollbar scrollRef={leftRef} label="자산분석 왼쪽 스크롤" offset={0} /><OverlayRegionScrollbar scrollRef={rightRef} label="자산분석 오른쪽 스크롤" offset={0} /></>}
    <Dialog fullScreen transitionDuration={0} open={detail} onClose={closeDetail} slotProps={{paper:{sx:{bgcolor:colors.canvas,backgroundImage:'none',p:'8px',overflow:'hidden',display:'flex',flexDirection:'column'}}}}>
      <Stack direction="row" sx={{height:44,alignItems:'center',gap:'8px',flexShrink:0}}><Button aria-label="자산 차트 상세 뒤로가기" onClick={closeDetail} sx={{minWidth:28,fontSize:24}}>‹</Button><Typography sx={{fontSize:20,fontWeight:600}}>자산추이 상세</Typography></Stack>
      <AppCard data-testid="analysis-detail-card" sx={{...cardStyle,flex:1,minHeight:0,display:'flex',flexDirection:'column'}}>
        <Stack direction="row" sx={{justifyContent:'space-between',gap:'8px',flexShrink:0}}><Typography sx={titleStyle}>자산추이</Typography><Typography sx={{...hintStyle,color:colors.warning}}>{detailLabel}</Typography></Stack>
        <Typography sx={{...hintStyle,flexShrink:0}}>{accounts.data?.find(account=>account.id===accountId)?.name} · {analysisPeriods.find(item=>item.value===detailPeriod)?.label}</Typography>
        <Box sx={{flex:1,minHeight:0,position:'relative',display:'flex'}} aria-busy={detailHistory.isPending||detailHistory.isFetching}><AssetAnalysisChart points={detailData?.data??[]} period={detailPeriod} range={detailRange} expanded/>{!detailHistory.isPending&&!detailData?.data.length&&<Box role="status" sx={{...hintStyle,position:'absolute',inset:0,display:'grid',placeItems:'center'}}>{detailHistory.isError?<QueryErrorNotice message="자산 이력 조회에 실패했습니다." onRetry={()=>void detailHistory.refetch()}/>:"내용이 없습니다."}</Box>}</Box>
        {detailHistory.isError && <Button onClick={()=>detailHistory.refetch()}>다시 시도</Button>}
        <Stack data-testid="analysis-detail-periods" direction="row" spacing="4px" sx={{mt:'8px',flexShrink:0}}>{analysisPeriods.map(item=><Button key={item.value} aria-pressed={detailPeriod===item.value} onClick={()=>setDetailPeriod(item.value)} sx={{flex:1,minWidth:0,p:0,height:28,fontSize:11,bgcolor:detailPeriod===item.value?colors.buttonPrimary:colors.raised,color:detailPeriod===item.value?'white':colors.textMuted}}>{item.label}</Button>)}</Stack>
      </AppCard>
    </Dialog></>;
}
