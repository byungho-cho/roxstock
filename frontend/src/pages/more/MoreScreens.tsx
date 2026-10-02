import { Box, Button, ButtonBase, Radio, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { liveApiEnabled } from '../../data/liveData';
import { addDemoAccount, changeDemoCash, editDemoAccount, readDemoSettings, saveDemoSettings } from '../../data/mockMoreSettings';
import { chooseAccount, correctCashBalance, createAccount, getCollectionStatus, listAccounts, selectedAccountStorageKey, updateAccount, type AccountDto } from '../../data/roxstockApi';
import { FormTextField, NumberField } from '../../components/forms/Fields';
import { colors } from '../../styles/tokens';

export type MoreView = 'target-arrival' | 'settings' | 'account' | 'add' | 'edit' | 'cash' | 'collection' | 'theme' | 'reset';
const panel = { bgcolor: '#0E1420', border: '1px solid #1F2B42', borderRadius: '8px', p: '16px', minWidth: 0 } as const;
const row = { bgcolor: '#111825', border: '1px solid #25344D', borderRadius: '8px' } as const;
const fmt = (value: string | number) => `${Number(value).toLocaleString('ko-KR')}원`;
const settingsPanel = { ...panel, bgcolor: '#090F1C', border: '1px solid #21304A' } as const;
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
    await client.invalidateQueries({ predicate: (item) => ['accounts', 'dashboard', 'stocks', 'buyLots', 'journalTrades', 'targetArrivals', 'recentBuys'].includes(String(item.queryKey[0])) });
  };
  const select = async (id: string) => {
    if (liveApiEnabled) { localStorage.setItem(selectedAccountStorageKey, id); window.dispatchEvent(new Event('roxstock-selected-account')); await refresh(); }
    else saveDemoSettings({ selectedId: id });
  };
  return { accounts, selected, query, demo, refresh, select };
}

function LabelledCard({ title, description, children, sx }: { title?: string; description?: string; children: ReactNode; sx?: object }) {
  return <Box sx={{ ...settingsPanel, ...sx }}>
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

export function SettingsMenu({ active }: { active?: MoreView }) {
  const navigate = useNavigate();
  const { accounts, query } = useMoreAccounts();
  const status = useQuery({ queryKey: ['collectionStatus'], queryFn: getCollectionStatus, enabled: liveApiEnabled, refetchInterval: 60_000 });
  const selected = ['add','edit','cash','reset'].includes(active ?? '') ? 'account' : active;
  const items = [
    { view: 'account', title: '계좌 관리', caption: '계좌 정보와 현재 예수금을 관리합니다.', value: query.isError ? '조회 실패' : `${accounts.length}개 계좌` },
    { view: 'target-arrival', title: '목표가 도래 조건', caption: '보유기간별 목표수익률 조건을 편집합니다.', value: '계좌별' },
    { view: 'collection', title: '시세 수집', caption: '수집 주기와 최근 수집 상태를 확인합니다.', value: status.isError ? '조회 실패' : status.data?.latestRun?.status === 'SUCCESS' ? '정상' : '상태 조회' },
    { view: 'theme', title: '테마 설정', caption: '앱 화면의 테마를 선택합니다.', value: '' },
  ];
  return <Stack component="nav" aria-label="설정 메뉴" spacing={{ xs: '12px', sm: '8px' }}>{items.map(item => <ButtonBase key={item.view} aria-current={selected === item.view ? 'page' : undefined} onClick={() => navigate(`/detail/settings?view=${item.view}`)} sx={{ ...row, bgcolor: '#090F1C', borderColor: selected === item.view ? '#3B82F6' : '#21304A', width: '100%', height: { xs: 72, sm: 68 }, px: '14px', gap: '10px', display: 'flex', textAlign: 'left' }}>
    <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontSize: 15, fontWeight: 400, color: '#F8FAFC' }}>{item.title}</Typography><Typography sx={{ fontSize: 11, fontWeight: 400, color: '#7385A1', mt: '5px' }}>{item.caption}</Typography></Box>
    {item.value && <Typography sx={{ flexShrink: 0, fontSize: 11, color: item.view === 'target-arrival' ? '#33D48C' : '#7385A1' }}>{item.value}</Typography>}<Typography sx={{ flexShrink: 0, fontSize: 22, color: '#7385A1' }}>›</Typography>
  </ButtonBase>)}</Stack>;
}

export function SettingsOverview({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const { accounts } = useMoreAccounts();
  const [theme, setTheme] = useState(readDemoSettings().theme);
  const chooseTheme = (value: 'dark' | 'light' | 'system') => { setTheme(value); saveDemoSettings({ theme: value }); };
  const go = (view: MoreView) => navigate(`/detail/settings?view=${view}`);
  if (compact) return <Box data-testid="more-settings-panel" sx={{ ...panel, height: '100%', p: '16px' }}>
    <Typography sx={{ ...heading, lineHeight: '28px', mb: '6px' }}>설정</Typography>
    <Stack spacing="8px">
      <LinkRow title="계좌 관리" onClick={() => go('account')} />
      <LinkRow title="시세 수집" value="상태 조회" onClick={() => go('collection')} />
      <LinkRow title="테마 설정" value={theme === 'dark' ? '다크' : theme === 'light' ? '라이트' : '시스템 설정'} onClick={() => go('theme')} active />
      <Stack direction="row" spacing="8px">{(['dark', 'light', 'system'] as const).map(value => <ButtonBase key={value} aria-label={value === 'dark' ? '다크' : value === 'light' ? '라이트' : '시스템 설정'} aria-pressed={theme === value} onClick={() => chooseTheme(value)} sx={{ ...row, flex: 1, minWidth: 0, height: 56, display: 'flex', flexDirection: 'column', gap: '4px', bgcolor: theme === value ? '#3C85F2' : '#0B111B', borderColor: '#1F2B42', color: '#E8EDF7' }}>
        <Typography sx={{ fontSize: 12, lineHeight: '19px', fontWeight: theme === value ? 600 : 400, whiteSpace: 'nowrap' }}>{value === 'dark' ? '다크' : value === 'light' ? '라이트' : '시스템 설정'}</Typography>
        <Typography sx={{ fontSize: 9, lineHeight: '14px', height: 14 }}>{theme === value ? '선택됨' : ''}</Typography>
      </ButtonBase>)}</Stack>
    </Stack>
  </Box>;
  return <SettingsMenu />;
}

export function AccountManagement({ openReset }: { openReset: () => void }) {
  const navigate = useNavigate();
  const { accounts, selected, query, select } = useMoreAccounts();
  const allowed = liveApiEnabled && !!selected?.isActive;
  const go = (view: MoreView) => navigate(`/detail/settings?view=${view}`);
  if (liveApiEnabled && query.isPending) return <LabelledCard title="등록 계좌"><Typography role="status" sx={{ ...hint, mt: 2 }}>계좌 목록을 불러오는 중입니다.</Typography></LabelledCard>;
  if (liveApiEnabled && query.isError) return <Button onClick={() => void query.refetch()} role="alert">계좌 조회 실패 · 다시 시도</Button>;
  return <Stack spacing="12px">
    {accounts.length === 0 ? <Typography sx={hint}>등록된 계좌가 없습니다. 계좌를 추가해 주세요.</Typography> : accounts.map(item => <ButtonBase key={item.id} onClick={() => void select(item.id)} sx={{ ...settingsPanel, width: '100%', textAlign: 'left', display: 'block', p: '15px' }}>
      <Stack direction="row" spacing="8px" sx={{ alignItems: 'center' }}><Typography sx={{ fontSize: 16 }}>{item.name}</Typography><Typography sx={{ color: '#33D48C', fontSize: 11 }}>{selected?.id === item.id ? '사용 중' : item.isDefault ? '기본 계좌' : '선택'}</Typography><Typography sx={hint}>›</Typography></Stack>
      <Typography sx={{ ...hint, mt: '12px' }}>현재 예수금</Typography><Typography sx={{ fontSize: 24, mt: '6px', overflowWrap: 'anywhere' }}>{fmt(item.cashBalance)}</Typography>
      <Typography sx={{ ...hint, mt: '12px' }}>최근 수정 {item.updatedAt ? new Date(item.updatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '—'}</Typography>
    </ButtonBase>)}
    <Stack direction="row" spacing="10px">{selected ? <><Button variant="outlined" sx={{ flex: 1, minWidth: 0, height: 40, fontSize: 13 }} onClick={() => go('edit')}>계좌 정보 수정</Button><Button variant="outlined" sx={{ flex: 1, minWidth: 0, height: 40, fontSize: 13 }} onClick={() => go('cash')}>예수금 수정</Button></> : <Button variant="contained" onClick={() => go('add')}>계좌 추가</Button>}</Stack>
    <Box sx={{ bgcolor: '#090F1C', p: '12px 14px', borderRadius: '8px' }}><Typography sx={{ fontSize: 13 }}>예수금 반영 기준</Typography><Typography sx={{ ...hint, mt: '6px' }}>실제 증권계좌 잔액을 기준으로 직접 수정합니다.</Typography></Box>
    {selected && <Button onClick={() => go('add')} sx={{ alignSelf: 'flex-start', fontSize: 11 }}>+ 계좌 추가</Button>}
    <Box sx={{ pt: '12px', borderTop: '1px solid #253652' }}><Typography sx={{ color: '#FA636E', fontSize: 12 }}>위험 영역</Typography><Button variant="outlined" color="error" fullWidth sx={{ height: 44, mt: '12px' }} onClick={openReset}>계좌 데이터 초기화</Button><Typography sx={{ ...hint, mt: '12px' }}>{allowed ? '선택한 계좌의 데이터만 삭제합니다.' : '현재 환경에서는 초기화를 사용할 수 없습니다.'}</Typography></Box>
  </Stack>;
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
  const brokerInput = useRef<HTMLInputElement>(null); const numberInput = useRef<HTMLInputElement>(null);
  return <Stack spacing="12px" component="form" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <FormTextField clearIconSrc="/settings-v03/clear.svg" label="계좌명" value={name} onChange={setName} autoFocus disabled={saving} enterKeyHint="next" onEnter={() => brokerInput.current?.focus()} />
    <FormTextField clearIconSrc="/settings-v03/clear.svg" label="증권사" value={broker} onChange={setBroker} inputRef={brokerInput} disabled={saving} enterKeyHint="next" onEnter={() => numberInput.current?.focus()} />
    <FormTextField clearIconSrc="/settings-v03/clear.svg" label="계좌번호" value={number} onChange={setNumber} inputRef={numberInput} disabled={saving} enterKeyHint="done" onEnter={() => void submit()} />
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', py: '8px' }}><Typography sx={{ fontSize: 13 }}>기본 계좌로 사용</Typography><ButtonBase role="switch" aria-label="기본 계좌로 사용" aria-checked={isDefault} disabled={saving || (!add && selected?.isDefault)} onClick={() => setDefault(!isDefault)} sx={{ width: 42, height: 24, borderRadius: '12px', bgcolor: '#334054', flexShrink: 0 }}>{isDefault ? <Box component="img" src="/settings-v03/switch-on.svg" alt="" /> : <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'white', position: 'absolute', left: 2 }} />}</ButtonBase></Stack>
    <Typography sx={hint}>계좌번호는 목록에서 일부만 표시됩니다.</Typography>
    {error && <Typography role="alert" color="error">{error}</Typography>}
    <Button type="submit" variant="contained" disabled={!name.trim() || !broker.trim() || saving || (!add && !selected)} sx={{ height: 42 }}>{saving ? '저장 중…' : add ? '추가' : '변경'}</Button>
  </Stack>;
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
    if (!selected || saving || !amount.trim() || !Number.isFinite(value) || value < 0) return;
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
  return <Stack spacing="14px" component="form" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <NumberField clearIconSrc="/settings-v03/clear.svg" label="현재 예수금" value={base} onChange={() => {}} readOnly suffix="원" />
    <NumberField clearIconSrc="/settings-v03/clear.svg" label="변경 예수금" value={amount} onChange={next => { if (/^\d*$/.test(next)) setAmount(next); }} autoFocus disabled={saving} suffix="원" enterKeyHint="done" onEnter={() => void submit()} />
    <Box sx={{ bgcolor: '#090F1C', p: '14px', borderRadius: '8px' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}><Typography sx={hint}>변경 후 예수금</Typography><Typography sx={{ fontSize: 14 }}>{amount.trim() && Number.isFinite(value) ? fmt(value) : '—'}</Typography></Stack>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, mt: '9px' }}><Typography sx={hint}>변경 금액</Typography><Typography sx={{ fontSize: 14, color: delta > 0 ? colors.marketRise : delta < 0 ? colors.marketFall : colors.textPrimary }}>{amount.trim() && Number.isFinite(delta) ? fmt(delta) : '—'}</Typography></Stack>
    </Box>
    <Typography sx={hint}>입력한 금액으로 현재 예수금을 즉시 변경합니다. 과거 거래내역은 자동 재계산하지 않습니다.</Typography>
    {error && <Typography role="alert" color="error">{error}</Typography>}
    <Button type="submit" variant="contained" disabled={saving || !amount.trim() || !Number.isFinite(value) || value < 0} sx={{ height: 42 }}>{saving ? '저장 중…' : '변경'}</Button>
  </Stack>;
}

export function CollectionSettings() {
  const status = useQuery({ queryKey: ['collectionStatus'], queryFn: getCollectionStatus, enabled: liveApiEnabled, refetchInterval: 60_000 });
  const run = status.data?.latestRun;
  const dateLabel = (value: string | null | undefined) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '기록 없음';
  const detail = <Stack spacing='10px' sx={{ mt: 0 }}>
    {[['수집 상태', status.isPending ? '조회 중' : run?.status ?? '기록 없음'], ['최근 수집', dateLabel(run?.finishedAt ?? run?.startedAt)], ['최근 시세', dateLabel(status.data?.latestPriceAt)], ['수집 실패', run ? `${run.failureCount}건` : '—']].map(([label, value]) => <Stack key={label} direction="row" sx={{ justifyContent: 'space-between' }}><Typography sx={hint}>{label}</Typography><Typography sx={{ fontSize: 12 }}>{value}</Typography></Stack>)}
  </Stack>;
  return <Stack spacing='12px'>
    <LabelledCard>{detail}{status.isError && <Button role="alert" onClick={() => void status.refetch()}>수집 상태 조회 실패 · 다시 시도</Button>}{run?.failureReason && <Typography sx={{ ...hint, mt: 1 }}>{run.failureReason}</Typography>}</LabelledCard>
    <LabelledCard title="수집 설정" description="장 운영 중 현재가를 설정 주기로 갱신합니다." >
      <Typography sx={{ ...hint, mt: 2 }}>자동 수집은 서버 작업에서 관리합니다. 앱에서 주기 변경과 수동 실행은 제공하지 않습니다.</Typography>
      <Button disabled variant="outlined" sx={{ mt: 2 }}>지금 수집 · 서버 미지원</Button>
    </LabelledCard>
  </Stack>;
}

export function ThemeSettings() {
  const [theme, setTheme] = useState(readDemoSettings().theme);
  return <Stack spacing="10px">{(['dark','light','system'] as const).map(value => <ButtonBase key={value} aria-pressed={theme === value} onClick={() => { setTheme(value); saveDemoSettings({ theme: value }); }} sx={{ ...row, p: '14px 15px', height: 64, textAlign: 'left', display: 'flex', gap: 1, bgcolor: theme === value ? '#3B82F6' : '#090F1C', borderColor: theme === value ? '#60A5FA' : '#21304A' }}>
    <Box sx={{ flex: 1 }}><Typography sx={{ fontSize: 14 }}>{value === 'dark' ? '다크' : value === 'light' ? '라이트' : '시스템 설정'}</Typography><Typography sx={{ ...hint, mt: '5px', color: theme === value ? '#D9E7FF' : '#7385A1' }}>{value === 'dark' ? '어두운 화면으로 표시합니다.' : value === 'light' ? '밝은 화면으로 표시합니다.' : '기기의 테마 설정을 따릅니다.'}</Typography></Box><Radio checked={theme === value} tabIndex={-1} sx={{ p: 0, pointerEvents: 'none' }} />
  </ButtonBase>)}<Typography role="status" sx={hint}>테마 선택 상태는 저장됩니다. 전체 화면 테마 적용은 아직 지원하지 않습니다.</Typography></Stack>;
}
