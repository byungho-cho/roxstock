import { ArrowBackRounded, CheckCircleRounded } from '@mui/icons-material';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, CircularProgress,
  FormControl, FormControlLabel, FormHelperText, Grid, InputLabel, MenuItem,
  Radio, RadioGroup, Select, Snackbar, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createTrade } from '../../data/mockApi';
import { currentCashBalance } from '../../data/mockData';
import { useBuyLots, useStocks } from '../../hooks/useMockData';
import type { BuyLot, TradeDraft, TradeEstimate, TradeType } from '../../types/models';
import { formatAmount, formatDate, formatSignedAmount, getMarketColor } from '../../utils/format';

type FieldErrors = Partial<Record<'stockId' | 'lotId' | 'quantity' | 'price', string>>;

const today = '2026-09-24';

export function TradePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') === 'sell' ? 'sell' : 'buy';
  const [type, setType] = useState<TradeType>(initialType);
  const [stockId, setStockId] = useState(searchParams.get('stock') ?? 'hyundai');
  const [lotId, setLotId] = useState('');
  const [tradeDate, setTradeDate] = useState(today);
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [feeTaxAmount, setFeeTaxAmount] = useState('0');
  const [memo, setMemo] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { data: stocks = [], isPending: stocksLoading } = useStocks();
  const { data: lots = [], isPending: lotsLoading } = useBuyLots(type === 'sell' ? stockId : undefined);

  const selectedLot = lots.find((lot) => lot.id === lotId);
  const selectedStock = stocks.find((stock) => stock.id === stockId);

  useEffect(() => {
    if (!selectedStock) return;
    setPrice(String(selectedStock.currentPrice));
  }, [selectedStock]);

  useEffect(() => {
    setLotId('');
    setQuantity('');
    setErrors({});
  }, [stockId, type]);

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

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    const numericQuantity = Number(quantity);
    if (!stockId) next.stockId = '종목을 선택해 주세요.';
    if (type === 'sell' && !selectedLot) next.lotId = '매도할 매수 Lot 하나를 선택해 주세요.';
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) next.quantity = '수량은 1주 이상 입력해 주세요.';
    if (type === 'sell' && selectedLot && numericQuantity > selectedLot.remainingQuantity) next.quantity = `잔여수량 ${selectedLot.remainingQuantity}주를 넘길 수 없습니다.`;
    if (!Number.isFinite(Number(price)) || Number(price) <= 0) next.price = '단가는 1원 이상 입력해 주세요.';
    return next;
  };

  const handleSubmit = async () => {
    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const draft: TradeDraft = {
      type, stockId, lotId: type === 'sell' ? lotId : undefined, tradeDate,
      quantity: Number(quantity), price: Number(price), feeTaxAmount: Number(feeTaxAmount) || 0, memo,
    };
    setIsSaving(true);
    try {
      await createTrade(draft);
      setSaved(true);
    } finally {
      setIsSaving(false);
    }
  };

  if (stocksLoading) return <Stack sx={{ minHeight: 360, alignItems: 'center', justifyContent: 'center' }}><CircularProgress /><Typography color="text.secondary" sx={{ mt: 1.5 }}>거래 입력 데이터를 준비하고 있어요.</Typography></Stack>;

  return (
    <Stack spacing={2} sx={{ pb: 11 }}>
      <Button startIcon={<ArrowBackRounded />} color="inherit" onClick={() => navigate(-1)} sx={{ alignSelf: 'flex-start' }}>이전 화면</Button>

      <Card><Tabs value={type} onChange={(_, value: TradeType) => setType(value)} variant="fullWidth" textColor="secondary" indicatorColor="secondary"><Tab value="buy" label="매수" /><Tab value="sell" label="매도" /></Tabs></Card>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, sm: 7 }}>
          <Stack spacing={2}>
            <Card><CardContent sx={{ p: 2 }}><Stack spacing={2}>
              <FormControl size="small" error={Boolean(errors.stockId)}>
                <InputLabel id="trade-stock-label">종목</InputLabel>
                <Select labelId="trade-stock-label" label="종목" value={stockId} onChange={(event) => setStockId(event.target.value)}>
                  <MenuItem value=""><em>종목 선택</em></MenuItem>
                  {stocks.map((stock) => <MenuItem key={stock.id} value={stock.id}>{stock.name} · {stock.symbol}</MenuItem>)}
                </Select>
                {errors.stockId && <FormHelperText>{errors.stockId}</FormHelperText>}
              </FormControl>
              <TextField label="거래일자" type="date" value={tradeDate} onChange={(event) => setTradeDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            </Stack></CardContent></Card>

            {type === 'sell' && (
              <Card><CardContent sx={{ p: 2 }}><Typography variant="subtitle1">매수 Lot 선택</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, mb: 1.5 }}>한 번에 하나의 Lot만 선택할 수 있어요.</Typography>
                {lotsLoading ? <CircularProgress size={22} /> : lots.length === 0 ? <Alert severity="info">선택한 종목에 매도 가능한 Lot이 없습니다.</Alert> : (
                  <FormControl error={Boolean(errors.lotId)} fullWidth><RadioGroup value={lotId} onChange={(event) => setLotId(event.target.value)} sx={{ gap: 1 }}>
                    {lots.map((lot) => <LotOption key={lot.id} lot={lot} selected={lot.id === lotId} />)}
                  </RadioGroup>{errors.lotId && <FormHelperText>{errors.lotId}</FormHelperText>}</FormControl>
                )}
              </CardContent></Card>
            )}

            <Card><CardContent sx={{ p: 2 }}><Stack spacing={2}>
              <TextField label="수량 (주)" type="number" value={quantity} onChange={(event) => { setQuantity(event.target.value); setErrors((current) => ({ ...current, quantity: undefined })); }} error={Boolean(errors.quantity)} helperText={errors.quantity ?? (selectedLot ? `매도 가능 ${selectedLot.remainingQuantity}주` : '1주 이상 입력')} slotProps={{ htmlInput: { min: 1, max: selectedLot?.remainingQuantity } }} />
              <TextField label="단가 (원)" type="number" value={price} onChange={(event) => { setPrice(event.target.value); setErrors((current) => ({ ...current, price: undefined })); }} error={Boolean(errors.price)} helperText={errors.price} slotProps={{ htmlInput: { min: 1 } }} />
              <TextField label="수수료·세금 (원)" type="number" value={feeTaxAmount} onChange={(event) => setFeeTaxAmount(event.target.value)} slotProps={{ htmlInput: { min: 0 } }} />
              <TextField label="메모" value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="선택 입력" />
            </Stack></CardContent></Card>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, sm: 5 }}>
          <Card sx={{ position: { sm: 'sticky' }, top: { sm: 88 } }}><CardContent sx={{ p: 2 }}>
            <Typography variant="subtitle1">예상 결과</Typography>
            <Stack spacing={1.25} sx={{ mt: 1.5 }}>
              <EstimateLine label="거래금액" value={formatAmount(estimate.tradeAmount)} />
              {type === 'sell' && <EstimateLine label="예상 실현손익" value={formatSignedAmount(estimate.realizedProfit ?? 0)} color={getMarketColor(estimate.realizedProfit ?? 0)} />}
              <EstimateLine label="예수금 반영" value={formatSignedAmount(estimate.cashChange)} color={getMarketColor(estimate.cashChange)} />
              <Box sx={{ borderTop: '1px solid', borderColor: 'divider', pt: 1.25 }}><EstimateLine label="예상 거래 후 예수금" value={formatAmount(estimate.expectedCashBalance)} emphasis /></Box>
            </Stack>
            <Alert severity="info" sx={{ mt: 2, '& .MuiAlert-message': { fontSize: 12 } }}>예상 예수금은 이 거래를 최초 등록할 때만 반영되는 값입니다. 이후 수정·삭제로 자동 재계산되지 않습니다.</Alert>
          </CardContent></Card>
        </Grid>
      </Grid>

      <Box sx={{ position: 'fixed', inset: 'auto 0 0', zIndex: 10, bgcolor: 'rgba(17, 24, 39, 0.97)', borderTop: '1px solid', borderColor: 'divider', px: 2, py: 1.5 }}>
        <Stack direction="row" spacing={1.5} sx={{ maxWidth: 888, mx: 'auto' }}><Button variant="outlined" color="inherit" sx={{ width: 112, height: 48 }} onClick={() => navigate(-1)}>취소</Button><Button variant="contained" sx={{ flex: 1, height: 48 }} disabled={isSaving} onClick={handleSubmit}>{isSaving ? <CircularProgress size={22} color="inherit" /> : `${type === 'buy' ? '매수' : '매도'} 등록`}</Button></Stack>
      </Box>

      <Snackbar open={saved} autoHideDuration={2500} onClose={() => setSaved(false)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}><Alert icon={<CheckCircleRounded />} severity="success" variant="filled" onClose={() => setSaved(false)}>목 거래가 등록됐어요. 실제 데이터는 변경하지 않았습니다.</Alert></Snackbar>
    </Stack>
  );
}

function LotOption({ lot, selected }: { lot: BuyLot; selected: boolean }) {
  return <Card variant="outlined" sx={{ borderColor: selected ? 'secondary.main' : 'divider', bgcolor: selected ? 'rgba(251, 191, 36, 0.06)' : 'transparent' }}><CardActionArea component="label"><CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}><FormControlLabel value={lot.id} control={<Radio color="secondary" />} label={<Box><Typography sx={{ fontWeight: 750 }}>{formatDate(lot.tradeDate)} · {formatAmount(lot.buyPrice)}</Typography><Typography variant="body2" color="text.secondary">매수 {lot.quantity}주 · 매도 {lot.soldQuantity}주 · 잔여 {lot.remainingQuantity}주</Typography></Box>} sx={{ m: 0, width: '100%' }} /></CardContent></CardActionArea></Card>;
}

function EstimateLine({ label, value, color = 'text.primary', emphasis = false }: { label: string; value: string; color?: string; emphasis?: boolean }) {
  return <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography sx={{ color, fontWeight: emphasis ? 850 : 700, fontSize: emphasis ? 17 : 14 }}>{value}</Typography></Stack>;
}
