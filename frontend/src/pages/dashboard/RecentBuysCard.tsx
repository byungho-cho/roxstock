import { Alert, Box, Button, CardActionArea, Skeleton, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AppCard } from '../../components/common/Common';
import { getBuyLots } from '../../data/roxstockApi';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { colors } from '../../styles/tokens';
import { lotDetailPath, targetWon } from './TargetArrivalCard';

export function RecentBuysCard() {
  const navigate = useNavigate();
  const { accountId } = useActiveAccount();
  const query = useQuery({ queryKey: ['recentBuys', accountId], queryFn: () => getBuyLots(accountId!, undefined, false), enabled: !!accountId, refetchInterval: 60_000 });
  const rows = [...(query.data ?? [])].sort((a, b) => b.boughtAt.localeCompare(a.boughtAt) || (BigInt(a.id) < BigInt(b.id) ? 1 : -1)).slice(0, 5);
  return <AppCard data-testid="recent-buys-card" sx={{ minWidth: 0, borderRadius: '8px', p: '12px 14px' }}>
    <Typography component="h2" sx={{ fontSize: 16, fontWeight: 600, lineHeight: '24px', mb: 1 }}>최근 매수</Typography>
    {query.isError && <Alert severity="error">최근 매수 조회에 실패했습니다.<Button onClick={() => void query.refetch()}>다시 시도</Button></Alert>}
    {accountId && query.isPending ? <Skeleton height={70} /> : !query.isError && rows.length === 0 && <Typography sx={{ py: 2, fontSize: 12, color: colors.textMuted }}>최근 매수 내역이 없습니다.</Typography>}
    <Box sx={{ display: { xs: 'none', sm: 'grid' }, gridTemplateColumns: 'minmax(0,1fr) 48px 96px', gap: '4px', fontSize: 10, color: colors.textMuted, mb: 1 }}><span>매수일 / 종목</span><Box sx={{ textAlign: 'right' }}>매수수량</Box><Box sx={{ textAlign: 'right' }}>매수단가</Box></Box>
    {rows.map(row => <CardActionArea key={row.id} onClick={() => navigate(lotDetailPath({ lotId: row.id, securityId: row.security.id }, 'home'))} sx={{ py: '6px', borderRadius: '4px' }}><Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'minmax(0,1fr) 48px 96px' }, gap: '4px', alignItems: 'start' }}>
      <Typography sx={{ fontSize: { xs: 13, sm: 11 }, lineHeight: '18px', overflowWrap: 'anywhere' }}>{new Date(row.boughtAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(5).replace('-', '.')} {row.security.name}</Typography>
      <Typography sx={{ color: colors.marketFall, fontSize: 11, textAlign: 'right', overflowWrap: 'anywhere' }}>{row.quantity}주<Box component="span" sx={{ display: { sm: 'none' } }}> · 매수단가 {targetWon(row.unitPrice)}</Box></Typography>
      <Typography sx={{ display: { xs: 'none', sm: 'block' }, color: colors.marketFall, fontSize: 11, textAlign: 'right', overflowWrap: 'anywhere' }}>{targetWon(row.unitPrice)}</Typography>
    </Box></CardActionArea>)}
    <Button sx={{ display: 'block', ml: 'auto', fontSize: 12 }} onClick={() => navigate('/journal?filter=buy')}>전체 보기</Button>
  </AppCard>;
}
