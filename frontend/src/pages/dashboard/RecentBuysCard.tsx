import { Box, Button, Skeleton } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { getBuyLots } from '../../data/roxstockApi';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { colors } from '../../styles/tokens';
import { HomeEmpty, HomeListCard, HomeTwoLineRow } from './HomeListCard';
import { targetWon, lotMarketColor, lotRate } from './TargetArrivalCard';
import { recentBuys } from './recentBuysData';
import { seoulToday } from '../investment/investmentData';

export function RecentBuysCard() {
  const navigate = useNavigate();
  const { accountId, accounts } = useActiveAccount();
  const [expanded, setExpanded] = useState({ accountId, months: 0 });
  const lock = useRef(false), timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { lock.current=false; return () => clearTimeout(timer.current); }, [accountId]);
  const query = useQuery({ queryKey: ['recentBuys', accountId], queryFn: ({signal}) => getBuyLots(accountId!, undefined, false, signal), enabled: !!accountId, refetchInterval: 60_000 });
  const view = recentBuys(query.data ?? [], seoulToday(), expanded.accountId === accountId ? expanded.months : 0);
  const rows = view.rows;
  const prices = rows.map(row => row.priceUpdatedAt).filter((value): value is string => !!value).sort();
  const failed = query.isError || accounts.isError;
  const more = () => {
    if(lock.current) return;
    lock.current=true;
    setExpanded(previous => ({ accountId, months: (previous.accountId === accountId ? previous.months : 0) + 1 }));
    timer.current=setTimeout(() => { lock.current=false; }, 200);
  };
  return <HomeListCard testId="recent-buys-card" title="최근 매수" count={query.data ? `총 ${rows.length}건` : undefined} timestamp={prices[0]} notice={failed ? <><span>조회 실패 · 이전 결과 </span><Button size="small" onClick={() => void query.refetch()}>재시도</Button></> : undefined} more={view.more ? more : undefined} height={290 + Math.max(0, rows.length-5)*43}>
    {failed && !query.data && <HomeEmpty>최근 매수 조회 실패{query.data && ' · 이전 결과'} <Button size="small" sx={{ minHeight: 20, p: 0 }} onClick={() => { void query.refetch(); void accounts.refetch(); }}>재시도</Button></HomeEmpty>}
    {!query.data && !failed && (accountId || accounts.isPending ? <Skeleton height={70} /> : <HomeEmpty>계좌를 선택해 주세요.</HomeEmpty>)}
    {!failed && query.data && rows.length === 0 && <HomeEmpty />}
    {rows.map(row => <HomeTwoLineRow key={row.id} testId="recent-buy-lot" onClick={() => { if (!lock.current) navigate(`/stocks/${row.security.id}?detailTab=holding`); }}
      first={[row.security.name, <Box component="span" sx={{ color: colors.textSecondary }}>{Number(row.quantity).toLocaleString('ko-KR')} × {targetWon(row.unitPrice)}</Box>, <Box component="span" aria-label="현재가" sx={{ color: colors.textSecondary }}>{row.currentPrice == null ? '—' : targetWon(row.currentPrice)}</Box>]}
      second={[<Box component="span" sx={{ color: colors.textSecondary }}>{row.buyDate?.slice(2).replaceAll('-', '.') ?? new Date(row.boughtAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(2).replaceAll('-', '.')} ({row.holdingDays ?? '—'}일)</Box>, <Box component="span" aria-label="평가수익률" sx={{ color: lotMarketColor(row.returnRate) }}>{lotRate(row.returnRate)}</Box>, <Box component="span" aria-label="평가손익" sx={{ color: lotMarketColor(row.profitLoss) }}>{row.profitLoss == null ? '—' : targetWon(row.profitLoss)}</Box>]} />)}
  </HomeListCard>;
}
