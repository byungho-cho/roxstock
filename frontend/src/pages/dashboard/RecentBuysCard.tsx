import { Box, Button, Skeleton } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getBuyLots } from '../../data/roxstockApi';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { colors } from '../../styles/tokens';
import { HomeEmpty, HomeListCard, HomeTwoLineRow } from './HomeListCard';
import { targetWon, lotMarketColor, lotRate } from './TargetArrivalCard';

export function RecentBuysCard() {
  const navigate = useNavigate();
  const { accountId, accounts } = useActiveAccount();
  const query = useQuery({ queryKey: ['recentBuys', accountId], queryFn: () => getBuyLots(accountId!, undefined, false), enabled: !!accountId, refetchInterval: 60_000 });
  const rows = [...(query.data ?? [])].sort((a, b) => b.boughtAt.localeCompare(a.boughtAt) || (BigInt(a.id) < BigInt(b.id) ? 1 : -1));
  const prices = rows.map(row => row.priceUpdatedAt).filter((value): value is string => !!value).sort();
  const unavailable = rows.filter(row => row.valuationStatus !== 'AVAILABLE').length;
  const failed = query.isError || accounts.isError;
  return <HomeListCard testId="recent-buys-card" title="최근 매수" count={query.data ? `${rows.length}건` : undefined} timestamp={prices[0]} updating={query.isFetching} notice={failed ? '조회 실패 · 이전 결과' : unavailable > 0 ? `시세·거래 데이터 판정 불가 ${unavailable}건` : undefined} more={rows.length > 5 ? () => navigate('/journal?filter=buy') : undefined}>
    {failed && !query.data && <HomeEmpty>최근 매수 조회 실패{query.data && ' · 이전 결과'} <Button size="small" sx={{ minHeight: 20, p: 0 }} onClick={() => { void query.refetch(); void accounts.refetch(); }}>재시도</Button></HomeEmpty>}
    {!query.data && !failed && (accountId || accounts.isPending ? <Skeleton height={70} /> : <HomeEmpty>계좌를 선택해 주세요.</HomeEmpty>)}
    {!failed && query.data && rows.length === 0 && <HomeEmpty />}
    {rows.slice(0, 5).map(row => <HomeTwoLineRow key={row.id} testId="recent-buy-lot" onClick={() => navigate(`/stocks/${row.security.id}?detailTab=holding`)}
      first={[row.security.name, <Box component="span" sx={{ color: colors.textSecondary }}>{Number(row.quantity).toLocaleString('ko-KR')} × {targetWon(row.unitPrice)}</Box>, <Box component="span" aria-label="현재가" sx={{ color: colors.textSecondary }}>{row.currentPrice == null ? '—' : targetWon(row.currentPrice)}</Box>]}
      second={[<Box component="span" sx={{ color: colors.textSecondary }}>{row.buyDate?.slice(2).replaceAll('-', '.') ?? new Date(row.boughtAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(2).replaceAll('-', '.')} ({row.holdingDays ?? '—'}일)</Box>, <Box component="span" aria-label="평가수익률" sx={{ color: lotMarketColor(row.returnRate) }}>{lotRate(row.returnRate)}</Box>, <Box component="span" aria-label="평가손익" sx={{ color: lotMarketColor(row.profitLoss) }}>{row.profitLoss == null ? '—' : targetWon(row.profitLoss)}</Box>]} />)}
  </HomeListCard>;
}
