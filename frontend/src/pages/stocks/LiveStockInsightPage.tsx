import {usePageMemory,useReturnNavigation} from '../../hooks/navigation/usePageMemory';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { FinancialRefreshControls } from './FinancialRefreshControls';
import { Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/navigation/Navigation';
import { getSecurityAnalysis, type FinancialStatementDto } from '../../data/roxstockApi';
import { colors } from '../../styles/tokens';
import { DetailCard, DetailRow, money } from './LiveStockDetailPage';

const number = (value: string | null | undefined) => value == null ? null : Number(value);
const rate = (value: number | null) => value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`;
const trillion = (value: string | null) => value == null ? '—' : (Number(value) / 1e12).toLocaleString('ko-KR', { maximumFractionDigits: 1 });
const metricValue = (item: FinancialStatementDto, key: keyof FinancialStatementDto) => {
  const value = item[key];
  return typeof value === 'string' ? trillion(value) : '—';
};

export function LiveStockInsightPage({ mode }: { mode: 'value' | 'financials' }) {
  const {accountId}=useActiveAccount();
  const navigate = useNavigate(); const back=useReturnNavigation();
  const { stockId = '' } = useParams();
  const [annual, setAnnual] = usePageMemory('insightAnnual',true);
  const [selection, setSelection] = usePageMemory<{ year: number; period: string } | null>('insightSelection',null);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: ['securityAnalysis', stockId, accountId, selection?.year ?? null], queryFn: () => getSecurityAnalysis(stockId, selection?.year,accountId), placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === stockId && previousQuery?.queryKey[2] === accountId ? previous : undefined });
  const price = number(data?.security.currentPrice);
  const prior = number(data?.security.previousClosePrice);
  const bps = number(data?.valuation?.bps);
  const roe = number(data?.valuation?.roe);
  const discount = 0.08;
  // RIM per share: BPS + excess earnings per share discounted at the required return.
  // A terminal persistence weight models how long excess earnings continue.
  const fair = (weight: number) => bps !== null && roe !== null ? bps * (1 + (roe / 100 - discount) * weight / discount) : null;
  const upside = price && fair(0.8) !== null ? (fair(0.8)! / price - 1) * 100 : null;
  const w = price && fair(0.8) !== null ? fair(0.8)! / price : null;
  const statements = data?.statements.filter((item) => selection ? item.fiscalYear === selection.year && (selection.period === 'ALL' ? item.periodType !== 'Q4' : item.periodType === selection.period) : annual ? item.periodType === 'ANNUAL' : item.periodType !== 'ANNUAL').slice(0, selection?.period === 'ALL' ? 4 : 3).reverse() ?? [];
  const financialGroups: Array<{ title: string; entries: Array<[string, keyof FinancialStatementDto]> }> = [
    { title: '수익성', entries: [['매출액', 'revenue'], ['영업이익', 'operatingProfit'], ['순이익', 'netIncome']] },
    { title: '안정성', entries: [['자산', 'totalAssets'], ['부채', 'totalLiabilities'], ['자본', 'totalEquity']] },
    { title: '현금흐름', entries: [['영업현금흐름', 'operatingCashFlow'], ['설비투자', 'capitalExpenditure']] },
  ];
  return <Stack spacing={1.5} sx={{ pb: 2 }}>
    <PageHeader embedded showBackTablet showAdd={false} title={data?.security.name ?? (mode === 'value' ? '종목 가치분석' : '종목 재무지표')} subtitle={data?.security.symbol} onBack={back} />
    {isPending ? <DetailCard title={mode === 'value' ? '현재 가치 요약' : '전체 재무지표'}><Stack role="status" aria-label="데이터를 불러오는 중"><Skeleton /><Skeleton /><Skeleton /></Stack></DetailCard> : isError && !data ? <DetailCard title="조회 결과"><Button role="alert" onClick={() => void refetch()}>조회 실패 · 다시 시도</Button></DetailCard> : mode === 'value' ? <>
      <DetailCard title="현재 가치 요약"><DetailRow label="현재가" value={money(price)} /><DetailRow label="전일대비" value={price !== null && prior ? money(price - prior) : '—'} /><DetailRow label="W (적정가 ÷ 현재가)" value={w === null ? '—' : w.toFixed(2)} /><DetailRow label="상승여력 (W 0.8 기준)" value={rate(upside)} /></DetailCard>
      <DetailCard title="적정주가 · RIM">{[0.7, 0.8, 0.9, 1].map((weight) => <DetailRow key={weight} label={`W ${weight.toFixed(1)}`} value={money(fair(weight))} />)}</DetailCard>
      <DetailCard title="계산 기준"><DetailRow label="BPS" value={money(bps)} /><DetailRow label="ROE" value={rate(roe)} /><DetailRow label="요구수익률" value="8.0%" /><DetailRow label="지표 기준일" value={data?.valuation?.metricDate ?? '—'} /><Typography sx={{ mt: 1, fontSize: 11, color: colors.textMuted }}>적정가 = BPS × [1 + (ROE − 8%) × 지속계수 ÷ 8%]. 입력 지표가 없으면 계산값을 표시하지 않습니다.</Typography></DetailCard>
      <DetailCard title="핵심 재무지표"><DetailRow label="EPS" value={money(number(data?.valuation?.eps))} /><DetailRow label="PER" value={data?.valuation?.per ?? '—'} /><DetailRow label="PBR" value={data?.valuation?.pbr ?? '—'} /><DetailRow label="배당수익률" value={rate(number(data?.valuation?.dividendYield))} /></DetailCard>
    </> : <>
      <FinancialRefreshControls key={stockId} stockId={stockId} onSelection={(year, period) => setSelection({ year, period })} collectedAt={data?.statements.flatMap((s) => s.dartSource ? [s.dartSource.collectedAt] : []).sort().at(-1) ?? null} />
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}><Typography sx={{ fontWeight: 600, fontSize: 13 }}>전체 재무지표</Typography><Button variant="outlined" onClick={() => { setSelection(null); setAnnual((value) => !value); }}>{annual ? '연간 ↕' : '분기 ↕'}</Button></Stack>
      {!annual && statements.some((item) => item.isDerived) && <Typography sx={{ fontSize: 11, color: colors.textMuted, overflowWrap: 'anywhere' }}>Q4*는 연간 누적에서 3분기 누적을 뺀 계산값입니다. 연결/별도 구분이 같은 자료끼리 계산합니다.</Typography>}
      {!statements.length ? <Typography sx={{ color: colors.textMuted }}>등록된 {annual ? '연간' : '분기'} 재무 데이터가 없습니다.</Typography> : <>{financialGroups.map((group) => <Box key={group.title}><Typography sx={{ my: 1, color: colors.warning, fontSize: 13, fontWeight: 700 }}>{group.title}</Typography><Stack spacing={1}>{group.entries.map(([label, key]) => <DetailCard key={key} title={`${label} · 조원`}><Stack direction="row">{statements.map((statement) => <Box key={`${statement.fiscalYear}-${statement.periodType}`} sx={{ flex: 1, textAlign: 'center' }}><Typography sx={{ fontSize: 10, color: colors.textMuted }}>{statement.fiscalYear}{annual && !selection ? '' : ` ${statement.periodType}${statement.isDerived ? '*' : ''}`}</Typography><Typography sx={{ fontSize: 12, fontWeight: 700 }}>{metricValue(statement, key)}</Typography></Box>)}</Stack></DetailCard>)}</Stack></Box>)}<Box sx={{ borderTop: `1px solid ${colors.border}`, pt: 1 }}><Typography sx={{ fontSize: 11, color: colors.textMuted, overflowWrap: 'anywhere' }}>공시 출처: {statements.filter((item) => item.dartSource).map((item) => `${item.fiscalYear} ${item.periodType} ${item.dartSource?.fsDivision} · 접수 ${item.dartSource?.receiptNo}`).join(' / ') || '수동 입력'}</Typography></Box></>}
    </>}
  </Stack>;
}

