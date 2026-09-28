import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AppCard } from '../../components/common/Common';
import { PageHeader } from '../../components/navigation/Navigation';
import { ApiError } from '../../data/apiClient';
import { listAccounts, resetAccountData } from '../../data/roxstockApi';
import { colors } from '../../styles/tokens';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: listAccounts });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [completedAccount, setCompletedAccount] = useState('');
  const account = accounts.data?.find((item) => item.isDefault && item.isActive)
    ?? accounts.data?.find((item) => item.isActive);

  const reset = useMutation({
    mutationFn: () => {
      if (!account) throw new Error('초기화할 활성 계좌가 없습니다.');
      return resetAccountData(account.id);
    },
    onSuccess: async () => {
      const accountName = account?.name ?? '';
      setDialogOpen(false);
      setConfirmation('');
      setCompletedAccount(accountName);
      await queryClient.invalidateQueries();
    },
  });

  const closeDialog = () => {
    if (reset.isPending) return;
    setDialogOpen(false);
    setConfirmation('');
    reset.reset();
  };
  const errorMessage = reset.error instanceof ApiError
    ? reset.error.message
    : reset.error instanceof Error ? reset.error.message : '계좌 초기화에 실패했습니다.';

  return <Box>
    <PageHeader title="설정" variant="detail" backPath="/more" showAdd={false} embedded />

    <Stack spacing="16px">
      {completedAccount && <Alert severity="success">{completedAccount} 계좌의 데이터가 초기화되었습니다.</Alert>}

      <AppCard sx={{ p: { xs: '16px', sm: '20px' }, borderRadius: '8px' }}>
        <Typography sx={{ fontSize: 16, fontWeight: 700 }}>계좌 데이터 초기화</Typography>
        <Typography sx={{ mt: '8px', color: colors.textMuted, fontSize: 12, lineHeight: 1.6 }}>
          테스트 중인 선택 계좌의 거래, 보유종목, 예수금 내역과 스냅샷을 모두 삭제합니다. 계좌 자체는 유지됩니다.
        </Typography>

        {accounts.isPending && <Stack direction="row" spacing="8px" sx={{ mt: '18px', alignItems: 'center' }}><CircularProgress size={18} /><Typography sx={{ fontSize: 12 }}>계좌를 확인하고 있습니다.</Typography></Stack>}
        {accounts.isError && <Alert severity="error" sx={{ mt: '16px' }}>계좌 목록을 불러오지 못했습니다.</Alert>}
        {!accounts.isPending && !accounts.isError && !account && <Alert severity="warning" sx={{ mt: '16px' }}>초기화할 활성 계좌가 없습니다.</Alert>}

        {account && <Box sx={{ mt: '18px', p: '14px', border: `1px solid ${colors.border}`, borderRadius: '8px', bgcolor: colors.raised }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
            <Typography sx={{ color: colors.textMuted, fontSize: 12 }}>선택 계좌</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{account.name}</Typography>
          </Stack>
          <Stack direction="row" sx={{ mt: '7px', justifyContent: 'space-between', gap: 2 }}>
            <Typography sx={{ color: colors.textMuted, fontSize: 12 }}>현재 예수금</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{Number(account.cashBalance).toLocaleString('ko-KR')}원</Typography>
          </Stack>
        </Box>}

        <Button
          fullWidth
          variant="contained"
          color="error"
          disabled={!account || accounts.isPending || reset.isPending}
          onClick={() => { setCompletedAccount(''); reset.reset(); setDialogOpen(true); }}
          sx={{ mt: '18px', minHeight: 46, borderRadius: '8px', fontWeight: 700 }}
        >
          계좌 데이터 초기화
        </Button>
      </AppCard>
    </Stack>

    <Dialog open={dialogOpen} onClose={closeDialog} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { bgcolor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: '8px' } } }}>
      <DialogTitle>계좌 데이터 초기화</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: '16px' }}>이 작업은 되돌릴 수 없습니다.</Alert>
        <Typography sx={{ color: colors.textMuted, fontSize: 12, lineHeight: 1.6 }}>
          계속하려면 아래에 계좌명 <strong style={{ color: colors.textPrimary }}>{account?.name}</strong>을 입력해 주세요.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && confirmation === account?.name && !reset.isPending) reset.mutate();
          }}
          placeholder={account?.name}
          disabled={reset.isPending}
          error={confirmation.length > 0 && confirmation !== account?.name}
          helperText={confirmation.length > 0 && confirmation !== account?.name ? '계좌명이 일치하지 않습니다.' : ' '}
          sx={{ mt: '12px' }}
        />
        {reset.isError && <Alert severity="error">{errorMessage}</Alert>}
      </DialogContent>
      <DialogActions sx={{ p: '16px' }}>
        <Button onClick={closeDialog} disabled={reset.isPending}>취소</Button>
        <Button
          variant="contained"
          color="error"
          disabled={confirmation !== account?.name || reset.isPending}
          onClick={() => reset.mutate()}
        >
          {reset.isPending ? '초기화 중…' : '완전 초기화'}
        </Button>
      </DialogActions>
    </Dialog>
  </Box>;
}
