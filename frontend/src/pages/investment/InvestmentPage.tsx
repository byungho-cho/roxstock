import { isMarketClosed } from '../../utils/marketCalendar';
import { InvestmentChart } from './InvestmentChart';
import { storedQueryOptions } from '../../data/storedQueryOptions';
import { rate, won } from '../investment-profit/profitData';
import '../dashboard/home-font.css';
import { Box, Button, ButtonBase, Dialog, Skeleton, Stack, Typography, useMediaQuery } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppCard } from '../../components/common/Common';
import { PageHeader } from '../../components/navigation/Navigation';
import { OverlayRegionScrollbar } from '../../components/navigation/OverlayRegionScrollbar';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { usePageMemory, useReturnNavigation } from '../../hooks/navigation/usePageMemory';
import { colors } from '../../styles/tokens';
import { loadInvestment, moneyText, periodRange, quarterAvailable, quarters, seoulToday, type Quarter } from './investmentData';

const enableChartDetail = true; // Pilot: disable here without affecting the summary chart.
const card = { border: 0, borderRadius: '8px', bgcolor: '#0F1726', p: '12px 16px', minWidth: 0, flexShrink: 0 };
const small = { fontSize: 10, lineHeight: '14px', color: colors.textMuted };
const rowStyle = { display: 'grid', gridTemplateColumns: '48px repeat(3, minmax(0, 1fr))', gap: '4px', minHeight: 20, alignItems: 'center' };
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
  const chartHeading=useRef<HTMLDivElement>(null), alignRequested=useRef(false);
  const [alignmentRequest,requestAlignment]=useState(0);
  const changeQuarter=(value:Quarter)=>{alignRequested.current=true;setQuarter(value);requestAlignment(n=>n+1);};
  useLayoutEffect(()=>{
    const heading=chartHeading.current;
    if(!alignRequested.current||!heading)return;
    for(let parent=heading.parentElement;parent;parent=parent.parentElement){
      if(!/(auto|scroll)/.test(getComputedStyle(parent).overflowY))continue;
      const offset=heading.getBoundingClientRect().top-parent.getBoundingClientRect().top-parent.clientTop;
      if(Math.abs(offset)>1)parent.scrollTop+=offset;
      if(parent.tagName==='MAIN')break;
    }
    if(!query.isPending&&!query.isFetching)alignRequested.current=false;
  },[alignmentRequest,quarter,query.data,query.isPending,query.isFetching,tablet]);
  const location = useLocation(), navigate = useNavigate();
  const detail = new URLSearchParams(location.search).get('chart') === 'detail';
  const openDetail = () => {
    setDetailQuarter(quarter);
    const params = new URLSearchParams(location.search); params.set('chart', 'detail');
    navigate({pathname:location.pathname,search:`?${params}`}, {state:{...location.state,listEntryKey:location.state?.listEntryKey ?? location.key,investmentDetailEntry:true}});
  };
  const closeDetail = () => {
    if(location.state?.investmentDetailEntry) navigate(-1);
    else {const params=new URLSearchParams(location.search);params.delete('chart');navigate({pathname:location.pathname,search:params.toString()}, {replace:true,state:location.state});}
  };
  const [detailQuarter, setDetailQuarter] = useState<Quarter>(quarter);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const changeYear = (direction: number) => {
    const next = year + direction < 2010 ? currentYear : year + direction > currentYear ? 2010 : year + direction;
    if (!quarterAvailable(next, quarter, today)) setQuarter(0);
    setYear(next);
  };
  const data = query.data, range = periodRange(year, quarter, today);
  const points = (data?.points ?? []).filter(point => point.date >= range.from && point.date <= range.to);
  const detailRange = periodRange(year, detailQuarter, today);
  const detailPoints = (data?.points ?? []).filter(point => point.date >= detailRange.from && point.date <= detailRange.to);
  const delta = data?.evaluation != null && data.investment != null ? data.evaluation - data.investment : null;
  const displayedProfit = year === currentYear ? data?.currentYearProfit ?? null : data?.annualTradingProfit ?? null;
  const failed = accounts.isError || query.isError;
  const retry = () => { if (accounts.isError) void accounts.refetch(); if (accountId) void query.refetch(); };
  const pending = accounts.isPending || (!!accountId && query.isPending);
  const status = failed ? '조회에 실패했습니다.' : pending ? '' : !accountId ? '선택할 계좌가 없습니다.' : '내용이 없습니다.';
  const summary = <>
    <Box data-testid="investment-year" onTouchStart={event => { const t = event.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; }} onTouchEnd={event => { const start = touch.current, end = event.changedTouches[0]; touch.current = null; if (start && Math.abs(end.clientX - start.x) >= 60 && Math.abs(end.clientX - start.x) > Math.abs(end.clientY - start.y) * 1.5) changeYear(end.clientX < start.x ? 1 : -1); }} sx={{ height: 34, flexShrink: 0, display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) 32px', alignItems: 'center', px: '12px', borderRadius: '8px', bgcolor: '#151E2F' }}>
      <ButtonBase aria-label="이전 연도" onClick={() => changeYear(-1)} sx={{ width: 32, height: 32 }}><Box component="img" src="/investment-prev.svg" alt="" /></ButtonBase><Typography sx={{ textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{year}년</Typography><ButtonBase aria-label="다음 연도" onClick={() => changeYear(1)} sx={{ width: 32, height: 32 }}><Box component="img" src="/investment-next.svg" alt="" /></ButtonBase>
    </Box>
    <AppCard data-testid="investment-current" sx={{ ...card, py: '8px' }}>
      <Typography data-testid="investment-asof" sx={small}>현재 평가금액 · {data?.asOf ? `${data.asOf.slice(5).replace('-', '.')} 기준` : '수집 기준: —'}</Typography>
      <Typography data-testid="investment-value" sx={{ textAlign: 'right', fontSize: 'clamp(20px, 5.5vw, 24px)', fontWeight: 600, lineHeight: '30px', my: '6px', color: pnlColor(delta), overflowWrap: 'anywhere' }}>{moneyText(data?.evaluation ?? null)}</Typography>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: '8px', color: pnlColor(displayedProfit) }}><Typography sx={{ fontSize: 11 }}>{year === currentYear ? '올해 평가손익' : `${year}년 누적 매매손익`} {rate(displayedProfit, data?.investment == null ? null : data.investment * 10000n, true)}</Typography><Typography data-testid="investment-trading-profit" sx={{ fontSize: 12, textAlign: 'right', overflowWrap: 'anywhere' }}>{won(displayedProfit, true)}</Typography></Stack>
      {year === currentYear && <Typography data-testid="investment-profit-basis" sx={{...small,mt:'4px'}}>올해 실현손익 + 현재가 기준 잔여 Lot 평가손익 · 예수금·배당 제외{data && displayedProfit === null ? ' · 시세 미수집 또는 계산 불가' : ''}</Typography>}
    </AppCard>
    <AppCard data-testid="investment-summary" sx={card}><Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>{[{ label: '초기투자금', value: data?.initialInvestment ?? null }, { label: '누적투자금', value: data?.investment ?? null }, { label: '배당', value: data?.dividend ?? null }].map((item, index) => <Box key={item.label} sx={{ minWidth: 0, pl: index ? '8px' : 0, borderLeft: index ? `1px solid ${colors.border}` : undefined, color: index === 2 ? colors.marketRise : undefined }}><Typography sx={{ fontSize: 12, fontWeight: 600 }}>{item.label}</Typography><Typography data-testid={`investment-metric-${index}`} sx={{ mt: '3px', fontSize: 10, textAlign: 'right', overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{moneyText(item.value)}</Typography></Box>)}</Box></AppCard>
    <AppCard data-testid="investment-trend" sx={{ ...card, bgcolor: '#111927', pt: '6px', pb: '8px' }}>
      <Stack ref={chartHeading} data-testid="investment-chart-heading" direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography sx={{ fontSize: 12, fontWeight: 600 }}>일별 평가금액 · 추이</Typography>{enableChartDetail && <Button onClick={openDetail} sx={{ fontSize: 10, minHeight: 28 }}>상세보기 ›</Button>}</Stack>

      {pending && !data ? <Skeleton height={200} /> : !points.length ? <Typography role="status" sx={{ ...small, minHeight:200, display:'grid', placeItems:'center', textAlign: 'center' }}>{status}</Typography> : <InvestmentChart points={points} from={range.from} to={range.to} />}
      <Stack direction="row" spacing="4px" data-testid="investment-quarters" sx={{ mt: '8px' }}>{quarters.map(value => <Button key={value} aria-pressed={quarter === value} disabled={!quarterAvailable(year, value, today)} onClick={() => changeQuarter(value)} sx={{ flex: 1, minWidth: 0, p: 0, height: 28, minHeight: 28, borderRadius: '8px', fontSize: 11, fontWeight: 600, bgcolor: quarter === value ? '#337DF5' : '#1A2433', color: quarter === value ? 'white' : '#A6B2C4' }}>{value ? `${value}분기` : '전체'}</Button>)}</Stack>
    </AppCard>
  </>;
  const table = <AppCard data-testid="investment-history" sx={card}><Typography sx={{ fontSize: 16, fontWeight: 600, mb: '8px' }}>투자내역</Typography><Stack spacing="8px"><Box sx={rowStyle}>{['날짜', '투자금', '평가금액', '일별손익'].map((title, index) => <Typography key={title} sx={{ ...small, textAlign: index ? 'right' : 'left' }}>{title}</Typography>)}</Box>
    {[...points].reverse().map(point => <Box key={point.date} data-testid="investment-row" data-scroll-item={point.date} data-date={point.date} data-market-closed={isMarketClosed(point.date)} sx={{...rowStyle,...(isMarketClosed(point.date)?{'& .MuiTypography-root':{color:colors.textMuted}}:{})}}><Typography sx={{ fontSize: 9 }}>{point.date.slice(2).replaceAll('-', '.')}</Typography>{[point.investment, point.evaluation, point.dailyProfit ?? null].map((value, i) => <Typography key={i} sx={{ fontSize: 9, textAlign: 'right', color: i === 2 ? pnlColor(value) : undefined, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{moneyText(value, i === 2).replace('−', '-')}</Typography>)}</Box>)}
    {!points.length && <Typography role="status" sx={{ ...small, py: '8px', textAlign: 'center' }}>{status}</Typography>}
    </Stack><Typography sx={{ ...small, mt: '8px' }}>초기투자금 기준: {data?.initialAsOf??'스냅샷 없음 · 0원'} · 배당은 선택 연도 세후 금액</Typography>{data?.historicalUnavailable && <Typography sx={{ ...small, mt: '4px' }}>과거 기준금액을 확인할 수 없는 투자금은 —로 표시합니다.</Typography>}
  </AppCard>;
  return <><PageHeader title="투자금" variant="detail" onBack={back} showAdd={false} embedded assetOverview backIcon={<Box component="span" sx={{ fontSize: 28 }}>‹</Box>} />
    <Box className="rox-home" data-testid="investment-page" data-screen-id={tablet ? 'T1500' : 'C1500'} data-restoration-ready={!pending} data-list-condition={String(year)} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: '8px', height: { sm: '100%' }, minHeight: 0 }}>
      <Stack ref={leftRef} data-scroll-region="investment-left" spacing="8px" sx={{ minWidth: 0, minHeight: 0, overflowY: { xs: 'visible', sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, pb: { sm: '80px' } }}>{summary}</Stack>
      <Stack ref={rightRef} data-scroll-region="investment-right" spacing="8px" sx={{ minWidth: 0, minHeight: 0, overflowY: { xs: 'visible', sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, pb: { sm: '80px' } }}>{failed && <AppCard sx={card}><Typography role="alert" sx={small}>조회에 실패했습니다.{data ? ' 이전 데이터를 표시합니다.' : ''}</Typography><Button onClick={retry} sx={{ fontSize: 11 }}>재시도</Button></AppCard>}{table}</Stack>
    </Box>{tablet && <><OverlayRegionScrollbar scrollRef={leftRef} label="투자금 왼쪽 스크롤" offset={0} /><OverlayRegionScrollbar scrollRef={rightRef} label="투자금 오른쪽 스크롤" offset={0} /></>}
    <Dialog transitionDuration={0} fullScreen open={enableChartDetail && detail} onClose={() => closeDetail()} slotProps={{ paper: { sx: { bgcolor: '#080D18', backgroundImage: 'none', p: '8px', overflowY: 'auto' } } }}>
      <Stack direction="row" sx={{ alignItems: 'center', height: 44, gap: '8px', flexShrink: 0 }}><Button aria-label="차트 상세 뒤로가기" onClick={() => closeDetail()} sx={{ minWidth: 28, fontSize: 24 }}>‹</Button><Typography sx={{ fontSize: 20, fontWeight: 600 }}>차트 상세 · {year}년</Typography></Stack>
      <AppCard sx={{ ...card, mt: '8px' }}><Typography sx={{ fontSize: 14, fontWeight: 600 }}>일별 평가금액 · 추이</Typography><Stack direction="row" spacing="8px"><Typography sx={{ ...small, color: colors.marketRise }}>● 평가금액</Typography><Typography sx={{ ...small, color: colors.marketFall }}>● 투자금</Typography></Stack>
      {detailPoints.length ? <InvestmentChart points={detailPoints} from={detailRange.from} to={detailRange.to} expanded /> : <Typography role="status">{status}</Typography>}
      <Stack direction="row" spacing="4px" sx={{ mt: '16px' }}>{quarters.map(value => <Button key={value} aria-pressed={detailQuarter === value} disabled={!quarterAvailable(year, value, today)} onClick={() => setDetailQuarter(value)} sx={{ flex: 1, minWidth: 0, height: 28, fontSize: 11, bgcolor: detailQuarter === value ? '#337DF5' : '#1A2433', color: detailQuarter === value ? 'white' : colors.textMuted }}>{value ? `${value}분기` : '전체'}</Button>)}</Stack></AppCard>
    </Dialog>
  </>;
}
