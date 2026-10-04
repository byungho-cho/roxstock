import '../dashboard/home-font.css';
import { Box, Button, ButtonBase, CardActionArea, Skeleton, Snackbar, Stack, Typography, useMediaQuery } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { useLocation } from 'react-router-dom';
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

export function AssetAnalysisPage() {
  const { accountId, accounts } = useActiveAccount(), location = useLocation();
  const navigate = useListNavigation(), back = useReturnNavigation('/');
  const supplied = new URLSearchParams(location.search).get('period');
  const [period, setPeriod] = usePageMemory<AnalysisPeriod>('analysis-period', analysisPeriods.some(item => item.value === supplied) ? supplied as AnalysisPeriod : '1y');
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  const range = analysisRange(period, today);
  const dashboard = useQuery({ queryKey: ['analysis-dashboard', accountId], queryFn: () => getAccountDashboard(accountId!), enabled: !!accountId });
  const history = useQuery({ queryKey: ['analysis-history', accountId, range.from, range.to], queryFn: () => getAssetHistory(accountId!, range), enabled: !!accountId });
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
  if (accounts.isPending || (accountId && dashboard.isPending)) return <>{header}<Skeleton variant="rounded" height={92} aria-label="자산분석 조회 중" /></>;
  if (!accountId || !dashboard.data) return <>{header}<AppCard sx={cardStyle}><Typography>{failed ? '자산분석 조회에 실패했습니다.' : '선택할 계좌가 없습니다.'}</Typography>{failed && <Button onClick={retry}>다시 시도</Button>}</AppCard></>;
  const current = dashboard.data, total = decimalValue(current.totalAssetValue), stock = decimalValue(current.stockValue), cash = decimalValue(current.cashBalance);
  const rate = decimalValue(summary?.returnRate), profit = decimalValue(summary?.profitLoss);
  const available = current.pricingComplete && Number.isFinite(total) && total > 0;
  const stockRatio = available ? stock / total * 100 : Number.NaN, cashRatio = available ? cash / total * 100 : Number.NaN;
  const points = (data?.data ?? []).filter(point => Number.isFinite(decimalValue(point.totalAssetValue)));
  const values = points.map(point => decimalValue(point.totalAssetValue)), min = Math.min(...values), span = Math.max(1, Math.max(...values) - min);
  const graph = values.map((value, i) => `${10 + i / Math.max(1, values.length - 1) * 300},${78 - (value - min) / span * 68}`).join(' ');
  const rows: { label: string; value: number; signed?: boolean; divider?: boolean; percent?: boolean }[] = [
    { label: '기간 시작자산', value: decimalValue(summary?.openingAssetValue ?? points.at(0)?.totalAssetValue) },
    { label: '총입금', value: decimalValue(summary?.depositAmount), signed: true },
    { label: '총출금', value: decimalValue(summary?.withdrawalAmount) === 0 ? 0 : -decimalValue(summary?.withdrawalAmount), signed: true },
    { label: '순입출금', value: decimalValue(summary?.depositAmount) - decimalValue(summary?.withdrawalAmount), signed: true },
    { label: '평가손익', value: Number.NaN, signed: true, divider: true },
    { label: '실현손익', value: Number.NaN, signed: true },
    { label: '배당수익', value: Number.NaN, signed: true },
    { label: '수수료·세금', value: Number.NaN, signed: true },
    { label: '기간 투자손익', value: profit, signed: true, divider: true },
    { label: '투자수익률', value: rate, percent: true },
    { label: '현재 총자산', value: total, divider: true },
  ];
  const left = <>
    <AppCard data-testid="analysis-total" sx={{ ...cardStyle, p: 0 }}><CardActionArea onClick={() => go('/detail/investment')} sx={{ px: '16px', py: '8px' }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', height: 23 }}><Stack direction="row" sx={{ gap: '8px', alignItems: 'center' }}><Typography sx={titleStyle}>총자산</Typography><Typography sx={hintStyle}>(상세보기)</Typography></Stack><Typography sx={{ fontSize: 14, color: getMarketColor(rate), whiteSpace: 'nowrap' }}>{formatRate(rate)}</Typography></Stack>
      <Typography data-testid="analysis-total-value" sx={{ my: '4px', textAlign: 'right', fontSize: 24, lineHeight: '29px', fontWeight: 700, whiteSpace: 'nowrap', color: getMarketColor(profit) }}>{formatWon(total)}</Typography>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: '8px', height: 16 }}><Typography sx={hintStyle}>{current.latestPriceUpdatedAt ? new Date(current.latestPriceUpdatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '시세 미수집'}</Typography><Typography sx={{ fontSize: 11, textAlign: 'right', color: getMarketColor(profit), whiteSpace: 'nowrap' }}>{analysisPeriods.find(item => item.value === period)?.label} · {formatSignedWon(profit)}</Typography></Stack>
    </CardActionArea></AppCard>
    <AppCard data-testid="analysis-composition" sx={cardStyle}><Typography sx={titleStyle}>자산구성</Typography>
      {available ? <Box role="img" aria-label="주식·예수금 비중" sx={{ display: 'flex', mt: '4px', height: 12, overflow: 'hidden', borderRadius: '6px' }}><Box sx={{ width: `${stockRatio}%`, bgcolor: colors.positive }} /><Box sx={{ width: `${cashRatio}%`, bgcolor: colors.warning }} /></Box> : <Typography sx={{ ...hintStyle, mt: '4px' }}>시세 미수집 · 구성 계산 불가</Typography>}
      {[{ name: '주식', value: stock, ratio: stockRatio, color: colors.positive }, { name: '예수금', value: cash, ratio: cashRatio, color: colors.warning }].map(item => <Box key={item.name} sx={{ display: 'grid', gridTemplateColumns: 'minmax(48px, 1fr) 60px minmax(110px, 1.3fr)', gap: '4px', mt: '4px', height: 12, alignItems: 'center' }}><Typography sx={{ fontSize: 12 }}>{item.name}</Typography><Typography sx={{ fontSize: 11, textAlign: 'right', color: item.color }}>{formatPercent(item.ratio)}</Typography><Typography sx={{ fontSize: 11, textAlign: 'right', whiteSpace: 'nowrap', color: item.color }}>{formatWon(item.value)}</Typography></Box>)}
    </AppCard>
    <AppCard data-testid="analysis-trend" sx={{ ...cardStyle, pb: '2px' }}><ButtonBase data-testid="analysis-trend-title" onClick={() => go('/detail/investment-profit')} sx={{ width: '100%', height: 23, display: 'flex', justifyContent: 'space-between', gap: '8px' }}><Stack direction="row" sx={{ gap: '8px', alignItems: 'flex-end', minWidth: 0 }}><Typography sx={{ ...titleStyle, whiteSpace: 'nowrap' }}>자산추이</Typography><Typography data-testid="analysis-trend-period" sx={hintStyle}>{label}</Typography></Stack><Typography sx={{ ...hintStyle, flexShrink: 0 }}>상세보기 ›</Typography></ButtonBase>
      <Stack direction="row" sx={{ gap: '4px', my: '8px' }}>{analysisPeriods.map(item => <Button key={item.value} aria-pressed={item.value === period} onClick={event => { event.stopPropagation(); setPeriod(item.value); }} sx={{ flex: 1, minWidth: 0, height: 24, minHeight: 24, p: 0, borderRadius: '4px', fontSize: 10, bgcolor: item.value === period ? colors.buttonPrimary : colors.raised, color: item.value === period ? colors.textPrimary : colors.textSecondary }}>{item.label}</Button>)}</Stack>
      {history.isPending ? <Skeleton height={100} /> : history.isError && !data ? <Box><Typography sx={hintStyle}>자산 이력 조회에 실패했습니다.</Typography><Button onClick={() => history.refetch()}>다시 시도</Button></Box> : points.length === 0 ? <Typography sx={{ ...hintStyle, height: 100, display: 'grid', placeItems: 'center' }}>내용이 없습니다.</Typography> : points.length < 2 ? <Typography sx={{ ...hintStyle, height: 100, display: 'grid', placeItems: 'center' }}>기간 계산 불가 · 스냅샷이 부족합니다.</Typography> : <Box data-testid="analysis-chart" role="img" aria-label="실제 계좌 자산추이" sx={{ height: 121 }}><svg width="100%" height="100" viewBox="0 0 320 100" preserveAspectRatio="none"><path d="M0 34 H320 M0 78 H320" stroke={colors.border} /><polyline points={graph} stroke={colors.marketRise} strokeWidth="3" vectorEffect="non-scaling-stroke" fill="none" /></svg><Stack direction="row" sx={{ justifyContent: 'space-between' }}>{[points.at(0), points.at(-1)].map((point, i) => <Typography key={i} sx={{ ...hintStyle, color: i ? getMarketColor(profit) : colors.textMuted }}>{(decimalValue(point?.totalAssetValue) / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}만원</Typography>)}</Stack></Box>}
    </AppCard>
  </>;
  const right = <>
    <AppCard data-testid="analysis-performance" sx={{ ...cardStyle, pt: 0, pb: '14px', overflow: 'visible' }}>
      <Box data-testid="analysis-sticky" sx={{ position: 'sticky', top: 0, zIndex: 2, bgcolor: colors.surface, pt: '14px', pb: '4px', borderBottom: `1px solid ${colors.border}` }}><Stack direction="row" sx={{ height: 23, gap: '8px', justifyContent: 'space-between', alignItems: 'flex-end' }}><Typography sx={{ ...titleStyle, whiteSpace: 'nowrap' }}>기간 성과 구성</Typography><Typography data-testid="analysis-performance-period" sx={{ ...hintStyle, textAlign: 'right' }}>{label}</Typography></Stack></Box>
      <Stack spacing="4px" sx={{ mt: '4px' }}>{rows.map(row => <Box key={row.label}>{row.divider && <Box sx={{ borderTop: `1px solid ${colors.border}`, mb: '4px' }} />}<Stack data-testid={'analysis-metric-' + row.label} direction="row" sx={{ height: 20, alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}><Typography sx={{ fontSize: 12, color: colors.textSecondary, whiteSpace: 'nowrap' }}>{row.label}</Typography><Typography sx={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'right', color: row.signed || row.percent ? getMarketColor(row.value) : colors.textPrimary }}>{row.percent ? formatRate(row.value) : row.signed ? formatSignedWon(row.value) : formatWon(row.value)}</Typography></Stack></Box>)}</Stack>
      <Typography data-testid="analysis-unavailable" sx={{ ...hintStyle, mt: '8px', whiteSpace: 'normal' }}>세부 손익은 기간 기준 API가 없어 계산할 수 없습니다.</Typography>
    </AppCard>
    <AppCard data-testid="analysis-compound" sx={{ ...cardStyle, p: 0 }}><CardActionArea onClick={() => go('/detail/compound')} sx={{ px: '16px', py: '8px' }}><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={titleStyle}>복리계획</Typography><Typography sx={hintStyle}>상세보기 ›</Typography></Stack><Stack direction="row" sx={{ justifyContent: 'space-between', mt: '4px' }}>{['현재 자산', '올해 목표'].map(name => <Box key={name}><Typography sx={hintStyle}>{name}</Typography><Typography sx={{ fontSize: 12 }}>—</Typography></Box>)}</Stack><Typography sx={{ ...hintStyle, mt: '8px', whiteSpace: 'normal' }}>계획 조회 API와 기준 자산 연결이 필요합니다.</Typography></CardActionArea></AppCard>
  </>;
  return <>{header}<Snackbar open={failed && !!dashboard.data} message="최신 조회에 실패했습니다. 다시 시도해 주세요." action={<Button onClick={retry}>재시도</Button>} />
    <Box className="rox-home" data-testid="asset-analysis" data-screen-id={tablet ? 'T1400' : 'C1400'} data-restoration-ready={!history.isPending} sx={{ height: { sm: '100%' }, minHeight: 0, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: '8px' }}>
      <Stack ref={leftRef} data-scroll-region="analysis-left" spacing="8px" sx={{ minWidth: 0, minHeight: 0, overflowY: { xs: 'visible', sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, pb: { xs: 0, sm: '80px' } }}>{left}</Stack>
      <Stack ref={rightRef} data-scroll-region="analysis-right" spacing="8px" sx={{ minWidth: 0, minHeight: 0, overflowY: { xs: 'visible', sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, pb: { xs: 0, sm: '80px' } }}>{right}</Stack>
    </Box>{tablet && <><OverlayRegionScrollbar scrollRef={leftRef} label="자산분석 왼쪽 스크롤" offset={0} /><OverlayRegionScrollbar scrollRef={rightRef} label="자산분석 오른쪽 스크롤" offset={0} /></>}
  </>;
}
