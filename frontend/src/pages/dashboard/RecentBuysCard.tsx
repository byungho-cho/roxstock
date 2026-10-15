import { Box, Button } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { memo, useEffect, useRef, useState } from 'react';
import { getRecentBuys, type BuyLotDto } from '../../data/roxstockApi';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { colors } from '../../styles/tokens';
import { HomeEmpty, HomeListCard, HomeListBlank, HomeTwoLineRow } from './HomeListCard';
import { targetWon, lotMarketColor, lotRate } from './TargetArrivalCard';
import { storedQueryOptions } from '../../data/storedQueryOptions';
import { seoulToday } from '../investment/investmentData';

export function RecentBuysCard({enabled=true}:{enabled?:boolean}) {
  const { accountId, accounts, page, pageMode, screen } = useActiveAccount();
  const client = useQueryClient();
  const home = pageMode && screen === 'home';
  const [expanded, setExpanded] = useState<{ accountId?: string; months: number }>({ accountId, months: 0 });
  const [moreBusy, setMoreBusy] = useState(false), [moreError, setMoreError] = useState(false);
  const lock = useRef(false), generation = useRef(0);
  useEffect(() => { generation.current++; lock.current = false; setMoreBusy(false); setMoreError(false); return () => { generation.current++; }; }, [accountId]);
  const months = expanded.accountId === accountId ? expanded.months : 0;
  const query = useQuery({ ...storedQueryOptions, staleTime:60_000, queryKey: ['recentBuys', accountId, seoulToday(), months], queryFn: ({signal}) => getRecentBuys(accountId!,months,signal), enabled: !!accountId && enabled && (!home || months > 0), refetchInterval: enabled && (!home || months > 0) ? 60_000 : false, refetchIntervalInBackground:false });
  const report = home && months === 0 ? page.data?.recent ?? undefined : query.data;
  const view = report?.meta;
  const rows = report?.data ?? [];
  const prices = rows.map(row => row.priceUpdatedAt).filter((value): value is string => !!value).sort();
  const failed = accounts.isError || (home && months === 0 ? page.data?.recent === null : query.isError);
  const retry = () => home && months === 0 ? page.refetch() : query.refetch();
  const more = async () => {
    if (lock.current || !accountId || !report) return;
    lock.current = true; setMoreBusy(true); setMoreError(false);
    const currentGeneration = generation.current, nextMonths = months + 1;
    const key = ['recentBuys', accountId, seoulToday(), nextMonths];
    try {
      const next = await client.fetchQuery({ queryKey: key, queryFn: ({signal}) => getRecentBuys(accountId, nextMonths, signal), staleTime: 0 });
      if (currentGeneration !== generation.current) return;
      const ids = new Set(rows.map(row => row.id));
      // Retain existing objects/order; only append previously unseen IDs.
      const merged = [...rows, ...next.data.filter(row => !ids.has(row.id))];
      client.setQueryData(key, { ...next, data: merged, meta: { ...next.meta, count: merged.length } });
      setExpanded({ accountId, months: nextMonths });
    } catch {
      if (currentGeneration === generation.current) setMoreError(true);
    } finally {
      if (currentGeneration === generation.current) { lock.current = false; setMoreBusy(false); }
    }
  };
  return <HomeListCard blankLoading stable pending={!report&&!failed&&(!!accountId||accounts.isPending)} testId="recent-buys-card" title="최근 매수" count={report ? `총 ${view!.count}건` : undefined} timestamp={prices[0]} notice={moreError ? <Button size="small" onClick={() => void more()}>추가 조회 실패 · 재시도</Button> : failed&&report ? <><span>조회 실패 · 이전 결과 </span><Button size="small" onClick={() => void retry()}>재시도</Button></> : undefined} updating={query.isFetching} moreDisabled={moreBusy} more={view?.more ? () => void more() : undefined} height="auto">
    {failed && !report && <HomeEmpty>최근 매수 조회 실패{report && ' · 이전 결과'} <Button size="small" sx={{ minHeight: 20, p: 0 }} onClick={() => { void retry(); void accounts.refetch(); }}>재시도</Button></HomeEmpty>}
    {!report && !failed && (accountId || accounts.isPending ? <HomeListBlank compact/> : <HomeEmpty>계좌를 선택해 주세요.</HomeEmpty>)}
    {!failed && report && rows.length === 0 && <HomeEmpty />}
    {rows.map(row => <RecentBuyRow key={row.id} row={row} />)}
  </HomeListCard>;
}

const RecentBuyRow = memo(function RecentBuyRow({ row }: { row: BuyLotDto }) {
  const navigate = useNavigate();
  return <HomeTwoLineRow testId="recent-buy-lot" onClick={() => navigate(`/stocks/${row.security.id}?detailTab=holding`)}
      first={[row.security.name, <Box component="span" sx={{ color: colors.textSecondary }}>{Number(row.quantity).toLocaleString('ko-KR')} × {targetWon(row.unitPrice)}</Box>, <Box component="span" aria-label="현재가" sx={{ color: colors.textSecondary }}>{row.currentPrice == null ? '—' : targetWon(row.currentPrice)}</Box>]}
      second={[<Box component="span" sx={{ color: colors.textSecondary }}>{row.buyDate?.slice(2).replaceAll('-', '.') ?? new Date(row.boughtAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(2).replaceAll('-', '.')} ({row.holdingDays ?? '—'}일)</Box>, <Box component="span" aria-label="평가수익률" sx={{ color: lotMarketColor(row.returnRate) }}>{lotRate(row.returnRate)}</Box>, <Box component="span" aria-label="평가손익" sx={{ color: lotMarketColor(row.profitLoss) }}>{row.profitLoss == null ? '—' : targetWon(row.profitLoss)}</Box>]} />;
});
