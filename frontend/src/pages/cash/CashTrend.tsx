import { Box, Button, Skeleton, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { AppCard } from '../../components/common/Common';
import { getAssetHistory } from '../../data/roxstockApi';
import { colors } from '../../styles/tokens';
import { formatWon } from '../../utils/format';
import { cashSegments } from './cashData';

export function CashTrend({ accountId, range }: { accountId?: string; range: { from: string; to: string } }) {
  const result = useQuery({ queryKey: ['cashTrend', accountId, range.from, range.to], queryFn: () => getAssetHistory(accountId!, range), enabled: !!accountId });
  const segments = cashSegments(result.data?.data ?? []), points = segments.flat();
  const values = points.map(p => p.value), min = Math.min(...values), max = Math.max(...values);
  const from = Date.parse(range.from), duration = Math.max(86_400_000, Date.parse(range.to) - from);
  const position = (point: typeof points[number]) => `${(Date.parse(point.date) - from) / duration * 1000},${max === min ? 50 : 92 - (point.value - min) / (max - min) * 84}`;
  return <AppCard data-testid="cash-trend" sx={{ p: '8px 16px', borderRadius: '8px', height: { xs: 123, sm: 'max(123px, calc((100dvh - 314px) * 1.5))' }, minHeight: 123, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: '19px' }}>예수금 변화 추이</Typography>
    <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
      {result.isError ? <Button role="alert" onClick={() => void result.refetch()} sx={{ fontSize: 10, p: 0 }}>추이 조회 실패 · 다시 시도</Button> : result.isPending ? <Skeleton height="100%" /> : !result.data?.data.length ? <Typography role="status" sx={{ fontSize: 10, color: colors.textMuted }}>내용이 없습니다.</Typography> : !points.length ? <Typography role="status" sx={{ fontSize: 10, color: colors.textMuted }}>— · 저장 잔액 미수집</Typography> :
        <Box component="svg" data-testid="cash-trend-chart" role="img" aria-label={`${range.from}부터 ${range.to}까지 저장된 예수금 잔액`} viewBox="0 0 1000 100" preserveAspectRatio="none" sx={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}>
          {[8, 50, 92].map(y => <line key={y} x1="0" y1={y} x2="1000" y2={y} stroke={colors.border} vectorEffect="non-scaling-stroke" />)}
          {segments.map((segment, i) => <g key={i} data-testid="cash-trend-segment">{segment.length > 1 && <polyline points={segment.map(position).join(' ')} fill="none" stroke={colors.focus} strokeWidth="2" vectorEffect="non-scaling-stroke" />}{segment.map(p => { const [x, y] = position(p).split(','); return <circle key={p.date} cx={x} cy={y} r="2" fill={colors.focus}><title>{p.date} · {formatWon(p.value)}</title></circle>; })}</g>)}
        </Box>}
    </Box>
  </AppCard>;
}
