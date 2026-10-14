import {DelayedSkeleton as Skeleton} from '../../components/common/DelayedSkeleton';
import { Box, Button, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { AppCard } from '../../components/common/Common';
import { getAssetHistory } from '../../data/roxstockApi';
import { colors } from '../../styles/tokens';
import { formatWon } from '../../utils/format';
import {CashTrendFrame} from './CashTrendFrame';
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
  return <CashTrendFrame points={points} range={range} pending={result.isPending} error={result.isError} retry={()=>void result.refetch()} empty={!result.data?.data.length} />;
}
