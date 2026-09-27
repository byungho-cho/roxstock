import { SearchRounded } from '@mui/icons-material';
import { Box, Button, Card, CardContent, Chip, InputBase, Stack, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FormTextField } from '../../components/forms/Fields';
import { PageHeader } from '../../components/navigation/Navigation';
import { stockItems } from '../../data/mockData';
import { colors } from '../../styles/tokens';
import type { StockItem, StockListType } from '../../types/models';

const categories: Array<{ value: StockListType; label: string }> = [
  { value: 'watchlist', label: '관심종목' }, { value: 'holding', label: '보유종목' }, { value: 'recommended', label: '추천종목' },
];
const isListType = (value: string | null): value is StockListType => value === 'watchlist' || value === 'holding' || value === 'recommended';

export function StockAddPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const requestedType = params.get('type');
  const [category, setCategory] = useState<StockListType>(isListType(requestedType) ? requestedType : 'watchlist');
  const [query, setQuery] = useState('');
  const [market, setMarket] = useState('전체');
  const [direct, setDirect] = useState(false);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const symbolRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return [];
    const unique = new Map<string, StockItem>();
    stockItems.forEach((stock) => {
      if ((stock.name.toLowerCase().includes(keyword) || stock.symbol.includes(keyword)) && !unique.has(stock.symbol)) unique.set(stock.symbol, stock);
    });
    return [...unique.values()].slice(0, 6);
  }, [query]);

  const finish = async () => {
    await queryClient.invalidateQueries({ queryKey: ['stocks'] });
    navigate(`/stocks?tab=${category}`);
  };
  const addExisting = async (source: StockItem) => {
    if (stockItems.some((stock) => stock.symbol === source.symbol && stock.listType === category)) {
      setMessage(`이미 ${categories.find((item) => item.value === category)?.label}에 등록된 종목입니다.`);
      return;
    }
    stockItems.push({ ...source, id: `${source.symbol}-${category}-${Date.now()}`, listType: category });
    await finish();
  };
  const addDirect = async () => {
    const normalizedName = name.trim();
    const normalizedSymbol = symbol.replace(/[^0-9]/g, '').slice(0, 6);
    if (!normalizedName || normalizedSymbol.length !== 6) { setMessage('종목명과 6자리 종목코드를 입력해 주세요.'); return; }
    if (stockItems.some((stock) => stock.symbol === normalizedSymbol && stock.listType === category)) { setMessage('선택한 분류에 같은 종목코드가 이미 등록되어 있습니다.'); return; }
    stockItems.push({ id: `${normalizedSymbol}-${category}-${Date.now()}`, symbol: normalizedSymbol, name: normalizedName, listType: category, currentPrice: 0, priceChangeRate: 0, collectionStatus: 'partial' });
    await finish();
  };

  return <Stack spacing="12px">
    <PageHeader title="종목 추가" onBack={() => navigate(-1)} showBackTablet showAdd={false} embedded />
    <Stack direction="row" spacing={1}>{categories.map((item) => <Chip key={item.value} label={item.label} onClick={() => { setCategory(item.value); setMessage(''); }} sx={{ flex: 1, height: 32, bgcolor: category === item.value ? colors.buttonPrimary : colors.surface, color: category === item.value ? '#fff' : colors.textMuted }} />)}</Stack>
    {!direct ? <>
      <Box sx={{ height: 48, display: 'flex', alignItems: 'center', gap: 1, px: 1.75, bgcolor: colors.raised, border: `1px solid ${colors.borderStrong}`, borderRadius: '12px' }}><SearchRounded sx={{ fontSize: 17, color: colors.textMuted }} /><InputBase autoFocus inputProps={{ 'data-initial-focus': 'true', enterKeyHint: 'done' }} value={query} onChange={(event) => { setQuery(event.target.value); setMessage(''); }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); (event.target as HTMLElement).blur(); } }} placeholder="종목명·종목코드 검색" sx={{ flex: 1, fontSize: 13 }} /></Box>
      <Stack direction="row" spacing={1}>{['전체', '코스피', '코스닥'].map((value) => <Chip key={value} label={value} onClick={() => setMarket(value)} sx={{ height: 30, minWidth: value === '전체' ? 68 : 78, bgcolor: market === value ? colors.buttonPrimary : '#0F172A', color: market === value ? '#fff' : colors.textMuted }} />)}</Stack>
      {results.length === 0 ? <Card sx={{ height: 180, borderRadius: '14px' }}><CardContent sx={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center' }}><Box><SearchRounded sx={{ fontSize: 30, color: colors.textMuted }} /><Typography sx={{ mt: 1, fontSize: 15, fontWeight: 600 }}>코스피·코스닥 전체 종목 검색</Typography><Typography sx={{ mt: 1, fontSize: 12, color: colors.textMuted }}>종목명 또는 종목코드를 입력해 주세요.</Typography></Box></CardContent></Card> : <Stack spacing={1}>{results.map((stock) => <Card key={stock.symbol}><CardContent sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.25, '&:last-child': { pb: 1.25 } }}><Box><Typography sx={{ fontWeight: 600 }}>{stock.name}</Typography><Typography sx={{ fontSize: 11, color: colors.textMuted }}>A{stock.symbol} · 코스피</Typography></Box><Button variant="outlined" onClick={() => void addExisting(stock)}>+ 추가</Button></CardContent></Card>)}</Stack>}
      <Card sx={{ height: 46, borderRadius: '12px' }}><CardContent sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0, px: 1.5, '&:last-child': { pb: 0 } }}><Typography sx={{ fontSize: 12, color: colors.textMuted }}>검색되지 않는 종목인가요?</Typography><Button onClick={() => { flushSync(() => { setDirect(true); setMessage(''); }); document.querySelector<HTMLInputElement>('[data-initial-focus="true"]')?.focus({ preventScroll: true }); }} sx={{ fontSize: 12 }}>직접 추가 ›</Button></CardContent></Card>
    </> : <Card sx={{ borderRadius: '12px' }}><CardContent><Stack spacing={1.5}><Typography sx={{ fontSize: 15, fontWeight: 700 }}>종목 직접 추가</Typography><FormTextField label="종목명" value={name} onChange={setName} autoFocus enterKeyHint="next" onEnter={() => symbolRef.current?.focus()} /><FormTextField label="종목코드" value={symbol} onChange={(value) => setSymbol(value.replace(/[^0-9]/g, '').slice(0, 6))} inputRef={symbolRef} enterKeyHint="done" onEnter={() => void addDirect()} /><Stack direction="row" spacing={1}><Button fullWidth onClick={() => setDirect(false)}>취소</Button><Button fullWidth variant="contained" onClick={() => void addDirect()}>추가</Button></Stack></Stack></CardContent></Card>}
    {message && <Typography role="alert" sx={{ fontSize: 12, color: colors.marketRise }}>{message}</Typography>}
  </Stack>;
}
