import { CheckCircleRounded, KeyboardArrowDownRounded } from '@mui/icons-material';
import {
  Alert, Box, CardContent, CircularProgress, FormControl,
  FormHelperText, Grid, MenuItem, Select, Snackbar, Stack, Typography,
} from '@mui/material';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createTrade } from '../../data/mockApi';
import { getSellTrade, updateSellTrade } from '../../data/mockSellTrades';
import { currentCashBalance, stockItems } from '../../data/mockData';
import { useBuyLots, useStocks } from '../../hooks/useMockData';
import type { StockItem, TradeDraft, TradeEstimate, TradeType } from '../../types/models';
import { formatDate, formatRate, getMarketColor } from '../../utils/format';
import { ActionButton, AppCard, StockIdentity, SummaryRows } from '../../components/common/Common';
import { DateField, FormTextField, NumberField, FormTextarea } from '../../components/forms/Fields';
import { PageHeader } from '../../components/navigation/Navigation';
import { colors, pageGutter } from '../../styles/tokens';

type FieldErrors = Partial<Record<'stockId' | 'lotId' | 'quantity' | 'price', string>>;
const today = '2026-09-24';
const formatWon = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;
const formatSignedWon = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value).toLocaleString('ko-KR')}원`;

export function TradePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [type] = useState<TradeType>(searchParams.get('type') === 'sell' ? 'sell' : 'buy');
  const editId = searchParams.get('edit');
  const editing = editId ? getSellTrade(editId) : undefined;
  const [stockId, setStockId] = useState(searchParams.get('stock') ?? 'hyundai');
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
  const { data: fetchedStocks } = useStocks();
  const stocks = fetchedStocks ?? stockItems;
  const { data: lots = [], isPending: lotsLoading } = useBuyLots(type === 'sell' ? stockId : undefined);
  const selectedLot = lots.find((lot) => lot.id === lotId);
  const selectedStock = stocks.find((stock) => stock.id === stockId);

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
    if ((editId && (!editing || type !== 'sell' || editing.stockId !== stockId || editing.lotId !== lotId)) || (type === 'sell' && (!lotId || (!lotsLoading && !selectedLot)))) {
      navigate(`/stocks/${stockId}`, { replace: true });
    }
  }, [type, editId, editing, lotId, lotsLoading, selectedLot, stockId, navigate]);

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
      expectedCashBalance: currentCashBalance + cashChange,
    };
  }, [feeTaxAmount, price, quantity, selectedLot, type]);

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
    if (!stockId) next.stockId = '종목을 선택해 주세요.';
    if (type === 'sell' && !selectedLot) next.lotId = '연결된 매수 항목을 확인할 수 없습니다.';
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) next.quantity = '수량은 1주 이상 입력해 주세요.';
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
      if (editId) updateSellTrade(editId, draft);
      else await createTrade(draft);
      if (type === 'sell') await queryClient.invalidateQueries({ queryKey: ['buyLots', stockId] });
      setSaved(true);
      navigate(`/stocks/${stockId}${editing ? '?tab=trades' : ''}`, { replace: true, state: { savedTrade: type } });
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

  if ((editId && !editing) || (type === 'sell' && (!lotId || (!lotsLoading && !selectedLot)))) return null;

  return (
    <Stack spacing={1.25} sx={{ pb: 9, maxWidth: 880, mx: 'auto' }}>
      <PageHeader embedded compact showAdd={false} title={editing ? '매도 수정' : type === 'buy' ? '매수' : '매도'} />
      <Grid container spacing={{ xs: 1.25, sm: 2 }} sx={{ px: { xs: `${pageGutter.xs}px`, sm: `${pageGutter.sm}px` } }}>
        <Grid size={{ xs: 12, sm: 7 }}>
          <Stack spacing={1.25}>
            <StockSelector stocks={stocks} stockId={stockId} selectedStock={selectedStock} error={errors.stockId} onChange={setStockId} locked={type === 'sell'} />
            {type === 'sell' && selectedLot && <Alert severity="info" sx={{ '& .MuiAlert-message': { width: '100%' } }}>연결된 매수 · {formatDate(selectedLot.tradeDate)} · {formatWon(selectedLot.buyPrice)} · 매수 {selectedLot.quantity}주 · 잔여 {selectedLot.remainingQuantity}주</Alert>}
            {editing && selectedLot && <NumberField label="매수수량" value={String(selectedLot.quantity)} onChange={() => {}} suffix="주" readOnly />}
            <Stack spacing={1}>
              <DateField label="거래일자" value={tradeDate} onChange={setTradeDate} required enterKeyHint="next" onEnter={() => editing ? priceRef.current?.focus() : quantityRef.current?.focus()} />
              <NumberField label={type === 'buy' ? '매수수량' : '매도수량'} value={quantity} onChange={(value) => { setQuantity(value); setErrors((current) => ({ ...current, quantity: undefined })); }} suffix="주" error={errors.quantity} description={editing ? '수량이 잘못됐다면 매도 거래를 삭제하고 다시 등록해 주세요.' : selectedLot ? `매도 가능 ${selectedLot.remainingQuantity}주` : undefined} min={1} max={selectedLot?.remainingQuantity} required autoFocus={!editing} readOnly={Boolean(editing)} inputRef={quantityRef} selectOnFocus={!editing} enterKeyHint="next" onEnter={() => priceRef.current?.focus()} />
              <NumberField label={type === 'buy' ? '매수가격' : '매도가격'} value={price} onChange={(value) => { setPrice(value); setErrors((current) => ({ ...current, price: undefined })); }} suffix="원" error={errors.price} min={1} required autoFocus={Boolean(editing)} inputRef={priceRef} selectOnFocus enterKeyHint="next" onEnter={focusAfterPrice} />
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
          <ActionButton tone="muted" sx={{ width: 112 }} onClick={() => editing ? navigate(`/stocks/${stockId}?tab=trades`, { replace: true }) : navigate(-1)}>취소</ActionButton>
          <ActionButton tone={type === 'buy' ? 'primary' : 'danger'} sx={{ flex: 1 }} disabled={isSaving} onClick={handleSubmit}>{isSaving ? <CircularProgress size={22} color="inherit" /> : editing ? '수정' : type === 'buy' ? '매수' : '매도'}</ActionButton>
        </Stack>
      </Box>
      <Snackbar open={saved} autoHideDuration={2500} onClose={() => setSaved(false)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}><Alert icon={<CheckCircleRounded />} severity="success" variant="filled" onClose={() => setSaved(false)}>목 거래가 등록됐어요. 실제 데이터는 변경하지 않았습니다.</Alert></Snackbar>
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
