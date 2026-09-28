import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { ApiError } from '../../data/apiClient';
import { fetchLiveDashboard, fetchLiveStocks, liveApiEnabled } from '../../data/liveData';
import { getAccountDashboard, getAccountHoldings, getAccountResetAvailability, getTrades, listAccounts, resetAccountData, type AccountDto } from '../../data/roxstockApi';
import { colors } from '../../styles/tokens';

export function AccountResetSection() {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [enteredName, setEnteredName] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const locked = useRef(false);
  const accounts = useQuery({ queryKey: ['accounts', 'api'], queryFn: listAccounts, enabled: liveApiEnabled });
  const account = accounts.data?.find((item: AccountDto) => item.id === import.meta.env.VITE_API_ACCOUNT_ID && item.isActive)
    ?? (!import.meta.env.VITE_API_ACCOUNT_ID ? accounts.data?.find((item: AccountDto) => item.isActive) : undefined);
  const availability = useQuery({
    queryKey: ['accountResetAvailability', account?.id],
    queryFn: () => getAccountResetAvailability(account!.id),
    enabled: liveApiEnabled && !!account,
    retry: false,
  });
  const available = liveApiEnabled && !!account && availability.data?.enabled === true && availability.data.authorized === true;

  const close = () => {
    if (locked.current) return;
    setOpen(false); setEnteredName(''); setError('');
  };
  const execute = async () => {
    if (!available || !account || enteredName !== account.name || locked.current) return;
    locked.current = true;
    setPending(true); setError(''); setResult('');
    try {
      const response = await resetAccountData(account.id, account.name);
      if (response.accountId !== account.id) throw new Error('초기화 응답의 계좌 ID가 다릅니다. 계좌 상태를 다시 확인해 주세요.');
      setOpen(false); setEnteredName('');
      const affected = (query: { queryKey: readonly unknown[] }) =>
        ['accounts', 'dashboard', 'stocks', 'buyLots', 'journalTrades'].includes(String(query.queryKey[0]));
      await client.cancelQueries({ predicate: affected });
      client.removeQueries({ predicate: affected });
      try {
        const [freshAccounts, dashboard, holdings, trades] = await Promise.all([
          listAccounts(), getAccountDashboard(account.id), getAccountHoldings(account.id), getTrades(account.id),
        ]);
        if (!freshAccounts.some((item) => item.id === account.id)) throw new Error('선택 계좌를 다시 조회할 수 없습니다.');
        client.setQueryData(['accounts', 'api'], freshAccounts);
        client.setQueryData(['dashboard', 'api'], await fetchLiveDashboard());
        client.setQueryData(['stocks', 'holding', 'api'], await fetchLiveStocks('holding'));
        if (Number(dashboard.cashBalance) !== 0 || dashboard.holdings.length || holdings.length || trades.data.length) {
          setResult('초기화 요청은 완료됐지만 재조회 결과가 예상과 다릅니다. 계좌 데이터를 확인해 주세요.');
        } else {
          setResult('계좌 데이터를 초기화했습니다. 거래·보유종목 0건, 예수금 0원을 실제 API로 확인했습니다.');
        }
        await client.invalidateQueries({ predicate: affected });
      } catch (cause) {
        setResult(`초기화 요청은 완료됐지만 화면 데이터를 다시 불러오지 못했습니다: ${cause instanceof Error ? cause.message : '조회 실패'}`);
      }
    } catch (cause) {
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) void availability.refetch();
      setError(cause instanceof Error ? cause.message : '초기화 요청에 실패했습니다.');
    } finally {
      locked.current = false; setPending(false);
    }
  };

  return <Box sx={{ mt: 2, p: 2, border: `1px solid ${colors.border}`, borderRadius: '12px', bgcolor: colors.surface }}>
    <Typography sx={{ fontSize: 14, fontWeight: 700 }}>계좌 데이터 초기화</Typography>
    <Typography sx={{ mt: 1, color: colors.textMuted, fontSize: 12 }}>선택 계좌: {liveApiEnabled ? account?.name ?? (accounts.isPending ? '불러오는 중' : '확인 불가') : 'API 모드가 아닙니다'}</Typography>
    <Typography sx={{ mt: 0.5, color: colors.textMuted, fontSize: 12 }}>초기화 범위: 이 계좌의 매수·매도 거래, 보유종목, 예수금 내역 및 계산 결과. 계좌 ID와 계좌명은 유지됩니다.</Typography>
    {available ? <Button variant="outlined" color="error" sx={{ mt: 1.5 }} onClick={() => { setError(''); setEnteredName(''); setOpen(true); }}>초기화 진행</Button> :
      <Typography role="status" sx={{ mt: 1.5, color: colors.textMuted, fontSize: 12 }}>현재 사용할 수 없는 기능입니다. API 및 관리자 접근 허용 상태를 확인해 주세요.</Typography>}
    {result && <Typography role="status" sx={{ mt: 1, fontSize: 12 }}>{result}</Typography>}
    {error && !open && <Typography role="alert" sx={{ mt: 1, color: 'error.main', fontSize: 12 }}>{error}</Typography>}
    <Dialog open={open} onClose={close} fullWidth maxWidth="xs" aria-labelledby="account-reset-title">
      <DialogTitle id="account-reset-title">계좌 데이터 초기화 확인</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography sx={{ fontSize: 13 }}>‘{account?.name}’ 계좌의 거래, 보유종목, 예수금 데이터를 삭제합니다. 계좌명 <strong>{account?.name}</strong>을 정확히 입력해 주세요.</Typography>
        <TextField label="계좌명 입력" value={enteredName} onChange={(event) => setEnteredName(event.target.value)} autoFocus fullWidth disabled={pending} slotProps={{ htmlInput: { 'aria-label': '초기화할 계좌명' } }} />
        {error && <Typography role="alert" sx={{ color: 'error.main', fontSize: 12 }}>{error}</Typography>}
      </Stack></DialogContent>
      <DialogActions><Button onClick={close} disabled={pending}>취소</Button><Button color="error" variant="contained" onClick={() => void execute()} disabled={pending || !available || enteredName !== account?.name}>최종 초기화</Button></DialogActions>
    </Dialog>
  </Box>;
}
