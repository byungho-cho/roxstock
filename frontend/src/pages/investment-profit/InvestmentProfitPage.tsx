import { storedQueryOptions } from '../../data/storedQueryOptions';
import { useDetailSwipe } from '../../hooks/useDetailSwipe';
import '../dashboard/home-font.css';
import { Box, Button, ButtonBase, Skeleton, Stack, Typography, useMediaQuery } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppCard } from '../../components/common/Common';
import { PageHeader } from '../../components/navigation/Navigation';
import { OverlayRegionScrollbar } from '../../components/navigation/OverlayRegionScrollbar';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { usePageMemory, useReturnNavigation } from '../../hooks/navigation/usePageMemory';
import { colors } from '../../styles/tokens';
import { seoulToday } from '../investment/investmentData';
import { amount, groups, loadProfit, rate, sortProfit, totals, won, type Group, type Totals } from './profitData';

const card = { border: 0, borderRadius: '8px', bgcolor: '#111927', p: '8px 15px', minWidth: 0, flexShrink: 0 };
const muted = { overflowWrap: 'anywhere', fontSize: 10, lineHeight: '14px', color: colors.textMuted };
const title = { fontSize: 12, fontWeight: 600, lineHeight: '24px' };
// A shared amount column keeps the summary percentage edge identical across tabs and details.
const annualColumns = '40px minmax(0, 1fr) minmax(60px, 21%) minmax(0, 34%)';
const columns = 'minmax(0, 1fr) 64px minmax(0, 40%)';
const color = (value: bigint | null) => value === null || value === 0n ? colors.textPrimary : value > 0n ? '#FB7185' : '#60A5FA';
type CompactRow = { id: string; label: string; value: bigint | null; cost?: bigint | null; middle?: string };
function Value({ value, signed = true }: { value: bigint | null; signed?: boolean }) {
  return <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: '20px', textAlign: 'right', color: signed ? color(value) : colors.textPrimary, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{won(value, signed)}</Typography>;
}
function Metric({ label, value, denominator }: { label: string; value: bigint | null; denominator?: bigint | null }) {
  return <Box data-testid="profit-metric" sx={{ display: 'grid', gridTemplateColumns: columns, alignItems: 'center', gap: '4px', minHeight: 24 }}><Typography sx={{ fontSize: 12, lineHeight: '20px' }}>{label}</Typography><Typography data-testid="profit-percent" sx={{ ...muted, fontSize: 12, textAlign: 'right', color: color(value) }}>{denominator !== undefined ? rate(value, denominator) : ''}</Typography><Value value={value} signed={!['매수총액','매도총액'].includes(label)} /></Box>;
}
function Compact({ heading, rows, toggle }: { heading: string; rows: CompactRow[]; toggle?: React.ReactNode }) {
  return <AppCard data-testid="profit-compact" sx={card}><Stack direction="row" sx={{alignItems:"center", justifyContent:"space-between"}}><Typography sx={title}>{heading}{toggle && <Box component="span" sx={muted}> · 총 {rows.length}개</Box>}</Typography>{toggle}</Stack>{rows.map(row => <Box key={row.id} data-testid="profit-compact-row" sx={{ display: 'grid', gridTemplateColumns: columns, gap: '4px', alignItems: 'center', minHeight: 24 }}><Typography sx={{ fontSize: 12, overflowWrap: 'anywhere' }}>{row.label}</Typography><Typography data-testid="profit-percent" sx={{ ...muted, fontSize: 12, textAlign: 'right', color: row.middle === '배당' ? '#FAC71F' : color(row.value) }}>{row.middle ?? (row.cost !== undefined ? rate(row.value, row.cost) : '')}</Typography><Value value={row.value} /></Box>)}</AppCard>;
}
function NeighborName({name}: {name: string}) {
  const measure = useRef<HTMLSpanElement>(null), [short, setShort] = useState(false);
  useLayoutEffect(() => {
    const node = measure.current, parent = node?.parentElement;
    if (!node || !parent) return;
    let alive = true;
    const update = () => { if (alive) setShort(node.getBoundingClientRect().width > parent.clientWidth); };
    const observer = new ResizeObserver(update); observer.observe(parent); update();
    void document.fonts.ready.then(update);
    return () => { alive = false; observer.disconnect(); };
  }, [name]);
  return <><Box component="span" ref={measure} aria-hidden sx={{position:'absolute',visibility:'hidden',width:'max-content',pointerEvents:'none'}}>{name}</Box>{short && Array.from(name).length > 5 ? Array.from(name).slice(0,5).join('') + '…' : name}</>;
}
export function InvestmentProfitPage() {
  const { accountId, accounts } = useActiveAccount(), tablet = useMediaQuery('(min-width:600px)');
  const navigate = useNavigate(), location = useLocation(), outerBack = useReturnNavigation('/assets');
  const [tab, setTab] = usePageMemory<'year' | 'stock'>('profit-tab', 'year');
  const [selectedYear, setYear] = usePageMemory('profit-year', String(Number(seoulToday().slice(0, 4))));
  const [selectedStock, setStock] = usePageMemory('profit-stock', '');
  const [ascending, setAscending] = usePageMemory('profit-sort-ascending', false);
  const toggle = <Button aria-label={ascending ? '손익액 내림차순 정렬' : '손익액 오름차순 정렬'} onClick={() => setAscending(!ascending)} sx={{minWidth:32,p:0,fontSize:11}}>{ascending ? '↑' : '↓'}</Button>;
  const left = useRef<HTMLDivElement>(null), right = useRef<HTMLDivElement>(null);
  const today = seoulToday(), currentYear = Number(today.slice(0, 4));
  const query = useQuery({ ...storedQueryOptions, queryKey: ['investment-profit', accountId, currentYear], queryFn: ({ signal }) => loadProfit(accountId!, today, signal), enabled: !!accountId, retry: false });
  const data = query.data, pending = accounts.isPending || (!!accountId && query.isPending), failed = accounts.isError || query.isError;
  const list = tab === 'year' ? data?.years ?? [] : sortProfit(data?.stocks ?? [], ascending);
  const capitalFor = (year: string) => data?.capital?.find(row => String(row.year) === year);
  const capitalAmount = (year: string) => amount(capitalFor(year)?.investmentAmount);
  const capital = capitalAmount(selectedYear);
  const selected = tab === 'year' ? selectedYear : list.some(row => row.id === selectedStock) ? selectedStock : list[0]?.id || '';
  const group: Group | undefined = list.find(row => row.id === selected);
  const detailOpen = new URLSearchParams(location.search).has('profitDetail');
  const state = { ...location.state, listEntryKey: location.state?.listEntryKey ?? location.key };
  const choose = (id: string) => {
    if (tab === 'year') setYear(id); else setStock(id);
    if (!tablet && !detailOpen) navigate(`${location.pathname}?profitDetail=${tab}`, { state });
  };
  const back = () => { if (!tablet && detailOpen) {
    if (location.state?.listEntryKey && Number(window.history.state?.idx) > 0) navigate(-1);
    else navigate(location.pathname, { replace: true, state });
  } else outerBack(); };
  const step = (direction: number) => {
    if (tab === 'year') { const next = Number(selected) + direction; setYear(String(next < 2010 ? currentYear : next > currentYear ? 2010 : next)); }
    else if (list.length) { const index = Math.max(0, list.findIndex(row => row.id === selected)); const target = list[index + direction]; if (target) setStock(target.id); }
  };
  const neighbor = (direction: number) => {
    if (tab === 'year') { const next = Number(selected) + direction; return String(next < 2010 ? currentYear : next > currentYear ? 2010 : next); }
    const index = Math.max(0, list.findIndex(row => row.id === selected)); return list[index + direction]?.label ?? '';
  };
  // All stock events and adjacent details are fetched in one account result; no per-swipe requests.
  const swipe = useDetailSwipe(step, tab === 'stock' && !!group);
  const retry = () => { if (accounts.isError) void accounts.refetch(); if (accountId) void query.refetch(); };
  const error = failed ? <AppCard sx={card}><Typography role="alert" sx={muted}>조회에 실패했습니다.{data ? ' 기존 데이터를 표시합니다.' : ''}</Typography><Button onClick={retry} sx={{ fontSize: 11, minHeight: 28 }}>재시도</Button></AppCard> : null;
  const loading = <AppCard sx={card}><Skeleton height={72} /></AppCard>;
  const empty = (detail = false) => <AppCard data-testid={detail ? 'profit-detail-empty' : 'profit-empty'} sx={{ ...card, height: 160, display: 'grid', placeItems: 'center' }}><Typography role="status" sx={{ fontSize: 14 }}>{detail ? '내역이 없습니다.' : '내용이 없습니다.'}</Typography></AppCard>;
  const listContent = <>
    <Stack data-testid="profit-tabs" direction="row" spacing="8px" sx={{ height: 32, flexShrink: 0 }}>{(['year', 'stock'] as const).map(value => <Button key={value} aria-pressed={tab === value} onClick={() => setTab(value)} sx={{ flex: 1, minWidth: 0, minHeight: 32, height: 32, p: 0, borderRadius: '10px', bgcolor: tab === value ? '#151E2F' : '#111927', color: tab === value ? '#FAC71F' : colors.textMuted, fontSize: 12, fontWeight: 600 }}>{value === 'year' ? '연도별' : '종목별'}</Button>)}</Stack>
    {error}
    {pending && !data ? loading : data?.events.length ? <>
      <AppCard data-testid="profit-cumulative" sx={{ ...card, p: '5px 15px 9px', minHeight: 72 }}>
        <Typography sx={{ ...muted, fontSize: 12, lineHeight: '18px' }}>누적 투자손익</Typography>
        <Typography data-testid="profit-total" sx={{ fontSize: 22, fontWeight: 700, lineHeight: '27px', textAlign: 'right', color: color(data.totals.total), overflowWrap: 'anywhere' }}>{won(data.totals.total, true)}</Typography>
        <Typography data-testid="profit-cumulative-rate" sx={{ ...muted, mt: '1px', lineHeight: '12px', fontWeight: 600, textAlign: 'right', color: color(data.totals.total) }}>누적 수익률 {rate(data.totals.total, data.totals.cost)}</Typography>
      </AppCard>
      <AppCard data-testid="profit-list" aria-label={`${tab === 'year' ? '연도별 손익' : '종목별 누적 손익'}, 총 ${list.length}개`} sx={card}>
        {tab === 'stock' && <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography sx={title}>종목별 누적 수익 <Box component="span" data-testid="profit-count" sx={muted}>총 {list.length}개</Box></Typography>{toggle}</Stack>}
        {tab === 'year' && <Box sx={{ display: 'grid', gridTemplateColumns: annualColumns, gap: '4px', alignItems: 'center', minHeight: 24, mb: '4px' }}>{['연도', '투자금', '손익률', '손익총액'].map((label, index) => <Typography key={label} sx={{ ...muted, fontSize: index ? 10 : 12, fontWeight: 500, textAlign: index ? 'right' : 'left' }}>{label}</Typography>)}</Box>}
        {list.map(row => <ButtonBase key={row.id} data-testid="profit-list-row" data-id={row.id} data-scroll-item={row.id} aria-pressed={selected === row.id} onClick={() => choose(row.id)} sx={{ display: 'grid', gridTemplateColumns: tab === 'year' ? annualColumns : columns, width: '100%', gap: '4px', alignItems: 'center', minHeight: tab === 'year' ? 28 : 24, textAlign: 'left', borderBottom: tab === 'year' ? '1px solid rgba(37,50,71,0.75)' : 0, '&:last-child': { borderBottom: 0 }, bgcolor: tablet && selected === row.id ? '#151E2F' : undefined }}><Typography sx={{ fontSize: 12, fontWeight: tab === 'year' ? 600 : 400, overflowWrap: 'anywhere' }}>{row.label}</Typography>{tab === 'year' && <Typography sx={{ fontSize: 10, textAlign: 'right', overflowWrap: 'anywhere' }}>{capitalAmount(row.id) === null ? '미수집' : won(capitalAmount(row.id))}</Typography>}<Typography data-testid="profit-list-rate" sx={{ ...muted, textAlign: 'right', color: color(row.totals.total) }}>{rate(row.totals.total, tab === 'year' ? capitalAmount(row.id) : row.totals.buy)}</Typography><Typography sx={{ fontSize: tab === 'year' ? 10 : 13, fontWeight: 600, textAlign: 'right', color: color(row.totals.total), overflowWrap: 'anywhere' }}>{won(row.totals.total, true)}</Typography></ButtonBase>)}
      </AppCard>
    </> : !failed ? empty() : null}
  </>;
  const nav = <Box data-testid="profit-navigation" sx={{ display: 'grid', gridTemplateColumns: '74px minmax(0, 1fr) 74px', alignItems: 'center', minHeight: 32, flexShrink: 0 }}><ButtonBase aria-label={`이전 상세 ${neighbor(-1)}`} disabled={tab === 'stock' && !neighbor(-1)} onClick={() => step(-1)} sx={{ ...muted, fontSize: 12, minHeight: 32, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><NeighborName name={neighbor(-1)}/></ButtonBase><Typography data-testid="profit-selected" sx={{ textAlign: 'center', fontSize: 18, fontWeight: 700, lineHeight: '24px', overflowWrap: 'anywhere' }}>{tab === 'year' ? `${selected}년` : group?.label ?? '—'}</Typography><ButtonBase aria-label={`다음 상세 ${neighbor(1)}`} disabled={tab === 'stock' && !neighbor(1)} onClick={() => step(1)} sx={{ ...muted, fontSize: 12, minHeight: 32, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}><NeighborName name={neighbor(1)}/></ButtonBase></Box>;
  const summary = (t: Totals) => <AppCard data-testid="profit-detail-summary" sx={{ ...card, py: tab === 'year' ? '2px' : '8px' }}>{tab === 'stock' && <Typography sx={title}>전체 거래 요약</Typography>}{tab === 'year' ? <><Metric label="투자금" value={capital} /><Typography data-testid="profit-capital-asof" sx={muted}>기준일: {capitalFor(selected)?.date ?? '미수집'}{capital === null ? ' · 연말/유효 투자금 스냅샷 미수집' : ''}</Typography><Metric label="손익총액" value={t.trading} denominator={tab === 'year' ? capital : t.buy} /><Metric label="배당" value={t.dividend} denominator={tab === 'year' ? capital : t.buy} /><Metric label="배당포함" value={t.total} denominator={tab === 'year' ? capital : t.buy} /></> : <><Metric label="매수총액" value={t.buy} /><Metric label="매도총액" value={t.sell} /><Metric label="매매손익" value={t.trading} denominator={t.buy} /><Metric label="배당포함 총손익" value={t.total} denominator={t.buy} /></>}</AppCard>;
  const detailContent = pending && !data ? loading : !data && failed ? error : !group?.events.length && tablet ? empty(true) : <>{!tablet && error}{nav}{!group?.events.length ? empty() : <>{summary(group.totals)}{tab === 'year' ? <Compact heading="종목별 손익" toggle={toggle} rows={sortProfit(groups(group.events, 'stock'), ascending).map(row => ({ id: row.id, label: row.label, value: row.totals.total }))} /> : <Compact heading="연도별 손익" rows={groups(group.events, 'year').map(row => ({ id: row.id, label: row.label, value: row.totals.total, cost: row.totals.cost }))} />}
    <Compact heading={tab === 'year' ? '월별 손익' : '월별 손익 · 배당 내역'} rows={groups(group.events, 'month').flatMap<CompactRow>(row => tab === 'year' ? [{ id: row.id, label: `${Number(row.id.slice(5))}월`, value: row.totals.total, cost: row.totals.cost }] : [
      ...(row.events.some(event => event.kind === 'SELL') ? [{ id: row.id + '-trade', label: `${row.id.slice(0, 4)}.${row.id.slice(5)}`, value: totals(row.events.filter(event => event.kind === 'SELL')).trading, middle: '매매' }] : []),
      ...(row.events.some(event => event.kind === 'DIVIDEND') ? [{ id: row.id + '-dividend', label: `${row.id.slice(0, 4)}.${row.id.slice(5)}`, value: totals(row.events.filter(event => event.kind === 'DIVIDEND')).dividend, middle: '배당' }] : []),
    ])} /></>}</>;
  return <><PageHeader title="투자손익" variant="detail" onBack={back} showAdd={false} embedded assetOverview backIcon={<Box component="span" sx={{ fontSize: 28 }}>‹</Box>} />
    <Box className="rox-home" data-testid="profit-page" data-screen-id={tablet ? 'T1600' : 'C1600'} data-restoration-ready={!pending} data-list-condition={tablet ? tab : detailOpen ? `${tab}:${selected}` : tab} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: '8px', height: { sm: '100%' }, minHeight: 0 }}>
      {(tablet || !detailOpen) && <Stack ref={left} data-scroll-region="profit-left" data-list-condition={tab} useFlexGap spacing="8px" sx={{ touchAction: 'pan-y', minWidth: 0, minHeight: 0, overflowY: { xs: 'visible', sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, pb: { sm: '80px' } }}>{listContent}</Stack>}
      {(tablet || detailOpen) && <Stack ref={right} data-testid="profit-detail" {...swipe} data-scroll-region="profit-right" data-list-condition={`${tab}:${selected}`} useFlexGap spacing="8px" sx={{ touchAction: 'pan-y', minWidth: 0, minHeight: 0, overflowY: { xs: 'visible', sm: 'auto' }, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, pb: { sm: '80px' } }}>{detailContent}</Stack>}
    </Box>{tablet && <><OverlayRegionScrollbar scrollRef={left} label="투자손익 목록 스크롤" offset={0} /><OverlayRegionScrollbar scrollRef={right} label="투자손익 상세 스크롤" offset={0} /></>}
  </>;
}
