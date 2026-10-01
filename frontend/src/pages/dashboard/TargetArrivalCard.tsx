import { SettingsOutlined } from '@mui/icons-material';
import { Alert, Box, Button, IconButton, Skeleton, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppCard } from '../../components/common/Common';
import { PageHeader } from '../../components/navigation/Navigation';
import type { TargetLot } from '../../data/targetArrivalApi';
import { useTargetArrivals } from '../../hooks/useTargetArrivals';
import { HomeEmpty, HomeListCard, HomeTwoLineRow } from './HomeListCard';
import { colors } from '../../styles/tokens';

export const targetSettingsPath = '/detail/settings?view=target-arrival';
// Group strings directly so large Decimal amounts don't lose digits through Number.
export function targetWon(value: string) {
  const negative = value.startsWith('-');
  const [integer, fraction = ''] = value.replace(/^-/, '').split('.');
  const rounded = BigInt(integer || '0') + (Number(fraction[0] ?? '0') >= 5 ? 1n : 0n);
  return `${negative && rounded > 0n ? '-' : ''}${rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}원`;
}
export const lotDetailPath = (lot: Pick<TargetLot, 'lotId' | 'securityId'>, from = 'targets') => `/trade?${new URLSearchParams({ type: 'buy', edit: lot.lotId, stock: lot.securityId, return: from })}`;

export const lotMarketColor = (value?: string | null) => value == null ? colors.textMuted : Number(value) > 0 ? colors.marketRise : Number(value) < 0 ? colors.marketFall : colors.marketFlat;
export const lotRate = (value?: string | null) => value == null ? '—' : `${Number(value).toFixed(1)}%`;

export function TargetLotRow({ lot, full = false }: { lot: TargetLot; full?: boolean }) {
  const navigate = useNavigate();
  return <HomeTwoLineRow testId="target-lot" large={full} onClick={() => navigate(lotDetailPath(lot, full ? 'targets' : 'home'))}
    first={[lot.name, <Box component="span" aria-label="잔여수량과 매수단가" sx={{ color: colors.textSecondary }}>{Number(lot.remainingQuantity).toLocaleString('ko-KR')} × {targetWon(lot.unitPrice)}</Box>, <Box component="span" aria-label="현재가" sx={{ color: colors.textSecondary }}>{targetWon(lot.currentPrice)}</Box>]}
    second={[<Box component="span" sx={{ color: colors.textSecondary }}>{lot.buyDate.slice(2).replaceAll('-', '.')} ({lot.holdingDays}일)</Box>, <Box component="span" aria-label="평가수익률" sx={{ color: lotMarketColor(lot.returnRate) }}>{lotRate(lot.returnRate)}</Box>, <Box component="span" aria-label="평가이익액" sx={{ color: lotMarketColor(lot.profitLoss) }}>{targetWon(lot.profitLoss)}</Box>]} />;
}

export function TargetArrivalCard({ full = false }: { full?: boolean }) {
  const navigate = useNavigate();
  const query = useTargetArrivals();
  const [visible, setVisible] = useState(20);
  const report = query.data?.meta.accountId === query.accountId ? query.data : undefined;
  const failed = query.isError || query.accounts.isError;
  if (!full) return <HomeListCard testId="target-arrival-card" title="목표가 도래" count={report ? `${report.meta.total}건` : undefined}
    titleAction={() => navigate(targetSettingsPath)}
    notice={failed ? '조회 실패 · 이전 결과' : report?.meta.unavailableCount ? `시세·거래 데이터 판정 불가 ${report.meta.unavailableCount}건 · 확인 가능한 Lot 기준` : undefined} timestamp={report?.meta.priceAsOf} updating={query.isFetching} more={report?.meta.enabled && report.meta.total > 5 ? () => navigate('/detail/target-arrivals') : undefined}>
    {failed && !report && <HomeEmpty>목표가 도래 조회 실패{report && ' · 이전 결과'} <Button size="small" sx={{ minHeight: 20, p: 0 }} onClick={() => { void query.refetch(); void query.accounts.refetch(); }}>재시도</Button></HomeEmpty>}
    {!report && !failed && (query.accountId || query.accounts.isPending ? <Skeleton variant="rounded" height={76} /> : <HomeEmpty>계좌를 선택해 주세요.</HomeEmpty>)}
    {report && !report.meta.enabled && <HomeEmpty>조건이 설정되지 않아 기능이 비활성화되었습니다. <Button onClick={() => navigate(targetSettingsPath)}>조건 설정</Button></HomeEmpty>}
    {report?.meta.enabled && <>
      {report.data.slice(0, 5).map(lot => <TargetLotRow key={lot.lotId} lot={lot} />)}
      {!failed && report.meta.total === 0 && report.meta.unavailableCount === 0 && <HomeEmpty />}
    </>}
  </HomeListCard>;
  return <AppCard data-testid="target-arrival-card" sx={{ minWidth: 0, borderRadius: '8px', p: '12px 14px' }}>
    <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
      <Typography component="h2" sx={{ fontSize: 16, lineHeight: '24px', fontWeight: 600 }}>목표가 도래</Typography>
      <Stack direction="row" sx={{ alignItems: 'center', gap: '4px' }}><Typography sx={{ fontSize: 11, color: colors.textMuted }}>{report ? `전체 ${report.meta.total}건` : '—'}</Typography><IconButton aria-label="목표가 도래 조건 설정" onClick={() => navigate(targetSettingsPath)} size="small" sx={{ p: '3px', color: colors.textMuted }}><SettingsOutlined sx={{ fontSize: 20 }} /></IconButton></Stack>
    </Stack>
    <Typography sx={{ fontSize: 11, color: colors.textSecondary, mb: '8px' }}>보유기간별 목표수익률 달성</Typography>
    {failed && <Alert severity="error" sx={{ p: '4px 8px', fontSize: 11 }}>목표가 도래 조회에 실패했습니다.{report && ' 마지막 성공 결과를 표시합니다.'}<Button size="small" onClick={() => { void query.refetch(); void query.accounts.refetch(); }}>다시 시도</Button></Alert>}
    {!report && !failed && (query.accountId || query.accounts.isPending ? <Skeleton variant="rounded" height={76} /> : <Typography sx={{ fontSize: 12, color: colors.textMuted }}>계좌를 선택하면 목표가 도래 항목을 확인할 수 있습니다.</Typography>)}
    {report && !report.meta.enabled && <Box sx={{ py: 2 }}><Typography sx={{ fontSize: 12 }}>조건이 설정되지 않아 기능이 비활성화되었습니다.</Typography><Button onClick={() => navigate(targetSettingsPath)}>조건 설정</Button></Box>}
    {report?.meta.enabled && <>
      {report.meta.unavailableCount > 0 && <Typography role="status" sx={{ fontSize: 11, color: colors.warning, py: '6px' }}>{report.data.length ? '일부' : '시세·거래 데이터'} 판정 불가 {report.meta.unavailableCount}건 · 건수는 확인 가능한 Lot 기준입니다.</Typography>}
      {!failed && report.meta.total === 0 && report.meta.unavailableCount === 0 && <Typography sx={{ py: 2, fontSize: 12, color: colors.textMuted }}>내용이 없습니다.</Typography>}
      {report.data.slice(0, full ? visible : 5).map(lot => <TargetLotRow key={lot.lotId} lot={lot} full />)}
      {!full && report.meta.total > 5 && <Button sx={{ display: 'block', ml: 'auto', fontSize: 12, color: colors.focus }} onClick={() => navigate('/detail/target-arrivals')}>더보기</Button>}
      {full && visible < report.data.length && <Button sx={{ display: 'block', ml: 'auto' }} onClick={() => setVisible(n => n + 20)}>20건 더 보기</Button>}
    </>}
    {report && <Typography sx={{ mt: '8px', color: colors.textMuted, fontSize: 10, lineHeight: '16px', textAlign: 'right' }}>현재가 기준 {report.meta.priceAsOf ? new Date(report.meta.priceAsOf).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '—'}<br />계산 {new Date(report.meta.calculatedAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })}{query.isFetching ? ' · 갱신 중' : ''}</Typography>}
  </AppCard>;
}

export function TargetArrivalPage() {
  const { accountId } = useTargetArrivals();
  return <><PageHeader embedded compact title="목표가 도래" backPath="/" showAdd={false} showBackTablet /><TargetArrivalCard key={accountId} full /></>;
}
