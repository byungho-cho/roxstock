import { AccountBalanceWalletRounded, TrendingUpRounded } from '@mui/icons-material';
import { Box, Card, CardContent, Chip, CircularProgress, Grid, Stack, Typography } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { useDashboard } from '../../hooks/useDashboard';
import { formatRate, formatWon } from '../../utils/format';

export function DashboardPage() {
  const { data, isPending } = useDashboard(); const [showStocksOnly, setShowStocksOnly] = useState(false);
  if (isPending || !data) return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 360 }}><CircularProgress /></Box>;
  const { summary, holdings } = data; const assetLabel = showStocksOnly ? '주식 평가액' : '총 평가자산'; const assetValue = showStocksOnly ? summary.stockValue : summary.totalAssets;
  return <Stack spacing={2.5}>
    <Box><Typography variant="body2" color="text.secondary">안녕하세요</Typography><Typography variant="h5">오늘의 투자 현황이에요</Typography></Box>
    <Card onClick={() => setShowStocksOnly((current) => !current)} sx={{ cursor: 'pointer', background: 'linear-gradient(145deg, #172554 0%, #111827 70%)' }}><CardContent sx={{ p: 3 }}><Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography color="text.secondary">{assetLabel}</Typography><Chip size="small" label="눌러서 전환" variant="outlined" /></Stack><Typography variant="h4" sx={{ mt: 1, fontWeight: 850 }}>{formatWon(assetValue)}</Typography><Stack direction="row" spacing={1} sx={{ mt: 2 }}><Chip color="success" label={`오늘 ${formatRate(summary.dailyProfitRate)}`} /><Chip color="primary" variant="outlined" label={`누적 ${formatRate(summary.totalProfitRate)}`} /></Stack></CardContent></Card>
    <Grid container spacing={2}><Grid size={{ xs: 6, md: 3 }}><SummaryCard icon={<TrendingUpRounded />} label="오늘 손익" value={formatWon(summary.dailyProfit)} /></Grid><Grid size={{ xs: 6, md: 3 }}><SummaryCard icon={<AccountBalanceWalletRounded />} label="예수금" value={formatWon(summary.cashBalance)} /></Grid></Grid>
    <Box><Typography variant="h6" sx={{ mb: 1.5 }}>보유종목</Typography><Stack spacing={1.2}>{holdings.map((holding) => <Card key={holding.symbol}><CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 2, '&:last-child': { pb: 2 } }}><Box><Typography sx={{ fontWeight: 750 }}>{holding.name}</Typography><Typography variant="caption" color="text.secondary">{holding.quantity}주 · {holding.symbol}</Typography></Box><Box sx={{ textAlign: 'right' }}><Typography sx={{ fontWeight: 700 }}>{formatWon(holding.marketValue)}</Typography><Typography variant="body2" color={holding.profitRate >= 0 ? 'success.main' : 'error.main'}>{formatRate(holding.profitRate)}</Typography></Box></CardContent></Card>)}</Stack></Box>
  </Stack>;
}

function SummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <Card sx={{ height: '100%' }}><CardContent><Box sx={{ color: 'primary.main', mb: 1 }}>{icon}</Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography sx={{ fontWeight: 750 }}>{value}</Typography></CardContent></Card>;
}
