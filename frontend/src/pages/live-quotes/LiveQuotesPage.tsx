import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Snackbar, TextField, Typography } from '@mui/material';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/navigation/Navigation';
import { HeaderAddButton } from '../../components/navigation/HeaderAddButton';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { useAuth } from '../../auth/AuthGate';
import { apiRequest } from '../../data/apiClient';
import { colors } from '../../styles/tokens';
import { orderStocks, reorderVisible, type DisplayStock, type LiveQuote, type QuoteMarket, type QuoteSort } from '../../../../shared/src/domain/live-quotes';
type List = {
    ids: string[];
    version: string;
    stocks: DisplayStock[];
};
type QuoteRow = {
    symbol: string;
    status: string;
    quote: LiveQuote | null;
};
type Packet = {
    connection: string;
    limit: number;
    active: number;
    quotes: QuoteRow[];
};
const markets = { TOTAL: '통합', NXT: 'NXT', KRX: 'KRX' };
const sorts: {
    value: QuoteSort;
    label: string;
}[] = [{ value: 'manual', label: '직접설정순' }, { value: 'name', label: '종목명순' }, { value: 'price', label: '주가금액순' }, { value: 'rate', label: '등락률순' }, { value: 'holding', label: '보유금액순' }, { value: 'profit', label: '보유손익순' }];
const statusText: Record<string, string> = { IDLE: '표시 종목 추가 후 연결', QUOTE_DELAYED: '지연 시세', CONNECTED: '연결됨', LIVE: '실시간', CACHE: '저장 시세', WAITING_TRADE: '체결 수신 대기', NO_RECENT_TRADE: '최근 체결 없음', RECONNECTING: '재연결 중', CONNECTING: '연결 중', DISCONNECTED: '연결 끊김', MARKET_CLOSED: '장 운영시간 외', TRADING_HALTED: '거래정지', MARKET_UNSUPPORTED: '시장 미지원', SUBSCRIPTION_REJECTED: '구독 거절 · 제공처 확인 필요', LIMIT_EXCEEDED: '구독 한도 초과', NOT_CONFIGURED: '연결 설정 확인 필요', DISABLED: '실시간 수신 중지', SESSION_IN_USE: '다른 서버 연결 사용 중' };
const color = (n: number) => n > 0 ? colors.marketRise : n < 0 ? colors.marketFall : colors.marketFlat;
const number = (n: number | undefined) => n === undefined ? '—' : n.toLocaleString('ko-KR');
const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i]);
const selectStyle = { background: 'transparent', border: 0, color: colors.textMuted, fontSize: 12, padding: 0, maxWidth: '100%' };
function useQuoteStream(market: QuoteMarket, symbols: string[], identity: string) {
    const key = symbols.join(','), scope = market + ':' + identity + ':' + key;
    const empty = { connection: key ? 'CONNECTING' : 'IDLE', active: 0, limit: 41, quotes: [] };
    const [packet, setPacket] = useState<Packet & {
        scope: string;
    }>({ ...empty, scope });
    useEffect(() => {
        let alive = true;
        setPacket({ ...empty, scope });
        if (!key)
            return;
        const stream = new EventSource(`/api/live-quotes/stream?market=${market}`, { withCredentials: true });
        stream.addEventListener('quotes', event => { if (!alive)
            return; try {
            const next = JSON.parse((event as MessageEvent).data) as Packet;
            if (next.quotes.every(r => !r.quote || r.quote.market === market))
                setPacket({ ...next, scope });
        }
        catch {
            setPacket(p => ({ ...p, connection: 'DISCONNECTED' }));
        } });
        stream.onerror = () => { if (alive)
            setPacket(p => ({ ...p, connection: 'RECONNECTING', quotes: p.quotes.map(r => ({ ...r, status: 'RECONNECTING' })) })); };
        return () => { alive = false; stream.close(); };
    }, [market, key, identity]);
    return packet.scope === scope ? packet : empty;
}
const QuoteCard = memo(function QuoteCard({ stock, row, dragged, onOpen, onDown, onMove, onUp, onCancel, onRemove }: {
    stock: DisplayStock;
    row: QuoteRow;
    dragged: boolean;
    onOpen: () => void;
    onDown: (event: React.PointerEvent) => void;
    onMove: (event: React.PointerEvent) => void;
    onUp: () => void;
    onCancel: () => void;
    onRemove: () => void;
}) {
    const q = row.quote, c = q ? color(q.change) : colors.textMuted;
    const asOf = q ? (q.source === 'CACHE' ? '조회/저장 ' : '체결 ') + new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(q.observedAt)) : '';
    return <Box data-quote-id={stock.id} data-no-pull-refresh role="button" tabIndex={0} aria-label={`${stock.name} ${number(q?.price)} ${statusText[row.status] ?? row.status}`} onContextMenu={e => e.preventDefault()} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter')
        onOpen(); }} sx={{ position: 'relative', minWidth: 0, height: 96, boxSizing: 'border-box', px: '12px', py: '10px', bgcolor: colors.surface, border: `0.5px solid ${dragged ? colors.focus : colors.border}`, outline: dragged ? `2px dashed ${colors.focus}` : undefined, opacity: dragged ? .7 : 1, userSelect: 'none', WebkitTouchCallout: 'none' }}>
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 20, gap: '4px' }}><Box sx={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: '5px' }}><Typography noWrap title={`${stock.name}(${stock.symbol})`} sx={{ fontSize: 14, fontWeight: 600 }}>{stock.name}</Typography>{stock.held && <img src="/live-quotes/holding.svg" alt="보유" width={12} height={12}/>}</Box><Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}><img src="/live-quotes/bell.svg" alt="알림 기능 준비 중" width={16} height={16}/><IconButton aria-label={`${stock.name} 표시 제거`} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); onRemove(); }} sx={{ p: 0, ml: '5px', height: 20, width: 14, fontSize: 14, color: colors.textMuted }}>×</IconButton></Box></Box>
  <Typography data-testid="live-price" sx={{ fontSize: 22, lineHeight: '28px', fontWeight: 600, color: c, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{number(q?.price)}</Typography>
  <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, lineHeight: '18px', fontVariantNumeric: 'tabular-nums', color: c }}><span>{q ? `${q.change > 0 ? '▲' : q.change < 0 ? '▼' : '—'} ${Math.abs(q.rate).toFixed(2)}%` : '—'}</span><span>{q ? number(Math.abs(q.change)) : '—'}</span></Box>
  <Box title={`${statusText[row.status] ?? row.status} · ${asOf}`} sx={{ fontSize: 8, lineHeight: '10px', color: row.status === 'LIVE' ? colors.textMuted : colors.warning, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.status === 'LIVE' ? asOf : statusText[row.status] ?? row.status}</Box>
 </Box>;
});
export function LiveQuotesPage() {
    const navigate = useNavigate(), location = useLocation(), { user } = useAuth(), { accountId, accounts } = useActiveAccount(), client = useQueryClient();
    const [market, setMarket] = useState<QuoteMarket>('TOTAL'), [filter, setFilter] = useState('all'), [sort, setSort] = useState<QuoteSort>('manual');
    const [draft, setDraft] = useState<string[] | null>(null), [base, setBase] = useState<{
        ids: string[];
        version: string;
    } | null>(null), [saving, setSaving] = useState(false), [toast, setToast] = useState(''), [error, setError] = useState(''), [dragId, setDragId] = useState<string | null>(null);
    const localOrder = useRef<{
        accountId: string | undefined;
        ids: string[];
        version: string;
    } | null>(null), busy = useRef(false), gesture = useRef<{
        id: string;
        x: number;
        y: number;
        timer: ReturnType<typeof setTimeout>;
        armed: boolean;
        last?: string;
    } | null>(null), suppressClick = useRef(false);
    const queryKey = ['live-quote-list', user?.id, accountId];
    const query = useQuery({ queryKey, enabled: !accounts.isPending, queryFn: ({ signal }) => apiRequest<List>(`/live-quotes/list${accountId ? '?accountId=' + accountId : ''}`, { signal }), staleTime: Infinity, refetchOnWindowFocus: false, refetchOnReconnect: false });
    const list = query.data, order = draft ?? list?.ids ?? [], dirty = !!draft && !!base && !same(draft, base.ids), dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;
    const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.key !== nextLocation.key);
    const symbols = useMemo(() => list?.stocks.map(s => s.symbol) ?? [], [list?.stocks]);
    const packet = useQuoteStream(market, symbols, user?.id ?? '');
    const live = useMemo(() => Object.fromEntries(packet.quotes.filter(r => r.quote).map(r => [r.symbol, r.quote!])), [packet]);
    const allRows = list?.stocks ?? [];
    const candidates = allRows.filter(s => filter === 'all' || filter === 'holding' && s.held || filter === 'watch' && s.watched || filter === 'trade' && s.traded);
    const frozen = useRef<DisplayStock[] | null>(null), [pointerHold,setPointerHold]=useState(false),releaseHold=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
    // A KRX cache must not determine TOTAL/NXT price or holding-value sorting.
    const sorted = orderStocks(candidates.map(s => market === 'KRX' ? s : { ...s, initial: null, marketValue: null, profit: null }), order, sort, live);
    const rows = dragId && frozen.current ? frozen.current.map(s => allRows.find(r => r.id === s.id) ?? s).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)) : pointerHold&&frozen.current?frozen.current:sorted;
    const visibleIds = useRef<string[]>([]);
    visibleIds.current = rows.map(r => r.id);
    const orderRef = useRef(order);
    orderRef.current = order;
    const discard = () => { setDraft(null); setBase(null); setToast('순서 변경을 취소했습니다.'); };
    const confirmDiscard = () => !dirty || window.confirm('저장하지 않은 순서가 있습니다. 변경을 취소할까요?');
    useEffect(() => { const handler = (event: BeforeUnloadEvent) => { if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = '';
    } }; window.addEventListener('beforeunload', handler); return () => window.removeEventListener('beforeunload', handler); }, []);
    useEffect(() => { if (!draft)
        return; localOrder.current = { accountId: base ? localOrder.current?.accountId : accountId, ids: draft, version: base?.version ?? '' }; }, [draft, base, accountId]);
    useEffect(() => { if (dirty && base && localOrder.current?.accountId !== accountId) {
        setError('계좌가 변경됐습니다. 기존 편집 순서는 유지되며 취소하거나 저장할 수 있습니다.');
    } }, [accountId, dirty, base]);
    useEffect(() => { const move = (e: TouchEvent) => { if (gesture.current?.armed)
        e.preventDefault(); }; document.addEventListener('touchmove', move, { passive: false }); return () => document.removeEventListener('touchmove', move); }, []);
    useEffect(() => { if (!dragId)
        return; const timer = setInterval(() => { const g = gesture.current, main = document.querySelector('main'); if (!g || !main)
        return; const box = main.getBoundingClientRect(); if (g.y < box.top + 35)
        main.scrollBy(0, -8);
    else if (g.y > box.bottom - 35)
        main.scrollBy(0, 8); }, 16); return () => clearInterval(timer); }, [dragId]);
    useEffect(() => () => {clearTimeout(releaseHold.current);if (gesture.current)
        clearTimeout(gesture.current.timer); }, []);
    const save = async (next = order, version = base?.version ?? list?.version) => { if (busy.current || !version)
        return; busy.current = true; setSaving(true); setError(''); try {
        const saved = await apiRequest<{
            ids: string[];
            version: string;
        }>('/live-quotes/list', { method: 'PUT', body: JSON.stringify({ ids: next, version }) });
        setDraft(null);
        setBase(null);
        client.setQueryData(queryKey, (old: List | undefined) => old ? { ...old, ...saved, stocks: old.stocks.filter(s => saved.ids.includes(s.id)) } : old);
        setToast('저장했습니다.');
        await client.invalidateQueries({ queryKey: ['live-quote-list'] });
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        busy.current = false;
        setSaving(false);
    } };
    const end = () => { if (gesture.current) {
        clearTimeout(gesture.current.timer);
        if (gesture.current.armed) {
            suppressClick.current = true;
            setTimeout(() => { suppressClick.current = false; }, 250);
        }
        gesture.current = null;
    } setDragId(null);clearTimeout(releaseHold.current);releaseHold.current=setTimeout(()=>{setPointerHold(false);frozen.current=null;},200); };
    const down = (id: string, e: React.PointerEvent) => {clearTimeout(releaseHold.current);frozen.current=sorted;setPointerHold(true);if (sort !== 'manual' || saving || e.button !== 0)
        return; const el = e.currentTarget as HTMLElement; const g = { id, x: e.clientX, y: e.clientY, armed: false, timer: setTimeout(() => { g.armed = true; frozen.current = sorted; setDragId(id); el.setPointerCapture(e.pointerId); }, 500) }; gesture.current = g; };
    const move = (e: React.PointerEvent) => { const g = gesture.current; if (!g)
        return; if (!g.armed) {
        if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8)
            end();
        return;
    } g.y = e.clientY; e.preventDefault(); const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-quote-id]')?.getAttribute('data-quote-id'); if (!target || target === g.id || target === g.last)
        return; g.last = target; if (!base) {
        setBase({ ids: list!.ids, version: list!.version });
        localOrder.current = { accountId, ids: list!.ids, version: list!.version };
    } const next = reorderVisible(orderRef.current, visibleIds.current, g.id, target); setDraft(next); };
    const remove = (stock: DisplayStock) => { if (dirty) {
        setError('순서 변경을 저장하거나 취소한 뒤 표시 종목을 제거해 주세요.');
        return;
    } if (window.confirm(`${stock.name}을 표시 목록에서 제거할까요? 투자 기록은 유지됩니다.`))
        void save(order.filter(id => id !== stock.id), list?.version); };
    return <Box data-live-root sx={{ pb: '80px', bgcolor: colors.surface, minHeight: '100%' }}><PageHeader title={<span style={{ fontSize: 16 }}>실시간 주가</span>} embedded showAdd={false} centerMobile center={dirty ? <Box sx={{ display: 'flex', gap: '8px' }}><IconButton disabled={saving} aria-label="순서 변경 취소" onClick={discard} sx={{ p: 0, width: 32, height: 32, bgcolor: colors.raised }}><img src="/live-quotes/cancel.svg" alt=""/></IconButton><IconButton disabled={saving} aria-label="순서 저장" onClick={() => void save()} sx={{ p: 0, width: 32, height: 32 }}><img src="/live-quotes/save.svg" alt=""/></IconButton></Box> : undefined} action={<HeaderAddButton label="표시 종목 추가" onClick={() => navigate('/live-quotes/add', { state: { from: location.pathname } })} mobileVisible/>}/>
  <Box sx={{ display: 'flex', position: 'sticky', top: 0, zIndex: 2, bgcolor: colors.surface, height: 40, px: '12px', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${colors.border}` }}><select aria-label="시세 시장" value={market} onChange={e => { if (!dragId)
        setMarket(e.target.value as QuoteMarket); }} style={{ ...selectStyle, color: colors.textPrimary, fontWeight: 600, fontSize: 14 }}>{Object.entries(markets).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="표시 종목 필터" value={filter} onChange={e => { if (!dragId)
        setFilter(e.target.value); }} style={selectStyle}>{[['all', '전체'], ['holding', '보유'], ['watch', '관심'], ['trade', '거래']].map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="시세 정렬" value={sort} onChange={e => { if (confirmDiscard()) {
        setDraft(null);
        setBase(null);
        setSort(e.target.value as QuoteSort);
    } }} style={selectStyle}>{sorts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select></Box>
  {query.isPending ? <Box sx={{ display: 'grid', placeItems: 'center', height: 160 }}><CircularProgress size={24} aria-label="표시 종목 불러오는 중"/></Box> : query.isError ? <Box role="alert" sx={{ p: 2 }}><Typography>표시 종목 조회에 실패했습니다.</Typography><Button onClick={() => void query.refetch()}>재시도</Button></Box> : <><Box sx={{ fontSize: 10, color: colors.textMuted, px: '12px', py: '4px' }}>{statusText[packet.connection] ?? packet.connection} · {rows.length}종목 · 공유 구독 {packet.active}/{packet.limit}{accounts.isError ? ' · 계좌 조회 확인 필요' : ''}</Box><Box data-testid="live-grid" sx={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>{rows.map(stock => { const data = packet.quotes.find(r => r.symbol === stock.symbol); const initial = market === 'KRX' ? stock.initial : null; const row = data ? { ...data, quote: data.quote ?? initial } : { symbol: stock.symbol, status: packet.connection, quote: initial }; return <QuoteCard key={stock.id} stock={stock} row={row} dragged={stock.id === dragId} onOpen={() => { if (!suppressClick.current)
        navigate(`/stocks/${stock.id}?detailTab=summary`); }} onDown={e => down(stock.id, e)} onMove={move} onUp={end} onCancel={end} onRemove={() => remove(stock)}/>; })}</Box>{rows.length === 0 && <Box sx={{ textAlign: 'center', py: '40px', fontSize: 12, color: colors.textMuted }}>표시할 종목이 없습니다.<Button onClick={() => navigate('/live-quotes/add')} sx={{ display: 'block', mx: 'auto' }}>종목 추가</Button></Box>}</>}
  {dirty && base && list && base.version !== list.version && <Button onClick={() => { const current = new Set(list.ids), edited = draft!.filter(id => current.has(id)), known = new Set(edited); let i = 0; setDraft(list.ids.map(id => known.has(id) ? edited[i++]! : id)); setBase({ ids: list.ids, version: list.version }); setError('최신 추가·제거를 유지하며 편집 순서를 병합했습니다. 확인 후 저장해 주세요.'); }}>최신 목록과 병합</Button>}{error && <Box role="alert" sx={{ p: '12px', color: colors.warning, fontSize: 12 }}>{error}<Button onClick={() => void query.refetch()}>최신 목록 확인</Button></Box>}
  <Dialog open={blocker.state === 'blocked'}><DialogTitle>변경한 순서가 있습니다.</DialogTitle><DialogContent>저장하거나 취소한 뒤 이동해 주세요.</DialogContent><DialogActions><Button onClick={() => blocker.state === 'blocked' && blocker.reset()}>계속 편집</Button><Button onClick={() => { setDraft(null); setBase(null); if (blocker.state === 'blocked')
        blocker.proceed(); }}>변경 취소 후 이동</Button></DialogActions></Dialog>
  <Snackbar open={!!toast} autoHideDuration={2500} onClose={() => setToast('')} message={toast}/>
 </Box>;
}
export function LiveQuoteAddPage() {
    const navigate = useNavigate(), { user } = useAuth(), { accountId } = useActiveAccount(), client = useQueryClient();
    const [tab, setTab] = useState('search'), [search, setSearch] = useState(''), [term, setTerm] = useState(''), [selected, setSelected] = useState<string[]>([]), [saving, setSaving] = useState(false), [error, setError] = useState('');
    const busy = useRef(false);
    useEffect(() => { const timer = setTimeout(() => setTerm(search), 250); return () => clearTimeout(timer); }, [search]);
    const query = useQuery({ queryKey: ['live-quote-candidates', user?.id, accountId, tab, term], queryFn: ({ signal }) => apiRequest<List>(`/live-quotes/candidates?tab=${tab}&q=${encodeURIComponent(term)}${accountId ? '&accountId=' + accountId : ''}`, { signal }), staleTime: 30000, refetchOnWindowFocus: false });
    const data = query.data, registered = new Set(data?.ids ?? []), rows = data?.stocks ?? [], available = rows.filter(s => !registered.has(s.id));
    const toggle = (id: string) => setSelected(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
    const add = async (ids = selected) => { if (busy.current || !data || !ids.length)
        return; busy.current = true; setSaving(true); setError(''); try {
        const fresh = await apiRequest<List>('/live-quotes/list');
        if (fresh.version !== data.version)
            throw Error('다른 화면에서 목록이 변경됐습니다. 최신 목록 확인 후 다시 추가해 주세요.');
        await apiRequest('/live-quotes/list', { method: 'PUT', body: JSON.stringify({ version: data.version, ids: [...new Set([...data.ids, ...ids])] }) });
        await client.invalidateQueries({ queryKey: ['live-quote-list'] });
        await client.invalidateQueries({ queryKey: ['live-quote-candidates'] });
        navigate('/live-quotes');
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        busy.current = false;
        setSaving(false);
    } };
    return <Box sx={{ bgcolor: colors.surface, p: '0 12px 80px', minHeight: '100%' }}><PageHeader title={<span style={{ fontSize: 16 }}>표시 종목 추가</span>} embedded showAdd={false} showBack showBackTablet backPath="/live-quotes" action={<Button disabled={saving} onClick={() => navigate('/live-quotes')} sx={{ fontSize: 12, color: colors.textPrimary }}>취소</Button>}/><TextField fullWidth variant="standard" placeholder="종목명 또는 종목코드 검색" value={search} onChange={e => setSearch(e.target.value)} slotProps={{ htmlInput: { 'aria-label': '표시 종목 검색' } }} sx={{ height: 44, justifyContent: 'center', '& input': { fontSize: 12 } }}/><Box sx={{ display: 'flex', justifyContent: 'space-between', height: 40 }}>{[['search', '검색'], ['holding', '보유'], ['watch', '관심'], ['trade', '거래']].map(([key, label]) => <Button key={key} onClick={() => setTab(key)} sx={{ p: 0, minWidth: 0, fontSize: 12, color: tab === key ? colors.warning : colors.textMuted }}>{label}</Button>)}</Box>
 <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 32, fontSize: 12 }}><Box component="label"><Checkbox size="small" disabled={!available.length || saving || query.isFetching || search !== term} checked={!!available.length && available.every(s => selected.includes(s.id))} onChange={(_, checked) => setSelected(old => checked ? [...new Set([...old, ...available.map(s => s.id)])] : old.filter(id => !available.some(s => s.id === id)))} sx={{ p: 0, mr: '4px' }}/>전체 선택</Box><Button disabled={saving || query.isFetching || search !== term || !available.length} onClick={() => void add(available.map(s => s.id))} sx={{ p: 0, minWidth: 0, fontSize: 12 }}>미등록 전체 추가</Button></Box>
 {query.isPending ? <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress size={24}/></Box> : query.isError ? <Box role="alert">조회에 실패했습니다.<Button onClick={() => void query.refetch()}>재시도</Button></Box> : rows.map(s => <Box key={s.id} component="label" sx={{ display: 'flex', alignItems: 'center', minHeight: 48, gap: '8px' }}><Checkbox size="small" checked={registered.has(s.id) || selected.includes(s.id)} disabled={registered.has(s.id) || saving} onChange={() => toggle(s.id)} sx={{ p: 0, color: colors.warning, '&.Mui-checked': { color: colors.warning } }}/><Box sx={{ flex: 1, minWidth: 0 }}><Typography noWrap title={s.name} sx={{ fontSize: 12 }}>{s.name}</Typography><Typography sx={{ fontSize: 10, color: colors.textMuted }}>{s.symbol}</Typography></Box><Typography sx={{ fontSize: 10, color: colors.textMuted }}>{registered.has(s.id) ? '추가됨' : [s.held ? '보유' : '', s.watched ? '관심' : '', s.traded ? '거래' : ''].filter(Boolean).join(' · ')}</Typography></Box>)}
 {!query.isPending && !query.isError && !rows.length && <Typography sx={{ textAlign: 'center', py: 4, fontSize: 12 }}>검색 결과가 없습니다.</Typography>}
 <Typography sx={{ fontSize: 10, color: colors.textMuted, mt: '24px' }}>시세 표시 목록에만 추가됩니다.</Typography>{error && <Box role="alert" sx={{ fontSize: 12, color: colors.warning }}>{error}<Button onClick={() => void query.refetch()}>최신 목록 확인</Button></Box>}<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: '24px', fontSize: 12 }}><span>{selected.filter(id => !registered.has(id)).length}개 선택</span><Button disabled={saving || !selected.length || query.isFetching || search !== term} onClick={() => void add()} sx={{ fontSize: 12, color: colors.warning }}>선택한 {selected.filter(id => !registered.has(id)).length}개 추가</Button></Box>
 </Box>;
}
