import { ArrowBackIosNewRounded } from '@mui/icons-material';
import { Box, Button, IconButton, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FormTextarea, NumberField } from '../../components/forms/Fields';
import { stockItems } from '../../data/mockData';
import { colors } from '../../styles/tokens';

const initialValues = {
  operatingProfit: '3820000000000',
  controllingProfit: '3160000000000',
  issuedShares: '92331000',
  treasuryShares: '1245000',
  assets: '85400000000000',
  liabilities: '50600000000000',
  equity: '34800000000000',
  previousEquity: '32100000000000',
  dividend: '5000',
};

export function StockEditPage() {
  const navigate = useNavigate();
  const { stockId = 'mobis-watch' } = useParams();
  const stock = stockItems.find((item) => item.id === stockId) ?? stockItems.find((item) => item.listType === 'watchlist')!;
  const [values, setValues] = useState(initialValues);
  const [memo, setMemo] = useState(stock.note ?? '저평가 구간 관찰 · 실적 회복 확인');
  const setValue = (key: keyof typeof initialValues) => (value: string) => setValues((current) => ({ ...current, [key]: value }));
  const fields: Array<[keyof typeof initialValues, string, string]> = [
    ['operatingProfit','영업이익','원'], ['controllingProfit','지배순이익','원'], ['issuedShares','발행주식수','주'],
    ['treasuryShares','자기주식수','주'], ['assets','자산','원'], ['liabilities','부채','원'],
    ['equity','지배주주자본','원'], ['previousEquity','전기 지배주주자본','원'], ['dividend','주당배당금','원'],
  ];
  return <Stack sx={{ height: 'calc(100dvh - 66px)', minHeight: 0 }}>
    <Stack direction="row" sx={{ height: 58, flexShrink: 0, alignItems: 'flex-start', justifyContent: 'space-between', pt: '4px' }}><IconButton onClick={() => navigate(-1)} sx={{ width: 40, height: 36, justifyContent: 'flex-start', p: 0 }}><ArrowBackIosNewRounded sx={{ fontSize: 18 }} /></IconButton><Box sx={{ textAlign: 'center' }}><Typography sx={{ fontSize: 19, lineHeight: '24px', fontWeight: 700 }}>종목 정보 수정</Typography><Typography sx={{ mt: '3px', fontSize: 10, color: colors.textMuted }}>{stock.name} · A{stock.symbol}</Typography></Box><Box sx={{ width: 40 }} /></Stack>
    <Stack spacing="9px" sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pb: 1, scrollbarColor: `${colors.borderStrong} transparent`, '&::-webkit-scrollbar': { width: 4 }, '&::-webkit-scrollbar-thumb': { bgcolor: colors.borderStrong, borderRadius: 4 } }}>
      <Button onClick={() => navigate(-1)} sx={{ height: 48, flexShrink: 0, px: '14px', justifyContent: 'space-between', border: `1px solid ${colors.borderStrong}`, borderRadius: '10px', bgcolor: colors.raised, color: colors.textSecondary, fontSize: 12 }}><span>분류</span><Box component="span" sx={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>{stock.listType === 'recommended' ? '추천종목' : '관심종목'}　›</Box></Button>
      {fields.map(([key,label,suffix]) => <NumberField key={key} label={label} value={values[key]} onChange={setValue(key)} suffix={suffix} />)}
      <FormTextarea label="메모" value={memo} onChange={setMemo} rows={2} />
      <Box sx={{ p: '14px 16px', bgcolor: '#0E1624', border: '1px solid #243857', borderRadius: '10px' }}><Typography sx={{ fontSize: 10, fontWeight: 700, color: '#C7D6EB' }}>자동 계산 지표</Typography><Typography sx={{ mt: 1.5, fontSize: 10, color: '#C7D6EB' }}>EPS 34,697원　　BPS 382,063원</Typography><Typography sx={{ mt: 0.5, fontSize: 10, color: '#C7D6EB' }}>PER 11.63　　PBR 1.06　　ROE 9.45%</Typography></Box>
    </Stack>
    <Stack direction="row" spacing="16px" sx={{ pt: '14px', flexShrink: 0 }}><Button fullWidth onClick={() => navigate(-1)} sx={{ height: 40, border: '1px solid #404F66', borderRadius: '10px', bgcolor: '#1F2938', color: '#E0E8F5', fontSize: 13, fontWeight: 700 }}>취소</Button><Button fullWidth variant="contained" onClick={() => navigate(`/stocks/${stock.id}`)} sx={{ height: 40, borderRadius: '10px', fontSize: 13, fontWeight: 700 }}>저장</Button></Stack>
  </Stack>;
}
