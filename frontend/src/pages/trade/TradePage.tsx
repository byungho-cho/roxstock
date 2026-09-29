import { CheckCircleRounded, KeyboardArrowDownRounded } from '@mui/icons-material';
import {
  Alert, Box, Button, CardContent, CircularProgress, FormControl,
  FormHelperText, Grid, MenuItem, Select, Snackbar, Stack, Typography,
} from '@mui/material';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createTrade } from '../../data/mockApi';
import { getBuyTrade, updateBuyTrade } from '../../data/mockBuyTrades';
import { getAvailableLots, getSellTrade, updateSellTrade } from '../../data/mockSellTrades';
import { currentCashBalance, stockItems } from '../../data/mockData';
import { liveApiEnabled } from '../../data/liveData';
import { useBuyLots, useDashboard, useStocks } from '../../hooks/useMockData';
import type { StockItem, TradeDraft, TradeEstimate, TradeType } from '../../types/models';
import { formatDate, formatRate, getMarketColor } from '../../utils/format';
import { ActionButton, AppCard, StockIdentity, SummaryRows } from '../../components/common/Common';
import { DateField, FormTextField, NumberField, FormTextarea } from '../../components/forms/Fields';
import { PageHeader } from '../../components/navigation/Navigation';
import { colors, pageGutter } from '../../styles/tokens';
import { LiveTradeEditPage } from './LiveTradeEditPage';

type FieldErrors = Partial<Record<'stockId' | 'lotId' | 'quantity' | 'price', string>>;
const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const formatWon = (value: number) => Number.isFinite(value) ? `${Math.round(value).toLocaleString('ko-KR')}원` : '—';
const formatSignedWon = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value).toLocaleString('ko-KR')}원`;

export function TradePage() {
  const [params] = useSearchParams();
  return liveApiEnabled && params.has('edit') ? <LiveTradeEditPage key={`${params.get('type')}:${params.get('edit')}`} /> : <TradeEntry key={`${params.get('type')}:${params.get('stock')}:${params.get('lot')}`} />;
}

function TradeEntry() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [type] = useState<TradeType>(searchParams.get('type') === 'sell' ? 'sell' : 'buy');
  const editId = searchParams.get('edit');
  const editing = editId && !liveApiEnabled ? type === 'sell' ? getSellTrade(editId) : getBuyTrade(editId) : undefined;
  const returnToJournal = searchParams.get('return') === 'journal';
  const [stockId, setStockId] = useState(editing?.stockId ?? searchParams.get('stock') ?? 'hyundai');
  const lotId = type === 'sell' ? searchParams.get('lot') ?? '' : '';
  const [tradeDate, setTradeDate] = useState(editing?.tradeDate ?? today);
  const [quantity, setQuantity] = useState(editing ? String(editing.quantity) : '');
  const [price, setPrice] = useState(editing ? String(editing.price) : '');
  const [feeTaxAmount, setFeeTaxAmount] = useState(editing ? String(editing.feeTaxAmount) : '0');
  const [memo, setMemo] = useState(editing?.memo ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const submitting = useRef(false);
  const prefilledLotId = useRef<string | null>(null);
  const selectPrefilledQuantity = useRef(false);
  const quantityRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const feeRef = useRef<HTMLInputElement>(null);
  const mobileMemoRef = useRef<HTMLInputElement>(null);
  const tabletMemoRef = useRef<HTMLTextAreaElement>(null);
  const { data: fetchedStocks, isPending: stocksPending, isError: stocksError, refetch: reloadStocks } = useStocks();
  const { data: dashboard, isPending: dashboardPending, isError: dashboardError, refetch: reloadDashboard } = useDashboard();
  const stocks = fetchedStocks ?? (liveApiEnabled ? [] : stockItems);
  const { data: lots = [], isPending: lotsLoading, isError: lotsError, refetch: reloadLots } = useBuyLots(type === 'sell' ? stockId : undefined);
  const selectedLot = lots.find((lot) => lot.id === lotId);
  const selectedStock = stocks.find((stock) => stock.id === stockId);

  useEffect(() => {
    if (liveApiEnabled && !editId && type === 'buy' && fetchedStocks?.length && !fetchedStocks.some((stock) => stock.id === stockId)) {
      setStockId(fetchedStocks[0].id);
    }
  }, [editId, fetchedStocks, stockId, type]);

  useEffect(() => {
    if (selectedStock && !editId) setPrice(String(selectedStock.currentPrice));
  }, [stockId]);

  useEffect(() => {
    if (!editId) setQuantity('');
    setErrors({});
  }, [stockId, type]);

  useEffect(() => {
    if (type !== 'sell' || editId || !selectedLot || prefilledLotId.current === selectedLot.id) return;
    prefilledLotId.current = selectedLot.id;
    selectPrefilledQuantity.current = true;
    setQuantity(String(selectedLot.remainingQuantity));
  }, [type, editId, selectedLot]);

  useLayoutEffect(() => {
    if (!selectPrefilledQuantity.current || !selectedLot || quantity !== String(selectedLot.remainingQuantity)) return;
    quantityRef.current?.focus({ preventScroll: true });
    quantityRef.current?.select();
    selectPrefilledQuantity.current = false;
  }, [quantity, selectedLot]);

  useEffect(() => {
    if ((!liveApiEnabled && editId && (!editing || editing.stockId !== stockId || (type === 'sell' && editing.type === 'sell' && editing.lotId !== lotId))) || (type === 'sell' && !lotsError && (!lotId || (!lotsLoading && !selectedLot)))) {
      navigate(returnToJournal ? '/journal' : `/stocks/${stockId}`, { replace: true });
    }
  }, [type, editId, editing, lotId, lotsLoading, lotsError, selectedLot, stockId, navigate, returnToJournal]);

  const estimate = useMemo<TradeEstimate>(() => {
    const numericQuantity = Number(quantity) || 0;
    const numericPrice = Number(price) || 0;
    const numericFee = Number(feeTaxAmount) || 0;
    const tradeAmount = numericQuantity * numericPrice;
    const cashChange = type === 'buy' ? -(tradeAmount + numericFee) : tradeAmount - numericFee;
    return {
      tradeAmount,
      realizedProfit: type === 'sell' && selectedLot ? numericQuantity * (numericPrice - selectedLot.buyPrice) - numericFee : undefined,
      cashChange,
      expectedCashBalance: (liveApiEnabled ? dashboard?.summary.cashBalance ?? Number.NaN : currentCashBalance) + cashChange,
    };
  }, [dashboard?.summary.cashBalance, feeTaxAmount, price, quantity, selectedLot, type]);

  const averagePriceAfterBuy = useMemo(() => {
    if (type !== 'buy' || !selectedStock) return undefined;
    const currentQuantity = selectedStock.quantity ?? 0;
    const currentAveragePrice = selectedStock.averagePrice ?? 0;
    const buyQuantity = Number(quantity) || 0;
    const buyPrice = Number(price) || 0;
    if (buyQuantity <= 0 || buyPrice <= 0) return currentAveragePrice;
    return Math.round(((currentQuantity * currentAveragePrice) + (buyQuantity * buyPrice)) / (currentQuantity + buyQuantity));
  }, [price, quantity, selectedStock, type]);

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    const numericQuantity = Number(quantity);
    if (!selectedStock) next.stockId = '종목을 선택해 주세요.';
    if (type === 'sell' && !selectedLot) next.lotId = '연결된 매수 항목을 확인할 수 없습니다.';
    if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) next.quantity = '수량은 1주 이상 정수로 입력해 주세요.';
    if (type === 'sell' && selectedLot && numericQuantity > selectedLot.remainingQuantity + (editing?.quantity ?? 0)) next.quantity = `잔여수량 ${selectedLot.remainingQuantity}주를 넘길 수 없습니다.`;
    if (!Number.isFinite(Number(price)) || Number(price) <= 0) next.price = '단가는 1원 이상 입력해 주세요.';
    return next;
  };

  const handleSubmit = async () => {
    if (submitting.current || saved) return;
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    const draft: TradeDraft = {
      type, stockId, lotId: type === 'sell' ? lotId : undefined, tradeDate,
      quantity: Number(quantity), price: Number(price), feeTaxAmount: Number(feeTaxAmount) || 0, memo,
    };
    submitting.current = true;
    setIsSaving(true);
    try {
      if (liveApiEnabled && editId) throw new Error('거래 상세와 수정 화면이 아직 연결되지 않았습니다.');
      if (editId && type === 'sell') updateSellTrade(editId, draft);
      else if (editId) updateBuyTrade(editId, draft, getAvailableLots(stockId).find((lot) => lot.id === editId)?.soldQuantity ?? 0);
      else await createTrade(draft);
      await queryClient.invalidateQueries({ queryKey: ['buyLots', stockId] });
      if (liveApiEnabled) {
        await Promise.all([queryClient.invalidateQueries({ queryKey: ['stocks'] }), queryClient.invalidateQueries({ queryKey: ['dashboard'] }), queryClient.invalidateQueries({ queryKey: ['journalTrades'] })]);
      }
      setSaved(true);
      navigate(returnToJournal ? `/journal?date=${tradeDate}` : liveApiEnabled ? '/stocks?tab=holding' : `/stocks/${stockId}${editing ? '?tab=trades' : ''}`, { replace: true, state: { savedTrade: type } });
    } catch (error) {
      setErrors((current) => ({ ...current, quantity: error instanceof Error ? error.message : '거래를 저장하지 못했습니다.' }));
    } finally {
      submitting.current = false;
      setIsSaving(false);
    }
  };
  const focusAfterPrice = () => {
    if (window.matchMedia('(min-width: 600px)').matches) feeRef.current?.focus();
    else mobileMemoRef.current?.focus();
  };

  if (liveApiEnabled && ((stocksError && !fetchedStocks) || (dashboardError && !dashboard))) return <Stack spacing={1} sx={{ p: 2 }}><PageHeader embedded compact showAdd={false} title={type === 'buy' ? '매수' : '매도'} /><Alert severity="error">거래에 필요한 데이터를 불러오지 못했습니다. <Button onClick={() => { void reloadStocks(); void reloadDashboard(); }}>다시 시도</Button></Alert></Stack>;
  if (liveApiEnabled && (stocksPending || dashboardPending || (type === 'sell' && lotsLoading))) return <Stack spacing={1} sx={{ p: 2 }}><PageHeader embedded compact showAdd={false} title={type === 'buy' ? '매수' : '매도'} /><Box role="status" sx={{ bgcolor: colors.surface, borderRadius: 2, p: 2, color: colors.textMuted }}>거래 정보를 불러오는 중입니다.</Box></Stack>;
  if (lotsError && type === 'sell') return <Alert severity="error">매도 가능 Lot 조회에 실패했습니다. <Button onClick={() => void reloadLots()}>다시 시도</Button></Alert>;
  if ((!liveApiEnabled && editId && !editing) || (type === 'sell' && (!lotId || (!lotsLoading && !selectedLot)))) return null;

  return (
    <Stack spacing={1.25} sx={{ pb: 9, maxWidth: 880, mx: 'auto' }}>
      <Snackbar open={(stocksError && !!fetchedStocks) || (dashboardError && !!dashboard)} message="최신 시세 조회에 실패했습니다. 이전 값을 표시합니다." />
      <PageHeader embedded compact showAdd={false} title={editing ? `${type === 'buy' ? '매수' : '매도'} 수정` : type === 'buy' ? '매수' : '매도'} />
      <Grid container spacing={{ xs: 1.25, sm: 2 }} sx={{ px: { xs: `${pageGutter.xs}px`, sm: `${pageGutter.sm}px` } }}>
        <Grid size={{ xs: 12, sm: 7 }}>
          <Stack spacing={1.25}>
            <StockSelector stocks={stocks} stockId={stockId} selectedStock={selectedStock} error={errors.stockId} onChange={setStockId} locked={type === 'sell' || Boolean(editing)} />
            {type === 'sell' && selectedLot && <Alert severity="info" sx={{ '& .MuiAlert-message': { width: '100%' } }}>연결된 매수 · {formatDate(selectedLot.tradeDate)} · {formatWon(selectedLot.buyPrice)} · 매수 {selectedLot.quantity}주 · 잔여 {selectedLot.remainingQuantity}주</Alert>}
            {editing && selectedLot && <NumberField label="매수수량" value={String(selectedLot.quantity)} onChange={() => {}} suffix="주" readOnly />}
            <Stack spacing={1}>
              <DateField label="거래일자" value={tradeDate} onChange={setTradeDate} required enterKeyHint="next" onEnter={() => editing && type === 'sell' ? priceRef.current?.focus() : quantityRef.current?.focus()} />
              <NumberField label={type === 'buy' ? '매수수량' : '매도수량'} value={quantity} onChange={(value) => { setQuantity(value); setErrors((current) => ({ ...current, quantity: undefined })); }} suffix="주" error={errors.quantity} description={editing && type === 'sell' ? '수량이 잘못됐다면 매도 거래를 삭제하고 다시 등록해 주세요.' : selectedLot ? `매도 가능 ${selectedLot.remainingQuantity}주` : undefined} min={1} max={selectedLot?.remainingQuantity} required autoFocus={!editing || type === 'buy'} readOnly={Boolean(editing && type === 'sell')} inputRef={quantityRef} selectOnFocus={!(editing && type === 'sell')} enterKeyHint="next" onEnter={() => priceRef.current?.focus()} />
              <NumberField label={type === 'buy' ? '매수가격' : '매도가격'} value={price} onChange={(value) => { setPrice(value); setErrors((current) => ({ ...current, price: undefined })); }} suffix="원" error={errors.price} min={1} required autoFocus={Boolean(editing && type === 'sell')} inputRef={priceRef} selectOnFocus enterKeyHint="next" onEnter={focusAfterPrice} />
              <Box sx={{ display: { xs: 'none', sm: 'block' } }}><NumberField label="수수료·세금" value={feeTaxAmount} onChange={setFeeTaxAmount} suffix="원" min={0} inputRef={feeRef} selectOnFocus enterKeyHint="next" onEnter={() => tabletMemoRef.current?.focus()} /></Box>
              <Box sx={{ display: { xs: 'block', sm: 'none' } }}><FormTextField label="메모" value={memo} onChange={setMemo} placeholder="선택 입력" inputRef={mobileMemoRef} selectOnFocus enterKeyHint="done" onEnter={handleSubmit} /></Box>
              <Box sx={{ display: { xs: 'none', sm: 'block' } }}><FormTextarea label="메모" value={memo} onChange={setMemo} placeholder="선택 입력" rows={1} textareaRef={tabletMemoRef} selectOnFocus onEnter={handleSubmit} /></Box>
            </Stack>

            {errors.lotId && <Alert severity="error">{errors.lotId}</Alert>}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, sm: 5 }}>
          <Box sx={{ position: { sm: 'sticky' }, top: { sm: 92 } }}>
            <Typography sx={{ mb: 1, fontSize: 14, fontWeight: 750 }}>거래 정보</Typography>
            <AppCard><CardContent sx={{ px: 1.75, py: 1.25, '&:last-child': { pb: 1.25 } }}><SummaryRows rows={[{ label: `${type === 'buy' ? '매수' : '매도'}금액`, value: formatWon(estimate.tradeAmount), color: type === 'buy' ? colors.marketFall : colors.marketRise }, ...(type === 'sell' ? [{ label: '예상 실현손익', value: formatSignedWon(estimate.realizedProfit ?? 0), color: estimate.realizedProfit && estimate.realizedProfit < 0 ? colors.marketFall : colors.marketRise }] : []), { label: '거래 후 예수금', value: formatWon(estimate.expectedCashBalance), emphasis: true }, ...(type === 'buy' && averagePriceAfterBuy !== undefined ? [{ label: '매수 후 평균단가', value: formatWon(averagePriceAfterBuy), emphasis: true }] : [])]} /></CardContent></AppCard>
            <Alert severity="info" sx={{ mt: 1.25, display: { xs: 'none', sm: 'flex' }, '& .MuiAlert-message': { fontSize: 11, lineHeight: 1.55 } }}>예상 예수금은 최초 등록할 때만 반영됩니다. 수정·삭제 시 자동 재계산되지 않습니다.</Alert>
          </Box>
        </Grid>
      </Grid>

      <Box sx={{ position: 'fixed', inset: 'auto 0 0', zIndex: 10, bgcolor: 'rgba(8,13,24,0.96)', backdropFilter: 'blur(20px)', borderTop: '1px solid', borderColor: 'divider', px: { xs: `${pageGutter.xs}px`, sm: `${pageGutter.sm}px` }, py: 1.5 }}>
        <Stack direction="row" spacing={1.5} sx={{ maxWidth: 880 - pageGutter.sm * 2, mx: 'auto' }}>
          <ActionButton tone="muted" sx={{ width: 112 }} onClick={() => editing ? navigate(returnToJournal ? `/journal?date=${searchParams.get('fromDate') ?? tradeDate}` : `/stocks/${stockId}?tab=trades`, { replace: true }) : navigate(-1)}>취소</ActionButton>
          <ActionButton tone={type === 'buy' ? 'primary' : 'danger'} sx={{ flex: 1 }} disabled={isSaving} onClick={handleSubmit}>{isSaving ? <CircularProgress size={22} color="inherit" /> : editing ? '수정' : type === 'buy' ? '매수' : '매도'}</ActionButton>
        </Stack>
      </Box>
      <Snackbar open={saved} autoHideDuration={2500} onClose={() => setSaved(false)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}><Alert icon={<CheckCircleRounded />} severity="success" variant="filled" onClose={() => setSaved(false)}>{liveApiEnabled ? `${type === 'buy' ? '매수' : '매도'} 거래가 등록되었습니다.` : '목 거래가 등록됐어요. 실제 데이터는 변경하지 않았습니다.'}</Alert></Snackbar>
    </Stack>
  );
}

function StockSelector({ stocks, stockId, selectedStock, error, onChange, locked = false }: { stocks: StockItem[]; stockId: string; selectedStock?: StockItem; error?: string; onChange: (value: string) => void; locked?: boolean }) {
  const dailyChange = selectedStock ? Math.round(selectedStock.currentPrice * selectedStock.priceChangeRate / 100) : 0;
  return <FormControl fullWidth error={Boolean(error)}>
    <AppCard sx={{ height: { xs: 74, sm: 68 } }}>
      <Stack direction="row" sx={{ height: '100%', alignItems: 'center', justifyContent: 'space-between', px: { xs: 2, sm: 1.75 }, gap: 1 }}>
        <Select value={stockId} disabled={locked} onChange={(event) => onChange(event.target.value)} variant="standard" disableUnderline IconComponent={KeyboardArrowDownRounded} renderValue={() => selectedStock ? <StockIdentity name={selectedStock.name} symbol={selectedStock.symbol} /> : '종목 선택'} sx={{ minWidth: 150, '& .MuiSelect-select': { py: 0 }, '&.Mui-disabled': { color: colors.textPrimary }, '& .MuiSelect-icon': { display: { xs: 'none', sm: 'block' }, color: colors.disabled, right: -2 } }}>
          {stocks.map((stock) => <MenuItem key={stock.id} value={stock.id}>{stock.name} · {stock.symbol}</MenuItem>)}
        </Select>
        {selectedStock && <Box sx={{ textAlign: 'right' }}><Typography sx={{ fontSize: 15, lineHeight: '22px', fontWeight: 700, color: getMarketColor(selectedStock.priceChangeRate) }}>{selectedStock.currentPrice.toLocaleString('ko-KR')}원</Typography><Typography sx={{ mt: 0.25, color: getMarketColor(selectedStock.priceChangeRate), fontSize: 11 }}>{dailyChange > 0 ? '+' : ''}{dailyChange.toLocaleString('ko-KR')}원&nbsp; ({formatRate(selectedStock.priceChangeRate)})</Typography></Box>}
      </Stack>
    </AppCard>
    {error && <FormHelperText>{error}</FormHelperText>}
  </FormControl>;
}
