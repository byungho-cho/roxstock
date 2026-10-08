import { Box, Button, Skeleton, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { AppCard } from '../../components/common/Common';
import { getAssetHistory } from '../../data/roxstockApi';
import { colors } from '../../styles/tokens';
import { formatWon } from '../../utils/format';
import { SnapshotChart } from '../../components/common/SnapshotChart';
import { useMemo } from 'react';
import { cashSegments } from './cashData';

export function CashTrend({ accountId, range }: { accountId?: string; range: { from: string; to: string } }) {
  const result = useQuery({ queryKey: ['cashTrend', accountId, range.from, range.to], queryFn: () => getAssetHistory(accountId!, range), enabled: !!accountId });
  const points = useMemo(() => {
    const segments = cashSegments(result.data?.data ?? []);
    return segments.flatMap((segment,index)=>[
      ...(index ? [{date:new Date(Date.parse(segment[0].date)-86_400_000).toISOString().slice(0,10), values:{cash:null},text:{cash:'데이터 없음'}}] : []),
      ...segment.map(point=>({date:point.date,values:{cash:point.value},text:{cash:formatWon(point.value)}})),
    ]);
  },[result.data]);
  return <AppCard data-testid="cash-trend" sx={{ p: '8px 16px', borderRadius: '8px', height: { xs: 123, sm: 'max(123px, calc((100dvh - 314px) * 1.5))' }, minHeight: 123, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
    <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: '19px' }}>예수금 변화 추이</Typography>
    <Box sx={{ flex: 1, minHeight: 0, position: 'relative', display:'flex', flexDirection:'column' }}>
      {result.isError ? <Button role="alert" onClick={() => void result.refetch()} sx={{ fontSize: 10, p: 0 }}>추이 조회 실패 · 다시 시도</Button> : result.isPending ? <Skeleton height="100%" /> : !result.data?.data.length ? <Typography role="status" sx={{ fontSize: 10, color: colors.textMuted }}>내용이 없습니다.</Typography> : !points.length ? <Typography role="status" sx={{ fontSize: 10, color: colors.textMuted }}>— · 저장 잔액 미수집</Typography> :
        <SnapshotChart points={points} series={[{key:'cash',label:'예수금',color:colors.marketFall}]} from={range.from} to={range.to} fill testId="cash-trend-chart" ariaLabel="저장된 예수금 · 날짜별 금액 조회" />}
    </Box>
  </AppCard>;
}
