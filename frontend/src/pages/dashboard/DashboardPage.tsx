import { Box, Button, CardActionArea, CircularProgress, Skeleton, Stack, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useDashboard } from '../../hooks/useMockData';
import type { CollectionStatus, StockItem } from '../../types/models';
import { formatRate, formatWon, getMarketColor } from '../../utils/format';
import { AppCard, SectionHeader } from '../../components/common/Common';
import { AssetQuickCards, TotalAssetCard } from '../../components/common/AssetSummaryCards';
import { colors } from '../../styles/tokens';

const collectionStatusLabel: Record<CollectionStatus, string> = { success: '시세 수집 정상', partial: '시세 일부 실패', failed: '시세 수집 실패' };

export function DashboardPage() {
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useDashboard();
  if (isPending) return <DashboardLoading />;
  if (isError || !data) return <AppCard><Box sx={{ p: 2 }}><Typography sx={{ fontWeight: 700 }}>대시보드를 불러오지 못했어요.</Typography><Typography color="text.secondary" sx={{ mt: 0.5, cursor: 'pointer' }} onClick={() => refetch()}>눌러서 다시 시도해 주세요.</Typography></Box></AppCard>;

  const { summary, holdings, trend } = data;
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: { xs: '8px', sm: '16px' }, alignItems: 'stretch', height: { sm: '100%' }, minHeight: { sm: 327 } }}>
    <Stack spacing="8px" sx={{ minWidth: 0, height: { sm: '100%' } }}>
      <TotalAssetCard summary={summary} home />
      <AssetQuickCards summary={summary} home />
      <AppCard sx={{ height: { xs: 88, sm: 'auto' }, minHeight: { sm: 167 }, flex: { sm: 1 }, borderRadius: '8px' }}><CardActionArea onClick={() => navigate('/assets')} sx={{ height: '100%', px: { xs: '14px', sm: '15px' }, py: { xs: '12px', sm: '9px' } }}>
        <SectionHeader title="자산 추이" action={<Typography sx={{ fontSize: { xs: 10, sm: 11 }, lineHeight: '14px', fontWeight: 500, color: { xs: colors.focus, sm: colors.textMuted } }}>{trend.length > 1 ? <><Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>1개월</Box><Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>최근 1년</Box></> : '데이터 없음'}</Typography>} />
        {trend.length > 1 ? <TrendChart values={trend.map((item) => item.value)} labels={trend.map((item) => item.label)} /> : <Typography sx={{ mt: 1, color: colors.textMuted, fontSize: 11 }}>과거 자산 추이 데이터가 없습니다.</Typography>}
      </CardActionArea></AppCard>
    </Stack>
    <AppCard sx={{ minWidth: 0, height: { xs: 156, sm: '100%' }, minHeight: { sm: 327 }, borderRadius: '8px' }}><Box sx={{ px: { xs: '14px', sm: '15px' }, py: { xs: '12px', sm: '11px' }, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardActionArea onClick={() => navigate('/stocks?tab=holding')} sx={{ height: 24, flexShrink: 0, borderRadius: '4px' }}><Stack direction="row" sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}><Stack direction="row" spacing="7px" sx={{ alignItems: 'center' }}><Typography sx={{ fontSize: { xs: 16, sm: 15 }, lineHeight: '24px', fontWeight: 600 }}>보유종목</Typography>{summary.pricingComplete === false ? <Box role="img" aria-label="가격 미수집" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: colors.textMuted }} /> : <Box component="img" src="/figma-100/cover-status.svg" alt="시세 수집 정상" sx={{ width: 8, height: 8 }} />}</Stack><Typography sx={{ fontSize: { xs: 10, sm: 11 }, lineHeight: '14px', fontWeight: 500, color: { xs: colors.focus, sm: colors.textMuted } }}>전체 {holdings.length}</Typography></Stack></CardActionArea>
      {summary.pricingComplete === false && <Typography role="status" sx={{ color: colors.textMuted, fontSize: 11 }}>가격 미수집 종목이 있어 평가자산을 계산할 수 없습니다.</Typography>}
      {holdings.length === 0 && <Typography role="status" sx={{ mt: 2, color: colors.textMuted, fontSize: 12 }}>보유종목이 없습니다.</Typography>}
      <Box sx={{ display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: 'minmax(0, 1fr) 62px 98px', borderTop: `1px solid ${colors.borderStrong}`, mt: '3px', pt: '7px', color: colors.textMuted, fontSize: 10 }}><span>종목</span><Box sx={{ textAlign: 'right' }}>등락률</Box><Box sx={{ textAlign: 'right' }}>평가금액</Box></Box>
      <Stack sx={{ mt: '10px', display: { xs: 'flex', sm: 'none' } }}>{holdings.slice(0, 3).map((holding) => <HoldingRow key={holding.id} stock={holding} onClick={() => navigate(`/stocks/${holding.id}`)} />)}</Stack>
      <Stack sx={{ display: { xs: 'none', sm: 'flex' } }}>{holdings.slice(0, 5).map((holding) => <HoldingRow key={holding.id} stock={holding} onClick={() => navigate(`/stocks/${holding.id}`)} />)}</Stack>
      <Button onClick={() => navigate('/stocks?tab=holding')} sx={{ display: { xs: 'none', sm: 'flex' }, mt: 'auto', alignSelf: 'flex-end', fontSize: 11, minHeight: 24, color: colors.focus }}>보유종목 전체 보기 →</Button>
    </Box></AppCard>
  </Box>;
}

function HoldingRow({ stock, onClick }: { stock: StockItem; onClick: () => void }) {
  return <CardActionArea onClick={onClick} sx={{ minHeight: { xs: 28, sm: 38 }, borderRadius: '4px', borderBottom: { sm: `1px solid ${colors.border}` } }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) 50px 128px', sm: 'minmax(0, 1fr) 62px 98px' }, alignItems: 'center', minWidth: 0 }}><Typography noWrap sx={{ fontSize: { xs: 14, sm: 12 }, lineHeight: '21px' }}>{stock.name}</Typography><Typography sx={{ fontSize: 11, lineHeight: '16px', textAlign: 'right', fontWeight: 600, color: getMarketColor(stock.priceChangeRate) }}>{stock.priceAvailable === false ? '—' : formatRate(stock.priceChangeRate)}</Typography><Typography noWrap sx={{ fontSize: 11, lineHeight: '16px', textAlign: 'right', fontWeight: 600, color: getMarketColor(stock.priceChangeRate) }}>{formatWon(stock.marketValue ?? Number.NaN)}</Typography><Box role="img" aria-label={collectionStatusLabel[stock.collectionStatus]} title={collectionStatusLabel[stock.collectionStatus]} sx={{ display: 'none' }} /></Box></CardActionArea>;
}

function TrendChart({ values, labels }: { values: number[]; labels: string[] }) {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return <Typography sx={{ color: colors.textMuted, fontSize: 11 }}>과거 자산 추이 데이터가 없습니다.</Typography>;
  const min = Math.min(...finite); const max = Math.max(...finite); const range = Math.max(max - min, 1);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 340},${72 - ((value - min) / range) * 58}`).join(' ');
  const ticks = [0, 1, 2, 3, 4].map((i) => { const label = labels[Math.round(i * (labels.length - 1) / 4)]; return label?.includes('-') ? `${Number(label.slice(5, 7))}월` : label; }).filter(Boolean);
  const axisLabel = (value: number) => `${Math.round(value / 10_000).toLocaleString('ko-KR')}만원`;
  return <Box sx={{ mt: { xs: '7px', sm: '3px' }, width: '100%', height: { xs: 32, sm: 'calc(100% - 28px)' }, minHeight: { sm: 100 }, overflow: 'hidden' }}>
    <Box sx={{ display: { xs: 'none', sm: 'flex' }, height: 92 }}><Stack sx={{ width: 44, flexShrink: 0, justifyContent: 'space-between', color: colors.disabled, fontSize: 8, whiteSpace: 'nowrap' }}><span>{axisLabel(max)}</span><span>{axisLabel((min + max) / 2)}</span><span>{axisLabel(min)}</span></Stack><Box sx={{ flex: 1, minWidth: 0 }}><ChartLine points={points} /></Box></Box>
    <Box sx={{ display: { xs: 'block', sm: 'none' }, height: 32 }}><ChartLine points={points} /></Box>
    <Box sx={{ display: { xs: 'none', sm: 'flex' }, ml: '44px', justifyContent: 'space-between', color: colors.disabled, fontSize: 9 }}>{ticks.map((tick, index) => <span key={`${tick}-${index}`}>{tick}</span>)}</Box>
  </Box>;
}

function ChartLine({ points }: { points: string }) {
  return <svg viewBox="0 0 340 80" preserveAspectRatio="none" width="100%" height="100%" role="img" aria-label="자산 추이"><defs><linearGradient id="homeTrendFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#60A5FA" stopOpacity="0.28" /><stop offset="100%" stopColor="#60A5FA" stopOpacity="0" /></linearGradient></defs><path d="M 0 16 H 340 M 0 42 H 340 M 0 68 H 340" stroke="#25344D" strokeWidth="0.7" /><polygon points={`0,80 ${points} 340,80`} fill="url(#homeTrendFill)" /><polyline points={points} fill="none" stroke="#60A5FA" strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg>;
}

function DashboardLoading() {
  return <Stack spacing="8px"><Skeleton variant="rounded" height={76} sx={{ borderRadius: '8px' }} /><Stack direction="row" spacing="10px"><Skeleton variant="rounded" height={68} sx={{ flex: 1, borderRadius: '8px' }} /><Skeleton variant="rounded" height={68} sx={{ flex: 1, borderRadius: '8px' }} /></Stack><Skeleton variant="rounded" height={88} sx={{ borderRadius: '8px' }} /><Skeleton variant="rounded" height={156} sx={{ borderRadius: '8px' }} /><Stack direction="row" spacing={1} sx={{ justifyContent: 'center', color: 'text.secondary' }}><CircularProgress size={16} /><Typography variant="body2">데이터를 불러오는 중이에요.</Typography></Stack></Stack>;
}
