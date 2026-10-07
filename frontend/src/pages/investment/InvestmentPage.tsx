import { storedQueryOptions } from '../../data/storedQueryOptions';
import { rate, won } from '../investment-profit/profitData';
import '../dashboard/home-font.css';
import { Box, Button, ButtonBase, Skeleton, Stack, Typography, useMediaQuery } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { AppCard } from '../../components/common/Common';
import { PageHeader } from '../../components/navigation/Navigation';
import { OverlayRegionScrollbar } from '../../components/navigation/OverlayRegionScrollbar';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { usePageMemory, useReturnNavigation } from '../../hooks/navigation/usePageMemory';
import { colors } from '../../styles/tokens';
import { loadInvestment, moneyNumber, moneyText, periodRange, quarterAvailable, quarters, seoulToday, type Quarter } from './investmentData';

const card = { border: 0, borderRadius: '8px', bgcolor: '#0F1726', p: '12px 16px', minWidth: 0, flexShrink: 0 };
const small = { fontSize: 10, lineHeight: '14px', color: colors.textMuted };
const rowStyle = { display: 'grid', gridTemplateColumns: '54px minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', minHeight: 20, alignItems: 'center' };
const pnlColor = (value: bigint | null) => value === null || value === 0n ? colors.textPrimary : value > 0n ? colors.marketRise : colors.marketFall;

export function InvestmentPage() {
  const { accountId, accounts } = useActiveAccount(), back = useReturnNavigation('/assets');
  const today = seoulToday(), currentYear = Number(today.slice(0, 4));
  const [year, setYear] = usePageMemory('investment-year', currentYear);
  const [storedQuarter, setQuarter] = usePageMemory<Quarter>('investment-quarter', 0);
  const quarter = quarterAvailable(year, storedQuarter, today) ? storedQuarter : 0;
  useEffect(() => { if (storedQuarter !== quarter) setQuarter(0); }, [storedQuarter, quarter, setQuarter]);
  const query = useQuery({ ...storedQueryOptions, queryKey: ['investment', accountId, year], queryFn: ({ signal }) => loadInvestment(accountId!, year, today, signal), enabled: !!accountId, retry: false });
  const tablet = useMediaQuery('(min-width:600px)'), leftRef = useRef<HTMLDivElement>(null), rightRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const changeYear = (direction: number) => {
    const next = year + direction < 2010 ? currentYear : year + direction > currentYear ? 2010 : year + direction;
    if (!quarterAvailable(next, quarter, today)) setQuarter(0);
    setYear(next);
  };
  const data = query.data, range = periodRange(year, quarter, today);
  const points = (data?.points ?? []).filter(point => point.date >= range.from && point.date <= range.to);
  const delta = data?.evaluation != null && data.investment != null ? data.evaluation - data.investment : null;
  const failed = accounts.isError || query.isError;
  const retry = () => { if (accounts.isError) void accounts.refetch(); if (accountId) void query.refetch(); };
  const pending = accounts.isPending || (!!accountId && query.isPending);
  const status = failed ? '조회에 실패했습니다.' : pending ? '조회 중입니다.' : !accountId ? '선택할 계좌가 없습니다.' : '내용이 없습니다.';
  const chartValues = points.flatMap(point => [moneyNumber(point.evaluation), moneyNumber(point.investment)]).filter(Number.isFinite);
  const min = Math.min(...chartValues), max = Math.max(...chartValues), span = Math.max(1, max - min);
  const firstDay = Date.parse(range.from), daySpan = Math.max(1, Date.parse(range.to) - firstDay);
  const pathFor = (key: 'evaluation' | 'investment') => {
    let continuing = false;
    return points.map(point => {
      const value = moneyNumber(point[key]);
      if (!Number.isFinite(value)) { continuing = false; return ''; }
      const command = continuing ? 'L' : 'M'; continuing = true;
      return `${command}${(Date.parse(point.date) - firstDay) / daySpan * 320},${112 - (value - min) / span * 100}`;
    }).join(' ');
  };
  const summary = <>
    <Box data-testid="investment-year" onTouchStart={event => { const t = event.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; }} onTouchEnd={event => { const start = touch.current, end = event.changedTouches[0]; touch.current = null; if (start && Math.abs(end.clientX - start.x) >= 60 && Math.abs(end.clientX - start.x) > Math.abs(end.clientY - start.y) * 1.5) changeYear(end.clientX < start.x ? 1 : -1); }} sx={{ height: 34, flexShrink: 0, display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) 32px', alignItems: 'center', px: '12px', borderRadius: '8px', bgcolor: '#151E2F' }}>
      <ButtonBase aria-label="이전 연도" onClick={() => changeYear(-1)} sx={{ width: 32, height: 32 }}><Box component="img" src="/investment-prev.svg" alt="" /></ButtonBase><Typography sx={{ textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{year}년</Typography><ButtonBase aria-label="다음 연도" onClick={() => changeYear(1)} sx={{ width: 32, height: 32 }}><Box component="img" src="/investment-next.svg" alt="" /></ButtonBase>
    </Box>
    <AppCard data-testid="investment-current" sx={{ ...card, py: '8px' }}>
      <Typography data-testid="investment-asof" sx={small}>현재 평가금액 · {data?.asOf ? `${data.asOf.slice(5).replace('-', '.')} 기준` : '수집 기준: —'}</Typography>
      <Typography data-testid="investment-value" sx={{ textAlign: 'right', fontSize: 'clamp(20px, 5.5vw, 24px)', fontWeight: 600, lineHeight: '30px', my: '6px', color: pnlColor(delta), overflowWrap: 'anywhere' }}>{moneyText(data?.evaluation ?? null)}</Typography>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: '8px', color: pnlColor(data?.annualTradingProfit ?? null) }}><Typography sx={{ fontSize: 11 }}>{year === currentYear ? '올해' : `${year}년`} 누적 매매손익 {rate(data?.annualTradingProfit ?? null, data?.investment == null ? null : data.investment * 10000n, true)}</Typography><Typography data-testid="investment-trading-profit" sx={{ fontSize: 12, textAlign: 'right', overflowWrap: 'anywhere' }}>{won(data?.annualTradingProfit ?? null, true)}</Typography></Stack>
    </AppCard>
    <AppCard data-testid="investment-summary" sx={card}><Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>{[{ label: '초기투자금', value: data?.initialInvestment ?? null }, { label: '누적투자금', value: data?.investment ?? null }, { label: '배당', value: data?.dividend ?? null }].map((item, index) => <Box key={item.label} sx={{ minWidth: 0, pl: index ? '8px' : 0, borderLeft: index ? `1px solid ${colors.border}` : undefined }}><Typography sx={{ fontSize: 12, fontWeight: 600 }}>{item.label}</Typography><Typography data-testid={`investment-metric-${index}`} sx={{ mt: '3px', fontSize: 10, textAlign: 'right', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{moneyText(item.value)}</Typography></Box>)}</Box></AppCard>
    <AppCard data-testid="investment-trend" sx={{ ...card, bgcolor: '#111927', pt: '6px', pb: '8px' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: '4px', minHeight: 24 }}><Typography sx={{ fontSize: 12, fontWeight: 600 }}>일별 평가금액 · 추이</Typography><Stack direction="row" spacing="8px"><Typography sx={{ ...small, color: '#FB7185' }}>● 평가금액</Typography><Typography sx={{ ...small, color: colors.marketFall }}>● 투자금</Typography></Stack></Stack>
      <Box data-testid="investment-chart" data-dates={points.map(point => point.date).join(',')} sx={{ height: 148, mt: '8px' }}>
        {pending && !data ? <Skeleton height={128} /> : !points.length ? <Typography role="status" sx={{ ...small, height: 128, display: 'grid', placeItems: 'center' }}>{status}</Typography> : <Box component="svg" role="img" aria-label="선택 기간 평가금액과 투자금" viewBox="0 0 320 128" preserveAspectRatio="none" sx={{ width: '100%', height: 128, overflow: 'visible' }}><path d="M0 12 H320 M0 46 H320 M0 80 H320 M0 114 H320" stroke={colors.border} /><path data-testid="investment-evaluation-line" d={pathFor('evaluation')} stroke="#FB7185" strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" /><path data-testid="investment-principal-line" d={pathFor('investment')} stroke={colors.marketFall} strokeWidth="2" vectorEffect="non-scaling-stroke" fill="none" />{points.length === 1 && (['evaluation', 'investment'] as const).map(key => Number.isFinite(moneyNumber(points[0][key])) ? <circle key={key} cx={(Date.parse(points[0].date) - firstDay) / daySpan * 320} cy={112 - (moneyNumber(points[0][key]) - min) / span * 100} r="2" fill={key === 'evaluation' ? '#FB7185' : colors.marketFall} /> : null)}</Box>}
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}>{Array.from({ length: 5 }, (_, index) => <Typography key={index} sx={small}>{new Date(firstDay + daySpan * index / 4).toISOString().slice(5, 10).replace('-', '.')}</Typography>)}</Stack>
      </Box>
      <Stack direction="row" spacing="4px" data-testid="investment-quarters" sx={{ mt: '8px' }}>{quarters.map(value => <Button key={value} aria-pressed={quarter === value} disabled={!quarterAvailable(year, value, today)} onClick={() => setQuarter(value)} sx={{ flex: 1, minWidth: 0, p: 0, height: 28, minHeight: 28, borderRadius: '8px', fontSize: 11, fontWeight: 600, bgcolor: quarter === value ? '#337DF5' : '#1A2433', color: quarter === value ? 'white' : '#A6B2C4' }}>{value ? `${value}분기` : '전체'}</Button>)}</Stack>
    </AppCard>
  </>;
  const table = <AppCard data-testid="investment-history" sx={card}><Typography sx={{ fontSize: 16, fontWeight: 600, mb: '8px' }}>투자내역</Typography><Stack spacing="8px"><Box sx={rowStyle}>{['날짜', '평가금액', '투자금'].map((title, index) => <Typography key={title} sx={{ ...small, textAlign: index ? 'right' : 'left' }}>{title}</Typography>)}</Box>
    {[...points].reverse().map(point => <Box key={point.date} data-testid="investment-row" data-scroll-item={point.date} data-date={point.date} sx={rowStyle}><Typography sx={{ fontSize: 10 }}>{point.date.slice(2).replaceAll('-', '.')}</Typography><Typography sx={{ fontSize: 10, textAlign: 'right', color: '#F77070', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{moneyText(point.evaluation)}</Typography><Typography sx={{ fontSize: 10, textAlign: 'right', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{moneyText(point.investment)}</Typography></Box>)}
    {!points.length && <Typography role="status" sx={{ ...small, py: '8px', textAlign: 'center' }}>{status}</Typography>}
    </Stack><Typography sx={{ ...small, mt: '8px' }}>초기투자금 기준: {data?.initialAsOf??'스냅샷 없음 · 0원'} · 배당은 선택 연도 세후 금액</Typography>{data?.historicalUnavailable && <Typography sx={{ ...small, mt: '4px' }}>과거 기준금액을 확인할 수 없는 투자금은 —로 표시합니다.</Typography>}
  </AppCard>;
  return <><PageHeader title="투자금" variant="detail" onBack={back} showAdd={false} embedded assetOverview backIcon={<Box component="span" sx={{ fontSize: 28 }}>‹</Box>} />
    <Box className="rox-home" data-testid="investment-page" data-screen-id={tablet ? 'T1500' : 'C1500'} data-restoration-ready={!pending} data-list-condition={`${year}:${quarter}`} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: '8px', height: { sm: '100%' }, minHeight: 0 }}>
      <Stack ref={leftRef} data-scroll-region="investment-left" spacing="8px" sx={{ minWidth: 0, minHeight: 0, overflowY: { xs: 'visible', sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, pb: { sm: '80px' } }}>{summary}</Stack>
      <Stack ref={rightRef} data-scroll-region="investment-right" spacing="8px" sx={{ minWidth: 0, minHeight: 0, overflowY: { xs: 'visible', sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, pb: { sm: '80px' } }}>{failed && <AppCard sx={card}><Typography role="alert" sx={small}>조회에 실패했습니다.{data ? ' 이전 데이터를 표시합니다.' : ''}</Typography><Button onClick={retry} sx={{ fontSize: 11 }}>재시도</Button></AppCard>}{query.isFetching && data && <Typography role="status" sx={small}>갱신 중…</Typography>}{table}</Stack>
    </Box>{tablet && <><OverlayRegionScrollbar scrollRef={leftRef} label="투자금 왼쪽 스크롤" offset={0} /><OverlayRegionScrollbar scrollRef={rightRef} label="투자금 오른쪽 스크롤" offset={0} /></>}
  </>;
}
