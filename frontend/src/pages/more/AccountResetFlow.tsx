import { Box, Button, Dialog, Stack, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormTextField } from '../../components/forms/Fields';
import { ApiError } from '../../data/apiClient';
import { liveApiEnabled } from '../../data/liveData';
import { getAccountDashboard, getAccountHoldings, getAssetHistory, getCashHistory, getCashOverview, getTrades, listAccounts, resetAccountData } from '../../data/roxstockApi';
import { useMoreAccounts } from './MoreScreens';

type ResetState = 'confirm' | 'pending' | 'success' | 'failure';

export function AccountResetFlow(props: { tablet?: boolean; onClose?: () => void }) {
  const { selected } = useMoreAccounts();
  return <ResetAccountContent key={selected?.id ?? 'none'} {...props} />;
}
function ResetAccountContent({ tablet = false, onClose }: { tablet?: boolean; onClose?: () => void }) {
  const navigate = useNavigate(); const client = useQueryClient();
  const { selected } = useMoreAccounts();
  const [serverDisabled, setServerDisabled] = useState(false);
  const allowed = liveApiEnabled && !!selected?.isActive && !serverDisabled;
  const [entered, setEntered] = useState(''); const [state, setState] = useState<ResetState>('confirm'); const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState(false);
  const lock = useRef(false); const accepted = useRef(false);
  const close = () => { if (lock.current) return; onClose?.(); if (!tablet) navigate('/detail/settings?view=account'); };
  const execute = async () => {
    if (!allowed || !selected || entered !== selected.name || lock.current) return;
    lock.current = true; setState('pending'); setMessage('');
    try {
      if (!accepted.current) {
        const response = await resetAccountData(selected.id);
        if (response.accountId !== selected.id) throw new Error('서버 응답의 계좌 ID가 일치하지 않습니다.');
        accepted.current = true;
      }
      setConfirmation(false);
      const affected = (query: { queryKey: readonly unknown[] }) => ['accounts', 'dashboard', 'stocks', 'buyLots', 'journalTrades', 'targetArrivals', 'recentBuys', 'cashOverview', 'cashTransactions', 'assetHistory', 'cashBalance', 'compound-plans', 'targetSettings', 'investment', 'investment-profit', 'analysis-dashboard', 'analysis-history'].includes(String(query.queryKey[0]));
      await client.cancelQueries({ predicate: affected }); client.removeQueries({ predicate: query => query.queryKey[0] !== 'accounts' && affected(query) });
      const [accounts, dashboard, holdings, trades, cashHistory, cashOverview, assetHistory] = await Promise.all([
        listAccounts(), getAccountDashboard(selected.id), getAccountHoldings(selected.id), getTrades(selected.id),
        getCashHistory(selected.id), getCashOverview(selected.id), getAssetHistory(selected.id),
      ]);
      if (!accounts.some((account) => account.id === selected.id) || dashboard.cashBalance !== null ||
        dashboard.holdings.length || holdings.length || trades.data.length || cashHistory.data.length ||
        cashOverview.recentTransactions.length || cashOverview.account.currentBalance !== null ||
        assetHistory.data.length || assetHistory.summary.returnRate !== null) {
        throw new Error('초기화 후 재조회 결과가 예상과 다릅니다. 계좌 데이터를 확인해 주세요.');
      }
      client.setQueryData(['accounts', 'api'], accounts);
      client.setQueryData(['cashTransactions', selected.id], cashHistory);
      client.setQueryData(['cashOverview', selected.id], cashOverview);
      client.setQueryData(['assetHistory', selected.id], assetHistory);
      await client.invalidateQueries({ predicate: affected });
      setState('success');
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'ACCOUNT_RESET_DISABLED') setServerDisabled(true);
      setMessage(cause instanceof ApiError && cause.code === 'ACCOUNT_RESET_DISABLED' ? '현재 서버에서 계좌 초기화 기능을 비활성화했습니다.' : `${accepted.current ? '초기화 요청이 완료됐지만 재조회 검증에 실패했습니다: ' : ''}${cause instanceof Error ? cause.message : '초기화에 실패했습니다.'}`);
      setState('failure');
    }
    finally { lock.current = false; }
  };
  const finished = ['success', 'failure'].includes(state);
  if (finished) return <Box data-testid="reset-result">
    <Typography sx={{ textAlign: 'center', fontSize: 22, fontWeight: 600, color: state === 'success' ? '#34D399' : '#FA636E' }}>{state === 'success' ? '초기화가 완료되었습니다' : '초기화하지 못했습니다'}</Typography>
    <Typography sx={{ textAlign: 'center', fontSize: 13, color: '#94A3B8', mt: '12px', mb: '24px' }}>{state === 'success' ? '선택 계좌의 데이터를 서버에서 확인했습니다.' : accepted.current ? '초기화 요청 완료 후 재조회에 실패했습니다.' : '입력한 계좌명을 유지했습니다.'}</Typography>
    <Box sx={{ bgcolor: '#0B1220', border: '1px solid #21304A', borderRadius: '8px', p: '13px', minHeight: state === 'failure' ? 118 : undefined }}>
      <Typography sx={{ color: '#94A3B8', fontSize: 11 }}>{state === 'success' ? '현재 예수금' : '오류 안내'}</Typography>
      <Typography role={state === 'failure' ? 'alert' : 'status'} sx={{ textAlign: 'right', fontSize: 13, color: state === 'success' ? '#F8FAFC' : '#FA636E', overflowWrap: 'anywhere', mt: '12px' }}>{state === 'success' ? '— · 예수금 내역 없음' : message}</Typography>
    </Box>
    <Typography sx={{ fontSize: 11, color: '#94A3B8', my: '20px' }}>{state === 'success' ? '계좌와 기본 계좌 설정, 관심종목은 유지됩니다.' : '실패 시 서버에서 제공한 오류 안내를 확인해 주세요.'}</Typography>
    <Button fullWidth variant="contained" color={state === 'failure' ? 'error' : 'primary'} disabled={serverDisabled} sx={{ height: 48, borderRadius: '8px' }} onClick={state === 'success' ? close : () => void execute()}>{state === 'success' ? '확인' : accepted.current ? '재조회' : '다시 시도'}</Button>
  </Box>;
  const content = <Box sx={{ p: 0, minWidth: 0 }}>
    <Box sx={{ p: '13px', border: '1px solid #21304A', borderRadius: '8px', bgcolor: '#0B1220' }}><Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ color: '#94A3B8', fontSize: 11 }}>현재 선택 계좌</Typography><Typography sx={{ color: '#33D48C', fontSize: 11 }}>사용 중</Typography></Stack><Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mt: '6px', gap: 1 }}><Typography sx={{ fontSize: 17, fontWeight: 600 }}>{selected?.name ?? '계좌 없음'}</Typography><Typography sx={{ color: '#94A3B8', fontSize: 11 }}>현재 예수금 {selected?.cashBalance != null ? `${Number(selected.cashBalance).toLocaleString('ko-KR')}원` : '—'}</Typography></Stack></Box>
    {state !== 'success' && <><Box sx={{ p: '12px', mt: '12px', bgcolor: '#241215', border: '1px solid #6B2932', borderRadius: '8px' }}><Typography sx={{ color: '#FA636E', fontSize: 13, fontWeight: 600 }}>되돌릴 수 없는 작업입니다.</Typography></Box><Typography sx={{ color: '#FA636E', fontSize: 14, mt: '16px', mb: '8px' }}>초기화하면 삭제됩니다</Typography><Box sx={{ p: '13px', border: '1px solid #21304A', borderRadius: '8px', bgcolor: '#0B1220' }}><Typography sx={{ color: '#CBD5E1', fontSize: 12, lineHeight: '24px' }}>• 매수·매도 거래 및 Lot 연결<br />• 입금·출금·배당 내역<br />• 보유종목·계좌별 스냅샷·복리계획</Typography><Typography sx={{ color: '#FA636E', fontSize: 12, lineHeight: '24px' }}>• 현재예수금 기준 내역이 없어집니다</Typography></Box><Typography sx={{ color: '#94A3B8', fontSize: 11, mt: '12px' }}>계좌와 기본 계좌 설정, 공통 관심종목은 유지됩니다.</Typography></>}
    {state === 'success' ? <Typography role="status" sx={{ mt: 3, color: '#34D399' }}>초기화 완료 · 거래와 보유종목 0건, 예수금 내역 없음을 서버에서 확인했습니다.</Typography> :
      <Stack spacing={1.5} sx={{ mt: 3 }}>
        <Typography sx={{ fontSize: 13, color: '#F87171' }}>삭제된 데이터는 복구할 수 없습니다.</Typography>
        {allowed ? <><Typography sx={{ fontSize: 12 }}>확인을 위해 계좌명 ‘{selected?.name}’을 입력해 주세요.</Typography><FormTextField size="small" clearIconSrc="/settings-v03/clear.svg" label="계좌명 입력" value={entered} onChange={value => { setEntered(value); setState('confirm'); }} disabled={state === 'pending'} autoFocus enterKeyHint="done" onEnter={() => { if (entered === selected?.name) setConfirmation(true); }} />{entered && entered !== selected?.name && <Typography role="alert" sx={{ fontSize: 11, color: '#F87171' }}>계좌명이 일치하지 않습니다.</Typography>}</> : <Typography role="status" sx={{ color: '#F87171', fontSize: 12 }}>{serverDisabled ? '현재 서버에서 계좌 초기화 기능을 비활성화했습니다.' : 'API 모드가 아니거나 선택된 계좌가 없어 사용할 수 없습니다.'}</Typography>}
        {state === 'failure' && !serverDisabled && <Typography role="alert" sx={{ fontSize: 12, color: '#F87171' }}>{message}</Typography>}
        {state === 'pending' && <Typography role="status" sx={{ fontSize: 12 }}>초기화 중입니다…</Typography>}
      </Stack>}
    <Stack direction="row" spacing={1} sx={{ mt: 3, justifyContent: 'flex-end', display: 'flex' }}><Button variant="outlined" onClick={close} disabled={state === 'pending'}>{state === 'success' ? '확인' : '취소'}</Button>{state !== 'success' && allowed && !accepted.current && <Button variant="contained" color="error" onClick={() => setConfirmation(true)} disabled={entered !== selected?.name || state === 'pending'}>계좌 데이터 초기화</Button>}</Stack>

  </Box>;
  const confirmDialog = <Dialog open={confirmation} onClose={() => { if (!lock.current) setConfirmation(false); }} aria-labelledby="reset-confirm-title" slotProps={{ paper: { sx: { width: 338, maxWidth: 'calc(100vw - 32px)', p: '14px', borderRadius: '8px', backgroundImage: 'none' } } }}>
    <Typography id="reset-confirm-title" sx={{ fontSize: 16, fontWeight: 600 }}>계좌 데이터 초기화</Typography>
    <Typography sx={{ fontSize: 12, my: '14px' }}>{selected?.name}의 거래·예수금 내역·스냅샷·복리계획과 연결 목표를 삭제합니다. 계좌와 기본 계좌 설정·관심종목은 유지됩니다.</Typography>
    <Stack direction="row" spacing="8px"><Button sx={{ flex: 1 }} disabled={state === 'pending'} onClick={() => setConfirmation(false)}>취소</Button><Button sx={{ flex: 1 }} variant="contained" color="error" disabled={state === 'pending'} onClick={() => void execute()}>{state === 'pending' ? '초기화 중…' : '초기화'}</Button></Stack>
  </Dialog>;
  return tablet ? <Dialog open onClose={close} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { bgcolor: '#080D19', maxHeight: 'calc(100dvh - 88px)', m: 1 } } }}><Box sx={{ overflowY: 'auto', p: 1 }}>{content}{confirmDialog}</Box></Dialog> : <>{content}{confirmDialog}</>;
}

