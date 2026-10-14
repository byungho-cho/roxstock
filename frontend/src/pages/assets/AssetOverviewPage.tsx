import {DelayedSkeleton as Skeleton} from '../../components/common/DelayedSkeleton';
import {DashboardTrend} from './DashboardTrend';
import {cashAllocation} from '../../utils/cashAllocation';
import '../dashboard/home-font.css';
import { Box, Button, Snackbar, Stack, Typography, useMediaQuery } from '@mui/material';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import { useState, type ReactNode } from 'react';
import { AppCard } from '../../components/common/Common';
import { AssetAnalysisPage } from './AssetAnalysisPage';
import { PageHeader } from '../../components/navigation/Navigation';
import { assetComposition } from '../../data/mockData';
import { liveApiEnabled } from '../../data/liveData';
import { useDashboard } from '../../hooks/useMockData';
import { colors } from '../../styles/tokens';
import type { DashboardSummary } from '../../types/models';
import { formatPercent, formatWon, getMarketColor } from '../../utils/format';
import { homeTimestamp } from '../dashboard/HomeListCard';

const weightColor=(percent:number,fallback:string)=>percent>50?colors.marketRise:percent>=30?colors.warning:percent<=10?colors.marketFall:fallback;
const palette = ['#FA6170', '#60A5FA', '#34D399', '#A78BFA', '#FBC02D', '#94A3B8'];
type ChartItem = { id: string; name: string; percent: number; color: string };

export function AssetOverviewPage() {
  const tablet = useMediaQuery('(min-width:600px)');
  const { data, isPending, isError, isFetching, refetch, historyData, historyPending, historyError, historyRefetch } = useDashboard({ pollPrices: true, deferTrend: true, includeTrend: !tablet });
  const {accountId, accounts}=useActiveAccount();
  const pending=isPending&&!isError&&!accounts.isError;
  const [mode, setMode] = useState<'cumulative' | 'ranked'>('ranked');
  const header = <PageHeader title="대시보드" variant="detail" backPath="/" showBackTablet showAdd={false} assetOverview backIcon={<Box component="span" sx={{ fontSize: 30, lineHeight: '30px' }}>‹</Box>} embedded action={<Box sx={{ width: 44, flexShrink: 0 }} />} />;
  const summary=data?.summary??unavailableSummary,holdings=data?.holdings??[];
  const today = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul'}).format(new Date());
  const monthAgo = new Date(`${today}T00:00:00Z`);monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1);
  const from = monthAgo.toISOString().slice(0, 10);
  const trend = liveApiEnabled ? (historyData?.data ?? []).map(point => ({date: point.date, value: point.totalAssetValue == null ? NaN : Number(point.totalAssetValue)})) : (data?.trend ?? []).map(point => ({date: point.label, value: point.value}));
  const points = trend.filter(point => !/^\d{4}-\d{2}-\d{2}$/.test(point.date) || (point.date >= from && point.date <= today));
  const trendCard = <DashboardTrend key={accountId} points={points} pending={liveApiEnabled && historyPending && !accounts.isError && (!!accountId || accounts.isPending)} failed={historyError || accounts.isError} retry={() => {if(accounts.isError)void accounts.refetch();else void historyRefetch();}}/>;
  const composition = (liveApiEnabled
    ? summary.pricingComplete === false ? [] : holdings.filter(stock => Number.isFinite(stock.marketValue) && stock.marketValue! > 0).map(stock => ({ id: stock.id, percent: summary.stockValue > 0 ? stock.marketValue! / summary.stockValue * 100 : 0 }))
    : [...assetComposition]).sort((a, b) => b.percent - a.percent);
  // Keep six legend slots and five named weight rows; all remaining holdings contribute to 기타.
  const top = composition.filter(item => item.id !== 'other').slice(0, 5);
  const other = composition.filter(item => !top.some(selected => selected.id === item.id)).reduce((sum, item) => sum + item.percent, 0);
  const items: ChartItem[] = [...top, ...(other > 0 ? [{ id: 'other', percent: other }] : [])].map(({ id, percent }, index) => ({
    id, percent, color: palette[index], name: id === 'other' ? '기타' : holdings.find(stock => stock.id === id)?.name ?? '기타',
  }));
  return <>{header}<Snackbar open={isError} message="최신 데이터 조회에 실패했습니다. 이전 값을 표시합니다." />
    <Box className="rox-home" data-testid="asset-overview" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: '8px', alignItems: 'stretch' }}>
      <CompositionCard trend={tablet ? null : trendCard} loading={pending} failed={isError||accounts.isError} retry={()=>{void refetch();if(accounts.isError)void accounts.refetch();}} allocationAvailable={!isError} summary={summary} items={items} mode={mode} updating={isFetching} onToggle={() => setMode(previous => previous === 'cumulative' ? 'ranked' : 'cumulative')} />
      {tablet && <AssetAnalysisPage dashboardPanel />}
    </Box>
  </>;
}


function CompositionCard({ trend, summary, items, mode, onToggle, updating,allocationAvailable,loading=false,failed=false,retry }: {trend:ReactNode;loading?:boolean;failed?:boolean;retry:()=>void; summary: DashboardSummary; items: ChartItem[]; mode: 'cumulative' | 'ranked'; onToggle: () => void; updating: boolean;allocationAvailable:boolean }) {
  const {available,stockPercent,cashPercent,stockColor,cashColor,stockBarColor,cashBarColor}=cashAllocation(summary.stockValue,summary.cashBalance,summary.pricingComplete!==false&&allocationAvailable);
  const named = items.filter(item => item.id !== 'other');
  return <AppCard data-testid="asset-composition-card" sx={{ minWidth: 0, position: 'relative', borderRadius: '8px', borderColor: '#25344D', px: '13px', pt: '15px', pb: '10px', overflow: 'visible' }}>
    <Stack direction="row" sx={{alignItems:'center',justifyContent:'space-between',gap:'8px',flexWrap:'wrap'}}><Typography sx={{fontSize:15,fontWeight:600}}>자산구성</Typography><Typography data-testid="composition-total" sx={{fontSize:16,fontWeight:700,color:getMarketColor(summary.dailyProfit),overflowWrap:'anywhere',minWidth:0}}>{loading?<Skeleton width={120}/>:formatWon(summary.totalAssets)}</Typography></Stack>
    {loading?<Box sx={{height:271,pt:'16px'}}><Stack direction="row" sx={{justifyContent:'space-between'}}><Skeleton width={90} height={14} sx={{transform:'none'}}/><Skeleton width={90} height={14} sx={{transform:'none'}}/></Stack><Skeleton height={12} sx={{transform:'none',mt:'4px'}}/><Box sx={{display:'grid',gridTemplateColumns:'124.8px minmax(0,1fr)',gap:'8.8px',mt:'16px',height:178}}><Skeleton variant="circular" width={124.8} height={124.8} sx={{mt:'15.6px'}}/><Stack spacing={1}>{Array.from({length:6},(_,i)=><Skeleton key={i} height={14} sx={{transform:'none'}}/>)}</Stack></Box></Box>:failed&&!available?<Box sx={{height:272,display:'grid',placeItems:'center'}}><Button role="alert" onClick={retry}>자산구성 조회 실패 · 다시 시도</Button></Box>:!available ? <Box sx={{ height: 272, display: 'grid', placeItems: 'center' }}><Box><Stack direction="row" sx={{justifyContent:"space-between",color:colors.textMuted}}><span>{formatWon(summary.stockValue)} · —</span><span>{formatWon(summary.cashBalance)} · —</span></Stack><Typography role="status" sx={{ color: colors.textMuted, fontSize: 11 }}>{summary.pricingComplete === false ? '가격 미수집 종목이 있어 자산구성을 계산할 수 없습니다.' : !Number.isFinite(summary.totalAssets) ? '자산구성을 계산할 수 없습니다.' : '내용이 없습니다.'}</Typography></Box></Box> : <>
      <Stack data-testid="composition-amounts" direction="row" sx={{ justifyContent: 'space-between', mt: '16px', height: 16, fontSize: 11, fontWeight: 600, color: stockColor }}><span>{formatWon(summary.stockValue)}</span><Box component="span" sx={{ color: cashColor }}>{formatWon(summary.cashBalance)}</Box></Stack>
      <Stack role="img" aria-label={`주식 ${formatPercent(stockPercent)}, 예수금 ${formatPercent(cashPercent)}`} direction="row" sx={{ width: '100%', height: 12, borderRadius: '6px', overflow: 'hidden', mt: '4px', bgcolor: colors.raised }}><Box sx={{ width: `${stockPercent}%`, bgcolor: stockBarColor }} /><Box sx={{ width: `${cashPercent}%`, bgcolor: cashBarColor }} /></Stack>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: '5px', height: 25, borderBottom: '1px solid #25344D', fontSize: 11, fontWeight: 600, color: stockColor }}><Box component="span" sx={{color:stockColor}}>{formatPercent(stockPercent)}</Box><Box component="span" sx={{ color: cashColor }}>{formatPercent(cashPercent)}</Box></Stack>
      {trend}
      <Box sx={{ display: 'grid', gridTemplateColumns: '124.8px minmax(0, 1fr)', gap: '8.8px', mt: '16px', height: 178 }}>
        <Box data-testid="asset-donut" role="img" aria-label="종목별 자산 구성 도넛" sx={{ position: 'relative', width: '100%', maxWidth: 124.8, height: 124.8, mt: '15.6px' }}>
          <svg viewBox="0 0 156 156" width="100%" height="124.8" aria-hidden="true"><circle cx="78" cy="78" r="51" fill="none" stroke={colors.raised} strokeWidth="26" />{items.map((item, index) => <circle key={item.id} cx="78" cy="78" r="51" fill="none" stroke={item.color} strokeWidth="26" pathLength="100" strokeDasharray={`${item.percent} ${100 - item.percent}`} strokeDashoffset={-items.slice(0, index).reduce((sum, previous) => sum + previous.percent, 0)} transform="rotate(-90 78 78)" />)}</svg>
          <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: '2.4px' }}><Typography sx={{ fontSize: 10, lineHeight: '12px', color: colors.textMuted }}>주식평가액</Typography><Typography data-testid="asset-donut-value" sx={{ fontSize: 10, lineHeight: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>{Number.isFinite(summary.stockValue) ? `${(summary.stockValue / 10_000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원` : '—'}</Typography></Stack>
        </Box>
        <Stack data-testid="asset-legend" spacing="11px" sx={{ minWidth: 0 }}>{items.map(item => <Box data-testid="asset-legend-row" key={item.id} sx={{ display: 'grid', gridTemplateColumns: '8px minmax(0, 1fr) minmax(36px, max-content)', alignItems: 'center', gap: '8px', height: 18 }}><Box sx={{ width: 8, height: 8, bgcolor: item.color, borderRadius: '50%' }} /><Typography noWrap sx={{ fontSize: 11 }}>{item.name}</Typography><Typography sx={{ fontSize: 11, textAlign: 'right', color: weightColor(item.percent,colors.textMuted), whiteSpace: 'nowrap' }}>{formatPercent(item.percent)}</Typography></Box>)}</Stack>
      </Box>
    </>}
    {!available && trend}
    {loading?<Box sx={{pt:'12px'}}><Typography sx={{fontSize:16,height:24}}>종목별 비중</Typography><Skeleton height={12} sx={{transform:'none',mt:'14px'}}/><Stack spacing="9px" sx={{mt:'16px'}}>{Array.from({length:5},(_,i)=><Skeleton key={i} height={16} sx={{transform:'none'}}/>)}</Stack></Box>:<Box data-testid="asset-weights" sx={{ pt: '12px', borderTop: '1px solid #25344D' }}>
        <Stack direction="row" sx={{ height: 24, alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 16, fontWeight: 600 }}>종목별 비중</Typography><Button onClick={onToggle} aria-label="종목별 비중 차트 방식 변경" sx={{ minWidth: 62, minHeight: 22, height: 22, borderRadius: '11px', bgcolor: colors.raised, color: colors.focus, fontSize: 10, p: 0 }}>{mode === 'cumulative' ? '누적형' : '순위형'}</Button></Stack>
        <Stack direction="row" role="img" aria-label="종목별 비중 누적 막대" sx={{ mt: '14px', height: 12, borderRadius: '6px', bgcolor: colors.raised, overflow: 'hidden' }}>{items.map(item => <Box key={item.id} sx={{ width: `${item.percent}%`, bgcolor: item.color }} />)}</Stack>
        <Stack spacing="9px" sx={{ mt: '16px' }}>{named.map((item, index) => {
          const offset = mode === 'cumulative' ? named.slice(0, index).reduce((sum, previous) => sum + previous.percent, 0) : 0;
          return <Box data-testid="asset-weight-row" key={item.id} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 100px) minmax(0, 1fr) 62px', alignItems: 'center', gap: '8px', height: 16 }}><Typography noWrap sx={{ fontSize: 10.5 }}>{item.name}</Typography><Box sx={{ height: 7, bgcolor: '#202B3E', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}><Box sx={{ width: `${offset}%`, height: '100%', bgcolor: '#2B374B' }} /><Box data-testid="asset-weight-fill" sx={{ position: 'absolute', top: 0, left: `${offset}%`, width: `${item.percent}%`, height: '100%', bgcolor: item.color, borderRadius: '4px' }} /></Box><Typography sx={{ textAlign: 'right', color: weightColor(item.percent,item.color), fontSize: 10.5, fontWeight: 600 }}>{formatPercent(item.percent)}</Typography></Box>;
        })}</Stack>
        {items.length === 0 && <Typography sx={{ mt: 2, fontSize: 11, color: colors.textMuted }}>내용이 없습니다.</Typography>}
      </Box>}
    <Typography data-testid="composition-updated-at" sx={{ mt: '24px', fontSize: 10, lineHeight: '20px', color: colors.textSecondary, opacity: .65 }}>갱신 {loading?<Skeleton component="span" width={70} height={10} sx={{display:'inline-block',transform:'none'}}/>:homeTimestamp(summary.collectedAt)}</Typography>
  </AppCard>;
}

const unavailableSummary:DashboardSummary={totalAssets:NaN,stockValue:NaN,stockPurchaseAmount:NaN,cashBalance:NaN,dailyProfit:NaN,dailyProfitRate:NaN,stockMonthlyProfit:NaN,cashMonthlyProfit:NaN,totalProfit:NaN,totalProfitRate:NaN,collectedAt:'',pricingComplete:false};
