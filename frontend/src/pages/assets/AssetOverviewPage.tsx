import {cashAllocation} from '../../utils/cashAllocation';
import '../dashboard/home-font.css';
import { Box, Button, Skeleton, Snackbar, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppCard } from '../../components/common/Common';
import { AssetQuickCards, TotalAssetCard } from '../../components/common/AssetSummaryCards';
import { PageHeader } from '../../components/navigation/Navigation';
import { assetComposition } from '../../data/mockData';
import { liveApiEnabled } from '../../data/liveData';
import { useDashboard } from '../../hooks/useMockData';
import { colors } from '../../styles/tokens';
import type { DashboardSummary } from '../../types/models';
import { formatPercent, formatSignedWon, formatWon, getMarketColor } from '../../utils/format';
import { HoldingRow } from '../dashboard/DashboardPage';
import { HomeEmpty, HomeListCard, homeTimestamp } from '../dashboard/HomeListCard';

const weightColor=(percent:number,fallback:string)=>percent>50?colors.marketRise:percent>=30?colors.warning:percent<=10?colors.marketFall:fallback;
const palette = ['#FA6170', '#60A5FA', '#34D399', '#A78BFA', '#FBC02D', '#94A3B8'];
type ChartItem = { id: string; name: string; percent: number; color: string };

export function AssetOverviewPage() {
  const navigate = useNavigate();
  const { data, isPending, isError, isFetching, refetch } = useDashboard({ pollPrices: true });
  const [mode, setMode] = useState<'cumulative' | 'ranked'>('ranked');
  const header = <PageHeader title="평가자산" variant="detail" backPath="/" showBackTablet showAdd={false} assetOverview backIcon={<Box component="span" sx={{ fontSize: 30, lineHeight: '30px' }}>‹</Box>} embedded action={<Box sx={{ width: 44, flexShrink: 0 }} />} />;
  if (isPending) return <>{header}<Stack spacing="8px" role="status" aria-label="평가자산을 불러오는 중"><Skeleton variant="rounded" height={76} /><Stack direction="row" spacing="10px"><Skeleton variant="rounded" height={68} sx={{ flex: 1 }} /><Skeleton variant="rounded" height={68} sx={{ flex: 1 }} /></Stack><Skeleton variant="rounded" height={174} /></Stack></>;
  if (!data) return <>{header}<AppCard sx={{ p: 2 }}><Typography>평가자산을 불러오지 못했어요.</Typography><Button onClick={() => refetch()}>다시 시도</Button></AppCard></>;
  const { summary, holdings } = data;
  const profit = summary.pricingComplete === false ? Number.NaN : summary.totalProfit;
  const rate = summary.pricingComplete === false || !(summary.stockPurchaseAmount > 0) ? Number.NaN : summary.totalProfitRate;
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
      <Stack data-testid="asset-summary-column" spacing="8px" sx={{ minWidth: 0, '& [data-testid="home-holding"]': { pr: '8px' }, '& h2': { fontSize: 13, lineHeight: '22px' }, '& [data-testid="home-card-footer"] .MuiTypography-root': { fontSize: 10 } }}><TotalAssetCard summary={summary} home /><AssetQuickCards allocationAvailable={!isError} summary={summary} home gap="10px" /><PerformanceCard summary={summary} profit={profit} rate={rate} />
        <Box sx={{ display: { xs: 'none', sm: 'block' } }}><HomeListCard height={222} compactFooter testId="asset-holdings-card" title="보유종목" count={`${holdings.length}종목`} timestampLabel="갱신 " timestamp={summary.collectedAt} updating={isFetching} more={() => navigate('/stocks?tab=holding')} notice={summary.pricingComplete === false ? '시세 미수집 · 평가금액 판정 불가' : undefined}>
          {holdings.slice(0, 3).map(stock => <HoldingRow key={stock.id} stock={stock} onClick={() => navigate(`/stocks/${stock.id}`)} />)}
          {holdings.length === 0 && <HomeEmpty />}
        </HomeListCard></Box>
      </Stack>
      <CompositionCard allocationAvailable={!isError} summary={summary} items={items} mode={mode} updating={isFetching} onToggle={() => setMode(previous => previous === 'cumulative' ? 'ranked' : 'cumulative')} />
    </Box>
  </>;
}

function PerformanceCard({ summary, profit, rate }: { summary: DashboardSummary; profit: number; rate: number }) {
  const rows = [
    { label: '매입금액', value: formatWon(summary.stockPurchaseAmount), color: colors.textPrimary },
    { label: '평가손익', value: formatWon(profit), color: getMarketColor(profit) },
    { label: '주식평가액', value: formatWon(summary.stockValue), color: getMarketColor(profit) },
  ];
  return <AppCard data-testid="asset-performance-card" sx={{ height: 174, borderRadius: '8px', borderColor: '#25344D', px: '14px', pt: '12px', minWidth: 0 }}>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', height: 24, mb: '6px' }}><Typography sx={{ fontSize: 16, fontWeight: 600 }}>평가손익</Typography><Typography sx={{ fontSize: 16, fontWeight: 700, color: getMarketColor(rate) }}>{formatPercent(rate)}</Typography></Stack>
    {rows.map(row => <Stack key={row.label} direction="row" sx={{ height: 26, alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 12, color: colors.textSecondary }}>{row.label}</Typography><Typography sx={{ fontSize: 12, fontWeight: 600, color: row.color, whiteSpace: 'nowrap' }}>{row.value}</Typography></Stack>)}
    <Stack data-testid="asset-previous-day" direction="row" sx={{ height: 36, alignItems: 'flex-start', pt: '2px', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 12, color: colors.textMuted }}>전일 대비</Typography><Stack sx={{ alignItems: 'flex-end', minWidth: 0, whiteSpace: 'nowrap', textAlign: 'right' }}><Typography sx={{ fontSize: 12, lineHeight: '18px', fontWeight: 600, color: getMarketColor(summary.previousDayChange ?? Number.NaN) }}>{formatSignedWon(summary.previousDayChange ?? Number.NaN)}</Typography><Typography sx={{ fontSize: 10, lineHeight: '14px', color: getMarketColor(summary.previousDayChangeRate ?? Number.NaN) }}>{formatPercent(summary.previousDayChangeRate ?? Number.NaN)}</Typography></Stack></Stack>
  </AppCard>;
}

function CompositionCard({ summary, items, mode, onToggle, updating,allocationAvailable }: { summary: DashboardSummary; items: ChartItem[]; mode: 'cumulative' | 'ranked'; onToggle: () => void; updating: boolean;allocationAvailable:boolean }) {
  const {available,stockPercent,cashPercent,stockColor,cashColor}=cashAllocation(summary.stockValue,summary.cashBalance,summary.pricingComplete!==false&&allocationAvailable);
  const named = items.filter(item => item.id !== 'other');
  return <AppCard data-testid="asset-composition-card" sx={{ minWidth: 0, height: { xs: 552, sm: '100%' }, minHeight: 552, position: 'relative', borderRadius: '8px', borderColor: '#25344D', px: '13px', pt: '15px', overflow: 'visible' }}>
    <Typography sx={{ pl: '4px', fontSize: 15, lineHeight: '18px', fontWeight: 600 }}>자산구성</Typography>
    {!available ? <Box sx={{ height: 470, display: 'grid', placeItems: 'center' }}><Box><Stack direction="row" sx={{justifyContent:"space-between",color:colors.textMuted}}><span>{formatWon(summary.stockValue)} · —</span><span>{formatWon(summary.cashBalance)} · —</span></Stack><Typography role="status" sx={{ color: colors.textMuted, fontSize: 11 }}>{summary.pricingComplete === false ? '가격 미수집 종목이 있어 자산구성을 계산할 수 없습니다.' : !Number.isFinite(summary.totalAssets) ? '자산구성을 계산할 수 없습니다.' : '내용이 없습니다.'}</Typography></Box></Box> : <>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: '16px', height: 16, fontSize: 11, fontWeight: 600, color: stockColor }}><span>{formatWon(summary.stockValue)}</span><Box component="span" sx={{ color: cashColor }}>{formatWon(summary.cashBalance)}</Box></Stack>
      <Stack role="img" aria-label={`주식 ${formatPercent(stockPercent)}, 예수금 ${formatPercent(cashPercent)}`} direction="row" sx={{ width: '100%', height: 12, borderRadius: '6px', overflow: 'hidden', mt: '4px', bgcolor: colors.raised }}><Box sx={{ width: `${stockPercent}%`, bgcolor: stockColor }} /><Box sx={{ width: `${cashPercent}%`, bgcolor: cashColor }} /></Stack>
      <Stack direction="row" sx={{ justifyContent: 'space-between', mt: '5px', height: 25, borderBottom: '1px solid #25344D', fontSize: 11, fontWeight: 600, color: stockColor }}><Box component="span" sx={{color:stockColor}}>{formatPercent(stockPercent)}</Box><Box component="span" sx={{ color: cashColor }}>{formatPercent(cashPercent)}</Box></Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: '124.8px minmax(0, 1fr)', gap: '8.8px', mt: '16px', height: 178, borderBottom: '1px solid #25344D' }}>
        <Box data-testid="asset-donut" role="img" aria-label="종목별 자산 구성 도넛" sx={{ position: 'relative', width: '100%', maxWidth: 124.8, height: 124.8, mt: '15.6px' }}>
          <svg viewBox="0 0 156 156" width="100%" height="124.8" aria-hidden="true"><circle cx="78" cy="78" r="51" fill="none" stroke={colors.raised} strokeWidth="26" />{items.map((item, index) => <circle key={item.id} cx="78" cy="78" r="51" fill="none" stroke={item.color} strokeWidth="26" pathLength="100" strokeDasharray={`${item.percent} ${100 - item.percent}`} strokeDashoffset={-items.slice(0, index).reduce((sum, previous) => sum + previous.percent, 0)} transform="rotate(-90 78 78)" />)}</svg>
          <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', gap: '2.4px' }}><Typography sx={{ fontSize: 10, lineHeight: '12px', color: colors.textMuted }}>주식평가액</Typography><Typography data-testid="asset-donut-value" sx={{ fontSize: 10, lineHeight: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>{Number.isFinite(summary.stockValue) ? `${(summary.stockValue / 10_000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원` : '—'}</Typography></Stack>
        </Box>
        <Stack data-testid="asset-legend" spacing="11px" sx={{ minWidth: 0 }}>{items.map(item => <Box data-testid="asset-legend-row" key={item.id} sx={{ display: 'grid', gridTemplateColumns: '8px minmax(0, 1fr) minmax(36px, max-content)', alignItems: 'center', gap: '8px', height: 18 }}><Box sx={{ width: 8, height: 8, bgcolor: item.color, borderRadius: '50%' }} /><Typography noWrap sx={{ fontSize: 11 }}>{item.name}</Typography><Typography sx={{ fontSize: 11, textAlign: 'right', color: weightColor(item.percent,colors.textMuted), whiteSpace: 'nowrap' }}>{formatPercent(item.percent)}</Typography></Box>)}</Stack>
      </Box>
      <Box sx={{ pt: '12px' }}>
        <Stack direction="row" sx={{ height: 24, alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 16, fontWeight: 600 }}>종목별 비중</Typography><Button onClick={onToggle} aria-label="종목별 비중 차트 방식 변경" sx={{ minWidth: 62, minHeight: 22, height: 22, borderRadius: '11px', bgcolor: colors.raised, color: colors.focus, fontSize: 10, p: 0 }}>{mode === 'cumulative' ? '누적형' : '순위형'}</Button></Stack>
        <Stack direction="row" role="img" aria-label="종목별 비중 누적 막대" sx={{ mt: '14px', height: 12, borderRadius: '6px', bgcolor: colors.raised, overflow: 'hidden' }}>{items.map(item => <Box key={item.id} sx={{ width: `${item.percent}%`, bgcolor: item.color }} />)}</Stack>
        <Stack spacing="9px" sx={{ mt: '16px' }}>{named.map((item, index) => {
          const offset = mode === 'cumulative' ? named.slice(0, index).reduce((sum, previous) => sum + previous.percent, 0) : 0;
          return <Box data-testid="asset-weight-row" key={item.id} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 100px) minmax(0, 1fr) 62px', alignItems: 'center', gap: '8px', height: 16 }}><Typography noWrap sx={{ fontSize: 10.5 }}>{item.name}</Typography><Box sx={{ height: 7, bgcolor: '#202B3E', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}><Box sx={{ width: `${offset}%`, height: '100%', bgcolor: '#2B374B' }} /><Box data-testid="asset-weight-fill" sx={{ position: 'absolute', top: 0, left: `${offset}%`, width: `${item.percent}%`, height: '100%', bgcolor: item.color, borderRadius: '4px' }} /></Box><Typography sx={{ textAlign: 'right', color: weightColor(item.percent,item.color), fontSize: 10.5, fontWeight: 600 }}>{formatPercent(item.percent)}</Typography></Box>;
        })}</Stack>
        {items.length === 0 && <Typography role="status" sx={{ mt: 2, fontSize: 11, color: colors.textMuted }}>내용이 없습니다.</Typography>}
      </Box>
    </>}
    <Typography sx={{ position: 'absolute', left: 13, right: 13, bottom: 10, fontSize: 10, lineHeight: '20px', color: colors.textSecondary, opacity: .65 }}>갱신 {homeTimestamp(summary.collectedAt)}</Typography>
  </AppCard>;
}
