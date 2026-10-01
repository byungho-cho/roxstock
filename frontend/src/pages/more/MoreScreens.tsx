import { Box, Button, ButtonBase, FormControlLabel, Radio, Stack, Switch, TextField, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { liveApiEnabled } from '../../data/liveData';
import { addDemoAccount, changeDemoCash, editDemoAccount, readDemoSettings, saveDemoSettings } from '../../data/mockMoreSettings';
import { chooseAccount, correctCashBalance, createAccount, getCollectionStatus, listAccounts, selectedAccountStorageKey, updateAccount, type AccountDto } from '../../data/roxstockApi';
import { colors } from '../../styles/tokens';

export type MoreView = 'target-arrival' | 'settings' | 'account' | 'add' | 'edit' | 'cash' | 'collection' | 'theme' | 'reset';
const panel = { bgcolor: '#0E1420', border: '1px solid #1F2B42', borderRadius: '8px', p: '16px', minWidth: 0 } as const;
const row = { bgcolor: '#111825', border: '1px solid #25344D', borderRadius: '8px' } as const;
const fmt = (value: string | number) => `${Number(value).toLocaleString('ko-KR')}원`;
const hint = { fontSize: 11, color: '#7A859E' } as const;
const heading = { fontSize: 18, fontWeight: 600, lineHeight: '26px' } as const;

export function useMoreAccounts() {
  const client = useQueryClient();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((value) => value + 1);
    window.addEventListener('roxstock-demo-settings', listener);
    window.addEventListener('roxstock-selected-account', listener);
    return () => { window.removeEventListener('roxstock-demo-settings', listener); window.removeEventListener('roxstock-selected-account', listener); };
  }, []);
  const query = useQuery({ queryKey: ['accounts', 'api'], queryFn: listAccounts, enabled: liveApiEnabled });
  void version;
  const demo = readDemoSettings();
  const accounts = liveApiEnabled ? (query.data ?? []) : demo.accounts;
  const selected = liveApiEnabled ? chooseAccount(accounts) : accounts.find((item) => item.id === demo.selectedId) ?? accounts[0];
  const refresh = async () => {
    if (!liveApiEnabled) return;
    await client.invalidateQueries({ predicate: (item) => ['accounts', 'dashboard', 'stocks', 'buyLots', 'journalTrades'].includes(String(item.queryKey[0])) });
  };
  const select = async (id: string) => {
    if (liveApiEnabled) { localStorage.setItem(selectedAccountStorageKey, id); window.dispatchEvent(new Event('roxstock-selected-account')); await refresh(); }
    else saveDemoSettings({ selectedId: id });
  };
  return { accounts, selected, query, demo, refresh, select };
}

function LabelledCard({ title, description, children, sx }: { title?: string; description?: string; children: ReactNode; sx?: object }) {
  return <Box sx={{ ...panel, ...sx }}>
    {title && <Typography sx={{ ...heading, fontSize: 16 }}>{title}</Typography>}
    {description && <Typography sx={{ ...hint, mt: '3px' }}>{description}</Typography>}
    {children}
  </Box>;
}

function LinkRow({ title, caption, value, onClick, active = false }: { title: string; caption?: string; value?: string; onClick: () => void; active?: boolean }) {
  return <ButtonBase onClick={onClick} sx={{ ...row, width: '100%', minHeight: { xs: caption ? 72 : 48, sm: 48 }, px: '13px', py: '10px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 1, ...(active ? { bgcolor: '#14386B', borderColor: '#3C85F2' } : {}) }}>
    <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontSize: 13, color: '#E8EDF7', fontWeight: active ? 600 : 400 }}>{title}</Typography>{caption && <Typography sx={{ ...hint, display: { xs: 'block', sm: 'none' }, mt: 0.5 }}>{caption}</Typography>}</Box>
    {value && <Typography sx={{ fontSize: 11, color: active ? '#E8EDF7' : '#7A859E', whiteSpace: 'nowrap' }}>{value}</Typography>}
    <Typography sx={{ color: '#7A859E', fontSize: 19, lineHeight: 1 }}>›</Typography>
  </ButtonBase>;
}

export function SettingsOverview() {
  const navigate = useNavigate();
  const { accounts } = useMoreAccounts();
  const [theme, setTheme] = useState(readDemoSettings().theme);
  const chooseTheme = (value: 'dark' | 'light' | 'system') => { setTheme(value); saveDemoSettings({ theme: value }); };
  const go = (view: MoreView) => navigate(`/detail/settings?view=${view}`);
  return <Box sx={{ ...panel, height: { sm: '100%' }, overflowY: { sm: 'auto' }, bgcolor: { xs: 'transparent', sm: panel.bgcolor }, border: { xs: 0, sm: panel.border }, p: { xs: 0, sm: '16px' } }}>
    <Typography sx={{ ...heading, display: { xs: 'none', sm: 'block' } }}>설정</Typography>
    <Stack spacing="12px" sx={{ mt: { xs: 0, sm: '12px' } }}>
      <LinkRow title="계좌 관리" caption="계좌 정보와 현재 예수금을 관리합니다." value={`${accounts.length}개 계좌`} onClick={() => go('account')} />
      <LinkRow title="목표가 도래 조건" caption="선택 계좌의 보유기간별 목표수익률을 편집합니다." onClick={() => go('target-arrival')} />
      <LinkRow title="시세 수집" caption="최근 수집 상태를 확인합니다." value="상태 조회" onClick={() => go('collection')} />
      <LinkRow title="테마 설정" caption="앱 화면의 테마를 선택합니다." value={theme === 'dark' ? '다크' : theme === 'light' ? '라이트' : '시스템 설정'} onClick={() => go('theme')} active={false} />
      <Box sx={{ display: { xs: 'none', sm: 'block' }, pt: '2px' }}>
        <Stack direction="row" spacing="8px">{(['dark', 'light', 'system'] as const).map((value) => <ButtonBase key={value} onClick={() => chooseTheme(value)} sx={{ ...row, flex: 1, height: 54, color: colors.textPrimary, fontSize: 11, bgcolor: theme === value ? '#3B82F6' : '#0E1420', borderColor: theme === value ? '#60A5FA' : '#25344D' }}>{value === 'dark' ? '다크' : value === 'light' ? '라이트' : '시스템 설정'}</ButtonBase>)}</Stack>
        <Typography sx={{ ...hint, mt: 1.5 }}>기본 테마는 다크이며, 변경 즉시 전체 화면에 적용됩니다.</Typography>
      </Box>
    </Stack>
  </Box>;
}

export function AccountManagement({ openReset }: { openReset: () => void }) {
  const navigate = useNavigate();
  const { accounts, selected, query, select } = useMoreAccounts();
  const allowed = liveApiEnabled && !!selected?.isActive;
  const go = (view: MoreView) => navigate(`/detail/settings?view=${view}`);
  if (liveApiEnabled && query.isPending) return <LabelledCard title="등록 계좌"><Typography role="status" sx={{ ...hint, mt: 2 }}>계좌 목록을 불러오는 중입니다.</Typography></LabelledCard>;
  if (liveApiEnabled && query.isError) return <Button onClick={() => void query.refetch()} role="alert">계좌 조회 실패 · 다시 시도</Button>;
  const accountList = <LabelledCard title="등록 계좌" description="현재 사용 중인 계좌 정보입니다." sx={{ height: { sm: '100%' }, overflowY: { sm: 'auto' }, bgcolor: { xs: 'transparent', sm: panel.bgcolor }, border: { xs: 0, sm: panel.border }, p: { xs: 0, sm: '16px' }, '& > .MuiTypography-root:nth-of-type(-n+2)': { display: { xs: 'none', sm: 'block' } } }}>
    {accounts.length === 0 ? <Typography sx={{ ...hint, mt: 2 }}>등록된 계좌가 없습니다. 계좌를 추가해 주세요.</Typography> :
      <Stack spacing={1} sx={{ mt: { xs: 0, sm: 2 } }}>{accounts.map((item) => <ButtonBase key={item.id} onClick={() => void select(item.id)} sx={{ ...row, p: '14px', width: '100%', textAlign: 'left', display: 'block', borderColor: selected?.id === item.id ? '#334155' : '#25344D' }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={{ color: '#E8EDF7', fontSize: 16, fontWeight: 600 }}>{item.name}</Typography><Typography sx={{ color: '#34D399', fontSize: 11 }}>{item.isDefault ? '기본 계좌' : selected?.id === item.id ? '사용 중' : '선택'}</Typography></Stack>
        <Typography sx={{ ...hint, mt: 1 }}>현재 예수금</Typography><Typography sx={{ fontSize: { xs: 23, sm: 14 }, color: colors.textPrimary, textAlign: { xs: 'left', sm: 'right' } }}>{fmt(item.cashBalance)}</Typography>
        <Typography sx={{ ...hint, mt: 1 }}>최근 수정 {item.updatedAt ? new Date(item.updatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '—'}</Typography>
      </ButtonBase>)}</Stack>}
    <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
      {selected && <Button variant="outlined" sx={{ flex: 1 }} onClick={() => go('edit')}>계좌 정보 수정</Button>}
      {selected && <Button variant="contained" sx={{ flex: 1 }} onClick={() => go('cash')}>예수금 수정</Button>}
      {!selected && <Button variant="contained" sx={{ flex: 1 }} onClick={() => go('add')}>계좌 추가</Button>}
    </Stack>
    {selected && <Button variant="text" onClick={() => go('add')} sx={{ mt: 1.5, fontSize: 11 }}>+ 계좌 추가</Button>}
    <Box sx={{ mt: 2, pt: 1, borderTop: '1px solid #25344D' }}><Typography sx={{ color: '#F87171', fontSize: 11 }}>위험 영역</Typography>
      {selected && (allowed ? <Button variant="outlined" color="error" sx={{ mt: 1, width: '100%' }} onClick={openReset}>계좌 데이터 초기화</Button> : <ButtonBase onClick={openReset} sx={{ ...row, mt: 1, p: 1.5, width: '100%', display: 'block', textAlign: 'left' }}><Typography sx={{ fontSize: 13, color: '#94A3B8' }}>계좌 데이터 초기화</Typography><Typography sx={hint}>현재 환경에서는 사용할 수 없습니다. 안내 보기 ›</Typography></ButtonBase>)}
    </Box>
  </LabelledCard>;
  const rules = <LabelledCard title="예수금 반영 기준" description="커버 화면과 동일한 관리 원칙을 사용합니다." sx={{ height: { sm: '100%' } }}>
    <Box sx={{ ...row, p: 2, mt: 2 }}><Typography sx={{ fontSize: 13, fontWeight: 600 }}>실제 증권계좌 잔액 기준</Typography><Typography sx={hint}>예수금은 실제 계좌 잔액을 기준으로 직접 수정하며 입력 즉시 전체 자산에 반영합니다.</Typography></Box>
    <Typography sx={{ ...hint, display: { xs: 'block', sm: 'none' }, mt: 1 }}>실제 증권계좌 잔액을 기준으로 직접 수정합니다.</Typography>
  </LabelledCard>;
  return <Box sx={{ display: { xs: 'flex', sm: 'grid' }, flexDirection: 'column', gridTemplateColumns: { sm: 'repeat(2, minmax(0,1fr))' }, gap: '16px', height: { sm: '100%' } }}>{accountList}{rules}</Box>;
}

export function AccountForm({ add }: { add: boolean }) {
  const navigate = useNavigate(); const client = useQueryClient();
  const { selected, accounts, refresh } = useMoreAccounts();
  const [name, setName] = useState(add ? '' : selected?.name ?? '');
  const [broker, setBroker] = useState(add ? '' : selected?.brokerName ?? '');
  const [number, setNumber] = useState(add ? '' : selected?.accountNumber ?? '');
  const [isDefault, setDefault] = useState(add ? accounts.length === 0 : !!selected?.isDefault);
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (!add && selected) { setName(selected.name); setBroker(selected.brokerName); setNumber(selected.accountNumber ?? ''); setDefault(!!selected.isDefault); } }, [add, selected?.id]);
  const submit = async () => {
    if (!name.trim() || !broker.trim() || saving || (!add && !selected)) return;
    setSaving(true); setError('');
    try {
      const input = { name: name.trim(), brokerName: broker.trim(), accountNumber: number.trim() || null, isDefault };
      if (liveApiEnabled) {
        const result = add ? await createAccount(input) : await updateAccount(selected!.id, input);
        if (add) { localStorage.setItem(selectedAccountStorageKey, result.id); window.dispatchEvent(new Event('roxstock-selected-account')); }
        await refresh();
        await client.fetchQuery({ queryKey: ['accounts', 'api'], queryFn: listAccounts, staleTime: 0 });
      } else if (add) addDemoAccount(input); else editDemoAccount(selected!.id, input);
      navigate('/detail/settings?view=account');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '계좌 변경에 실패했습니다.'); }
    finally { setSaving(false); }
  };
  const field = (label: string, value: string, setter: (value: string) => void) => <TextField fullWidth label={label} value={value} onChange={(event) => setter(event.target.value)} sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#111825', minHeight: 48 } }} />;
  return <Box sx={{ display: { xs: 'block', sm: 'grid' }, gridTemplateColumns: { sm: 'repeat(2,minmax(0,1fr))' }, gap: '16px', height: { sm: '100%' } }}>
    <LabelledCard title={add ? '계좌 추가' : '계좌 정보'} description={add ? '새 계좌 정보를 입력합니다.' : '현재가를 제외한 계좌 정보를 수정합니다.'} sx={{ height: { sm: '100%' } }}>
      <Stack spacing={1.25} sx={{ mt: 2 }}>{field('계좌명', name, setName)}{field('증권사', broker, setBroker)}{field('계좌번호', number, setNumber)}</Stack>
      <FormControlLabel sx={{ mt: 1.5 }} label="기본 계좌로 사용" control={<Switch checked={isDefault} onChange={(event) => setDefault(event.target.checked)} disabled={!add && selected?.isDefault} />} />
      {error && <Typography role="alert" color="error">{error}</Typography>}
      <Button variant="contained" disabled={!name.trim() || !broker.trim() || saving} onClick={() => void submit()} sx={{ mt: 2, width: '100%', display: { xs: 'none', sm: 'flex' } }}>{saving ? '저장 중…' : add ? '추가' : '변경'}</Button>
    </LabelledCard>
    <LabelledCard title="입력 안내" description="계좌번호는 목록에서 일부만 표시됩니다." sx={{ display: { xs: 'none', sm: 'block' } }}>
      <Typography sx={{ ...hint, mt: 3 }}>저장 형식　 문자열</Typography><Typography sx={{ ...hint, mt: 2 }}>기본 계좌　1개만 선택</Typography><Typography sx={{ ...hint, mt: 2 }}>반영 시점　저장 즉시</Typography>
    </LabelledCard>
    <MobileAction onClick={() => void submit()} disabled={!name.trim() || !broker.trim() || saving} label={saving ? '저장 중…' : add ? '추가' : '변경'} />
  </Box>;
}

function MobileAction({ onClick, disabled, label, danger }: { onClick: () => void; disabled?: boolean; label: string; danger?: boolean }) {
  return <Box sx={{ display: { xs: 'block', sm: 'none' }, position: 'fixed', bottom: '44px', left: 0, right: 0, px: '16px', py: '12px', bgcolor: colors.canvas, zIndex: 9 }}><Button variant="contained" color={danger ? 'error' : 'primary'} fullWidth disabled={disabled} onClick={onClick} sx={{ height: 42 }}>{label}</Button></Box>;
}

export function CashAdjustment() {
  const { selected, query } = useMoreAccounts(); const navigate = useNavigate();
  const client = useQueryClient();
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const base = selected?.cashBalance ?? '';
  const [amount, setAmount] = useState(base);
  useEffect(() => { setAmount(base); }, [base, selected?.id]);
  const value = Number(amount.replaceAll(',', '')); const delta = value - Number(base);
  const submit = async () => {
    if (!selected || saving || !Number.isFinite(value) || value < 0) return;
    setSaving(true); setError('');
    try {
      if (liveApiEnabled) {
        await correctCashBalance(selected.id, String(value));
        await Promise.all(['accounts', 'dashboard', 'cashBalance', 'cashOverview', 'assetHistory'].map((key) => client.invalidateQueries({ queryKey: [key] })));
      } else changeDemoCash(selected.id, String(value));
      navigate('/detail/settings?view=account');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '예수금 수정에 실패했습니다.'); }
    finally { setSaving(false); }
  };
  if (liveApiEnabled && query.isPending) return <LabelledCard title="계좌 정보"><Typography role="status" sx={{ ...hint, mt: 2 }}>계좌를 불러오는 중입니다.</Typography></LabelledCard>;
  if (liveApiEnabled && query.isError) return <Button role="alert" onClick={() => void query.refetch()}>계좌 조회 실패 · 다시 시도</Button>;
  if (liveApiEnabled && !selected) return <Typography role="status">선택된 계좌가 없습니다.</Typography>;
  return <Box sx={{ display: { xs: 'block', sm: 'grid' }, gridTemplateColumns: { sm: 'repeat(2,minmax(0,1fr))' }, gap: '16px', height: { sm: '100%' } }}>
    <LabelledCard title="예수금 수정" description="모든 금액은 원 단위 숫자로 입력합니다.">
      <Typography sx={{ ...hint, mt: 2 }}>현재 예수금</Typography><Typography sx={{ ...row, p: 1.5, mt: 1, textAlign: 'right' }}>{fmt(base)}</Typography>
      <TextField fullWidth label="변경 예수금" inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, ''))} sx={{ mt: 1.5 }} />
      {error && <Typography role="alert" color="error">{error}</Typography>}
      <Button onClick={() => void submit()} variant="contained" disabled={saving || !Number.isFinite(value) || value < 0} sx={{ mt: 2, width: '100%', display: { xs: 'none', sm: 'flex' } }}>{saving ? '저장 중…' : '변경'}</Button>
    </LabelledCard>
    <LabelledCard title="변경 후 예수금" description="입력한 금액으로 즉시 변경됩니다.">
      <Typography sx={{ textAlign: 'right', fontWeight: 600, mt: 3 }}>{Number.isFinite(value) ? fmt(value) : '—'}</Typography>
      <Typography sx={{ textAlign: 'right', color: delta >= 0 ? colors.marketRise : colors.marketFall, mt: 2 }}>변경 금액 {Number.isFinite(delta) ? `${delta >= 0 ? '+' : ''}${fmt(delta)}` : '—'}</Typography>
      <Typography sx={{ ...hint, mt: 4 }}>저장 후 과거 거래내역은 자동으로 재계산하지 않습니다.</Typography>
    </LabelledCard>
    <MobileAction onClick={() => void submit()} disabled={saving || !Number.isFinite(value) || value < 0} label={saving ? '저장 중…' : '변경'} />
  </Box>;
}

export function CollectionSettings() {
  const status = useQuery({ queryKey: ['collectionStatus'], queryFn: getCollectionStatus, enabled: liveApiEnabled, refetchInterval: 60_000 });
  const run = status.data?.latestRun;
  const dateLabel = (value: string | null | undefined) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '기록 없음';
  const detail = <Stack spacing={2} sx={{ mt: 3 }}>
    {[['수집 상태', status.isPending ? '조회 중' : run?.status ?? '기록 없음'], ['최근 수집', dateLabel(run?.finishedAt ?? run?.startedAt)], ['최근 시세', dateLabel(status.data?.latestPriceAt)], ['수집 실패', run ? `${run.failureCount}건` : '—']].map(([label, value]) => <Stack key={label} direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={hint}>{label}</Typography><Typography sx={{ fontSize: 12 }}>{value}</Typography></Stack>)}
  </Stack>;
  return <Box sx={{ display: { xs: 'block', sm: 'grid' }, gridTemplateColumns: { sm: 'repeat(2,minmax(0,1fr))' }, gap: '12px', height: { sm: '100%' } }}>
    <LabelledCard title="수집 상태" description="서버의 최근 자동 수집 상태를 확인합니다.">{detail}{status.isError && <Button role="alert" onClick={() => void status.refetch()}>수집 상태 조회 실패 · 다시 시도</Button>}{run?.failureReason && <Typography sx={{ ...hint, mt: 1 }}>{run.failureReason}</Typography>}</LabelledCard>
    <LabelledCard title="수집 설정" description="장 운영 중 현재가를 설정 주기로 갱신합니다." sx={{ mt: { xs: 1.5, sm: 0 } }}>
      <Typography sx={{ ...hint, mt: 2 }}>자동 수집은 서버 작업에서 관리합니다. 앱에서 주기 변경과 수동 실행은 제공하지 않습니다.</Typography>
      <Button disabled variant="outlined" sx={{ mt: 2 }}>지금 수집 · 서버 미지원</Button>
    </LabelledCard>
  </Box>;
}

export function ThemeSettings() {
  const [theme, setTheme] = useState(readDemoSettings().theme);
  return <LabelledCard title="테마 선택" description="커버와 동일한 세 가지 테마 값을 사용합니다.">
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>{(['dark', 'light', 'system'] as const).map((value) => <ButtonBase key={value} onClick={() => { setTheme(value); saveDemoSettings({ theme: value }); }} sx={{ ...row, p: '16px', minHeight: { xs: 62, sm: 180 }, textAlign: 'left', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch', bgcolor: theme === value ? '#3B82F6' : '#111825', borderColor: theme === value ? '#60A5FA' : '#25344D' }}><Typography sx={{ fontSize: 15, fontWeight: 600 }}>{value === 'dark' ? '다크' : value === 'light' ? '라이트' : '시스템 설정'}</Typography><Typography sx={{ ...hint, color: theme === value ? '#D9E7FF' : '#7A859E' }}>{value === 'dark' ? '어두운 화면으로 표시합니다.' : value === 'light' ? '밝은 화면으로 표시합니다.' : '기기의 테마 설정을 따릅니다.'}</Typography><Typography sx={{ fontSize: 11, mt: { sm: 'auto' } }}>{theme === value ? '● 선택됨' : '○'}</Typography></ButtonBase>)}</Stack>
    <Typography sx={{ ...hint, mt: 2 }}>기본 테마는 다크입니다. 변경 즉시 전체 화면에 적용됩니다.</Typography>
    <Typography role="status" sx={{ ...hint, mt: 1 }}>목 설정 · 테마 선택 상태만 저장됩니다.</Typography>
  </LabelledCard>;
}

