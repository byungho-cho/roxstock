import { CheckCircleRounded, KeyboardArrowDownRounded } from '@mui/icons-material';
import {
  Alert, Box, Card, CardActionArea, CardContent, CircularProgress, FormControl,
  FormControlLabel, FormHelperText, Grid, MenuItem, Radio, RadioGroup, Select, Snackbar, Stack, Typography,
} from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createTrade } from '../../data/mockApi';
import { currentCashBalance } from '../../data/mockData';
import { useBuyLots, useStocks } from '../../hooks/useMockData';
import type { BuyLot, StockItem, TradeDraft, TradeEstimate, TradeType } from '../../types/models';
import { formatAmount, formatDate, formatRate, formatSignedAmount, getMarketColor } from '../../utils/format';
import { ActionButton, AmountText, AppCard, StockIdentity, SummaryRows } from '../../components/common/Common';
import { DateField, NumberField, FormTextarea } from '../../components/forms/Fields';
import { PageHeader } from '../../components/navigation/Navigation';
import { colors } from '../../styles/tokens';

type FieldErrors = Partial<Record<'stockId' | 'lotId' | 'quantity' | 'price', string>>;
const today = '2026-09-24';

export function TradePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [type, setType] = useState<TradeType>(searchParams.get('type') === 'sell' ? 'sell' : 'buy');
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
    if (selectedStock) setPrice(String(selectedStock.currentPrice));
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
    if (Object.keys(nextErrors).length) return;
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

  if (stocksLoading) return <Stack sx={{ minHeight: 360, alignItems: 'center', justifyContent: 'center' }}><CircularProgress /><Typography sx={{ mt: 1.5, color: '#94A3B8' }}>거래 입력 데이터를 준비하고 있어요.</Typography></Stack>;

  return (
    <Stack spacing={1.25} sx={{ pb: 9, maxWidth: 880, mx: 'auto' }}>
      <PageHeader compact showAdd={false} title={type === 'buy' ? '매수' : '매도'} />
      <Grid container spacing={{ xs: 1.25, sm: 2 }} sx={{ px: { xs: 2, sm: 2.5 } }}>
        <Grid size={{ xs: 12, sm: 7 }}>
          <Stack spacing={1.25}>
            <StockSelector stocks={stocks} stockId={stockId} selectedStock={selectedStock} error={errors.stockId} onChange={setStockId} />
            <Typography sx={{ pt: 0.5, fontSize: 14, fontWeight: 750 }}>거래 정보</Typography>
            <Stack spacing={1}>
              <DateField label="거래일자" value={tradeDate} onChange={setTradeDate} required />
              <NumberField label={type === 'buy' ? '매수수량' : '매도수량'} value={quantity} onChange={(value) => { setQuantity(value); setErrors((current) => ({ ...current, quantity: undefined })); }} suffix="주" error={errors.quantity} description={selectedLot ? `매도 가능 ${selectedLot.remainingQuantity}주` : undefined} min={1} max={selectedLot?.remainingQuantity} required />
              <NumberField label={type === 'buy' ? '매수가격' : '매도가격'} value={price} onChange={(value) => { setPrice(value); setErrors((current) => ({ ...current, price: undefined })); }} suffix="원" error={errors.price} min={1} required />
              <NumberField label="수수료·세금" value={feeTaxAmount} onChange={setFeeTaxAmount} suffix="원" min={0} />
              <FormTextarea label="메모" value={memo} onChange={setMemo} placeholder="선택 입력" rows={1} />
            </Stack>

            {type === 'sell' && (
              <Box sx={{ pt: 0.5 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 750 }}>매수 Lot 선택</Typography>
                <Typography sx={{ mt: 0.25, mb: 1, color: '#94A3B8', fontSize: 12 }}>한 번에 하나의 Lot만 선택할 수 있어요.</Typography>
                {lotsLoading ? <CircularProgress size={22} /> : lots.length === 0 ? <Alert severity="info">선택한 종목에 매도 가능한 Lot이 없습니다.</Alert> : (
                  <FormControl error={Boolean(errors.lotId)} fullWidth>
                    <RadioGroup value={lotId} onChange={(event) => setLotId(event.target.value)} sx={{ gap: 1 }}>
                      {lots.map((lot) => <LotOption key={lot.id} lot={lot} selected={lot.id === lotId} />)}
                    </RadioGroup>
                    {errors.lotId && <FormHelperText>{errors.lotId}</FormHelperText>}
                  </FormControl>
                )}
              </Box>
            )}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, sm: 5 }}>
          <Box sx={{ position: { sm: 'sticky' }, top: { sm: 92 } }}>
            <Typography sx={{ mb: 1, fontSize: 14, fontWeight: 750 }}>예상 결과</Typography>
            <AppCard><CardContent sx={{ px: 1.75, py: 1.25, '&:last-child': { pb: 1.25 } }}><SummaryRows rows={[{ label: `${type === 'buy' ? '매수' : '매도'}금액`, value: formatAmount(estimate.tradeAmount), color: type === 'buy' ? colors.marketFall : colors.marketRise }, ...(type === 'sell' ? [{ label: '예상 실현손익', value: formatSignedAmount(estimate.realizedProfit ?? 0), color: estimate.realizedProfit && estimate.realizedProfit < 0 ? colors.marketFall : colors.marketRise }] : []), { label: '예수금 반영', value: formatSignedAmount(estimate.cashChange), color: estimate.cashChange < 0 ? colors.marketFall : colors.marketRise }, { label: '거래 후 예수금', value: formatAmount(estimate.expectedCashBalance), emphasis: true }]} /></CardContent></AppCard>
            <Alert severity="info" sx={{ mt: 1.25, '& .MuiAlert-message': { fontSize: 11, lineHeight: 1.55 } }}>예상 예수금은 최초 등록할 때만 반영됩니다. 수정·삭제 시 자동 재계산되지 않습니다.</Alert>
          </Box>
        </Grid>
      </Grid>

      <Box sx={{ position: 'fixed', inset: 'auto 0 0', zIndex: 10, bgcolor: 'rgba(8,13,24,0.96)', backdropFilter: 'blur(20px)', borderTop: '1px solid', borderColor: 'divider', px: 2, py: 1.5 }}>
        <Stack direction="row" spacing={1.5} sx={{ maxWidth: 848, mx: 'auto' }}>
          <ActionButton tone="muted" sx={{ width: 112 }} onClick={() => navigate(-1)}>취소</ActionButton>
          <ActionButton tone={type === 'buy' ? 'primary' : 'danger'} sx={{ flex: 1 }} disabled={isSaving} onClick={handleSubmit}>{isSaving ? <CircularProgress size={22} color="inherit" /> : type === 'buy' ? '매수' : '매도'}</ActionButton>
        </Stack>
      </Box>
      <Snackbar open={saved} autoHideDuration={2500} onClose={() => setSaved(false)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}><Alert icon={<CheckCircleRounded />} severity="success" variant="filled" onClose={() => setSaved(false)}>목 거래가 등록됐어요. 실제 데이터는 변경하지 않았습니다.</Alert></Snackbar>
    </Stack>
  );
}

function StockSelector({ stocks, stockId, selectedStock, error, onChange }: { stocks: StockItem[]; stockId: string; selectedStock?: StockItem; error?: string; onChange: (value: string) => void }) {
  return <FormControl fullWidth error={Boolean(error)}>
    <AppCard sx={{ height: 68 }}>
      <Stack direction="row" sx={{ height: '100%', alignItems: 'center', justifyContent: 'space-between', px: 1.75, gap: 1 }}>
        <Select value={stockId} onChange={(event) => onChange(event.target.value)} variant="standard" disableUnderline IconComponent={KeyboardArrowDownRounded} renderValue={() => selectedStock ? <StockIdentity name={selectedStock.name} symbol={selectedStock.symbol} /> : '종목 선택'} sx={{ minWidth: 150, '& .MuiSelect-select': { py: 0 }, '& .MuiSelect-icon': { color: colors.disabled, right: -2 } }}>
          {stocks.map((stock) => <MenuItem key={stock.id} value={stock.id}>{stock.name} · {stock.symbol}</MenuItem>)}
        </Select>
        {selectedStock && <Box sx={{ textAlign: 'right' }}><AmountText value={selectedStock.currentPrice} colorByValue={false} color={selectedStock.priceChangeRate < 0 ? colors.marketFall : selectedStock.priceChangeRate > 0 ? colors.marketRise : colors.marketFlat} /><Typography sx={{ mt: 0.25, color: getMarketColor(selectedStock.priceChangeRate), fontSize: 11 }}>{formatRate(selectedStock.priceChangeRate)}</Typography></Box>}
      </Stack>
    </AppCard>
    {error && <FormHelperText>{error}</FormHelperText>}
  </FormControl>;
}

function LotOption({ lot, selected }: { lot: BuyLot; selected: boolean }) {
  return <Card variant="outlined" sx={{ borderColor: selected ? 'secondary.main' : 'divider', bgcolor: selected ? 'rgba(251,191,36,0.06)' : 'transparent' }}><CardActionArea component="label"><CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}><FormControlLabel value={lot.id} control={<Radio color="secondary" size="small" />} label={<Box><Typography sx={{ fontSize: 13, fontWeight: 750 }}>{formatDate(lot.tradeDate)} · {formatAmount(lot.buyPrice)}</Typography><Typography sx={{ mt: 0.25, fontSize: 11, color: '#94A3B8' }}>매수 {lot.quantity}주 · 매도 {lot.soldQuantity}주 · 잔여 {lot.remainingQuantity}주</Typography></Box>} sx={{ m: 0, width: '100%' }} /></CardContent></CardActionArea></Card>;
}
