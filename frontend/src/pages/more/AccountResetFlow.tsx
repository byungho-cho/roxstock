import { Box, Button, Dialog, Stack, TextField, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../data/apiClient';
import { fetchLiveDashboard, fetchLiveStocks, liveApiEnabled } from '../../data/liveData';
import { getAccountDashboard, getAccountHoldings, getAssetHistory, getCashHistory, getCashOverview, getTrades, listAccounts, resetAccountData } from '../../data/roxstockApi';
import { useMoreAccounts } from './MoreScreens';

type ResetState = 'confirm' | 'pending' | 'success' | 'failure';

export function AccountResetFlow({ tablet = false, onClose }: { tablet?: boolean; onClose?: () => void }) {
  const navigate = useNavigate(); const client = useQueryClient();
  const { selected } = useMoreAccounts();
  const [serverDisabled, setServerDisabled] = useState(false);
  const allowed = liveApiEnabled && !!selected?.isActive && !serverDisabled;
  const [entered, setEntered] = useState(''); const [state, setState] = useState<ResetState>('confirm'); const [message, setMessage] = useState('');
  const lock = useRef(false); const accepted = useRef(false);
  const close = () => { if (lock.current) return; onClose?.(); if (!tablet) navigate('/detail/settings?view=account'); };
  const execute = async () => {
    if (!allowed || !selected || entered !== selected.name || lock.current) return;
    lock.current = true; setState('pending'); setMessage('');
    try {
      const response = await resetAccountData(selected.id);
      if (response.accountId !== selected.id) throw new Error('서버 응답의 계좌 ID가 일치하지 않습니다.');
      accepted.current = true;
      const affected = (query: { queryKey: readonly unknown[] }) => ['accounts', 'dashboard', 'stocks', 'buyLots', 'journalTrades', 'targetArrivals', 'recentBuys', 'cashOverview', 'cashTransactions', 'assetHistory'].includes(String(query.queryKey[0]));
      await client.cancelQueries({ predicate: affected }); client.removeQueries({ predicate: affected });
      const [accounts, dashboard, holdings, trades, cashHistory, cashOverview, assetHistory] = await Promise.all([
        listAccounts(), getAccountDashboard(selected.id), getAccountHoldings(selected.id), getTrades(selected.id),
        getCashHistory(selected.id), getCashOverview(selected.id), getAssetHistory(selected.id),
      ]);
      if (!accounts.some((account) => account.id === selected.id) || Number(dashboard.cashBalance) !== 0 ||
        dashboard.holdings.length || holdings.length || trades.data.length || cashHistory.data.length ||
        cashOverview.recentTransactions.length || Number(cashOverview.account.currentBalance) !== 0 ||
        assetHistory.data.length || assetHistory.summary.returnRate !== null) {
        throw new Error('초기화 후 재조회 결과가 예상과 다릅니다. 계좌 데이터를 확인해 주세요.');
      }
      client.setQueryData(['accounts', 'api'], accounts);
      client.setQueryData(['cashTransactions', selected.id], cashHistory);
      client.setQueryData(['cashOverview', selected.id], cashOverview);
      client.setQueryData(['assetHistory', selected.id], assetHistory);
      client.setQueryData(['dashboard', 'api'], await fetchLiveDashboard());
      client.setQueryData(['stocks', 'holding', 'api'], await fetchLiveStocks('holding'));
      await client.invalidateQueries({ predicate: affected });
      setState('success');
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'ACCOUNT_RESET_DISABLED') setServerDisabled(true);
      setMessage(cause instanceof ApiError && cause.code === 'ACCOUNT_RESET_DISABLED' ? '현재 서버에서 계좌 초기화 기능을 비활성화했습니다.' : `${accepted.current ? '초기화 요청이 완료됐지만 재조회 검증에 실패했습니다: ' : ''}${cause instanceof Error ? cause.message : '초기화에 실패했습니다.'}`);
      setState('failure');
    }
    finally { lock.current = false; }
  };
  const content = <Box sx={{ p: '16px', bgcolor: '#0E1420', border: '1px solid #25344D', borderRadius: '8px', minWidth: 0 }}>
    <Typography sx={{ fontSize: 17, fontWeight: 700 }}>계좌 데이터 초기화</Typography>
    <Typography sx={{ color: '#94A3B8', fontSize: 12, mt: 1 }}>선택 계좌　{selected?.name ?? '계좌 없음'}</Typography>
    <Typography sx={{ color: '#94A3B8', fontSize: 12, mt: 1 }}>초기화 범위　매수·매도 거래, 보유종목, 예수금 내역 및 계산 결과</Typography>
    <Typography sx={{ color: '#94A3B8', fontSize: 12, mt: 1 }}>계좌 ID와 계좌 정보는 유지됩니다.</Typography>
    {state === 'success' ? <Typography role="status" sx={{ mt: 3, color: '#34D399' }}>초기화 완료 · 거래와 보유종목 0건, 예수금 0원을 서버에서 확인했습니다.</Typography> :
      <Stack spacing={1.5} sx={{ mt: 3 }}>
        <Typography sx={{ fontSize: 13, color: '#F87171' }}>삭제된 데이터는 복구할 수 없습니다.</Typography>
        {allowed ? <><Typography sx={{ fontSize: 12 }}>확인을 위해 계좌명 ‘{selected?.name}’을 입력해 주세요.</Typography><TextField label="계좌명 입력" value={entered} onChange={(event) => { setEntered(event.target.value); setState('confirm'); }} disabled={state === 'pending'} fullWidth autoFocus={tablet} />{entered && entered !== selected?.name && <Typography role="alert" sx={{ fontSize: 11, color: '#F87171' }}>계좌명이 일치하지 않습니다.</Typography>}</> : <Typography role="status" sx={{ color: '#F87171', fontSize: 12 }}>{serverDisabled ? '현재 서버에서 계좌 초기화 기능을 비활성화했습니다.' : 'API 모드가 아니거나 선택된 계좌가 없어 사용할 수 없습니다.'}</Typography>}
        {state === 'failure' && !serverDisabled && <Typography role="alert" sx={{ fontSize: 12, color: '#F87171' }}>{message}</Typography>}
        {state === 'pending' && <Typography role="status" sx={{ fontSize: 12 }}>초기화 중입니다…</Typography>}
      </Stack>}
    <Stack direction="row" spacing={1} sx={{ mt: 3, justifyContent: 'flex-end', display: { xs: 'none', sm: 'flex' } }}><Button variant="outlined" onClick={close} disabled={state === 'pending'}>{state === 'success' ? '확인' : '취소'}</Button>{state !== 'success' && allowed && !accepted.current && <Button variant="contained" color="error" onClick={() => void execute()} disabled={entered !== selected?.name || state === 'pending'}>계좌 데이터 초기화</Button>}</Stack>
    <Stack direction="row" spacing={1} sx={{ position: 'fixed', bottom: 44, left: 0, right: 0, p: 1, bgcolor: '#080D19', display: { xs: 'flex', sm: 'none' }, zIndex: 12 }}><Button variant="outlined" onClick={close} disabled={state === 'pending'} sx={{ flex: 1 }}>{state === 'success' ? '확인' : '취소'}</Button>{state !== 'success' && allowed && !accepted.current && <Button variant="contained" color="error" onClick={() => void execute()} disabled={entered !== selected?.name || state === 'pending'} sx={{ flex: 2 }}>계좌 데이터 초기화</Button>}</Stack>
  </Box>;
  return tablet ? <Dialog open onClose={close} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { bgcolor: '#080D19', maxHeight: 'calc(100dvh - 88px)', m: 1 } } }}><Box sx={{ overflowY: 'auto', p: 1 }}>{content}</Box></Dialog> : content;
}

