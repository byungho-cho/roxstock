import {ApiError} from '../../data/apiClient';
import {useAccountAllocation} from '../../hooks/useAccountAllocation';
import {ActionButton} from '../../components/common/Common';
import { invalidatePortfolio } from '../../data/invalidatePortfolio';
import { Box, Button, ButtonBase, IconButton, Dialog, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { liveApiEnabled } from '../../data/liveData';
import { addDemoAccount, changeDemoCash, editDemoAccount, readDemoSettings, saveDemoSettings } from '../../data/mockMoreSettings';
import { getAccountDataState, deleteAccount, chooseAccount, createAccount, getCollectionStatus, getCollectionMonitorSummary, listAccounts, selectedAccountStorageKey, updateAccount, type AccountDto } from '../../data/roxstockApi';
import { FormTextField, NumberField } from '../../components/forms/Fields';
import { colors } from '../../styles/tokens';

export type MoreView = 'target-arrival' | 'settings' | 'account' | 'add' | 'edit' | 'cash' | 'collection' | 'theme' | 'reset';
const panel = { bgcolor: '#0E1420', border: '1px solid #1F2B42', borderRadius: '8px', p: '16px', minWidth: 0 } as const;
const row = { bgcolor: '#111825', border: '1px solid #25344D', borderRadius: '8px' } as const;
const fmt = (value: string | number | null) => value === null ? '—' : `${Number(value).toLocaleString('ko-KR')}원`;
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
  const accounts = liveApiEnabled ? (query.data ?? []).filter(a=>a.isActive) : demo.accounts;
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
  return <ButtonBase onClick={onClick} sx={{ ...row, width: '100%', minHeight: caption ? 72 : 40, px: '13px', py: '10px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 1, ...(active ? { bgcolor: '#14386B', borderColor: '#3C85F2' } : {}) }}>
    <Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontSize: 13, color: '#E8EDF7', fontWeight: active ? 600 : 400 }}>{title}</Typography>{caption && <Typography sx={{ ...hint, display: { xs: 'block', sm: 'none' }, mt: 0.5 }}>{caption}</Typography>}</Box>
    {value && <Typography sx={{ fontSize: 11, color: active ? '#E8EDF7' : '#7A859E', whiteSpace: 'nowrap' }}>{value}</Typography>}
    <Typography sx={{ color: '#7A859E', fontSize: 19, lineHeight: 1 }}>›</Typography>
  </ButtonBase>;
}

export function SettingsMenu({ active }: { active?: MoreView }) {
  const navigate = useNavigate();
  const { accounts, query } = useMoreAccounts();
  const status = useQuery({ queryKey: ['collection-monitoring-summary'], queryFn: getCollectionMonitorSummary, enabled: liveApiEnabled, refetchInterval: 60_000 });
  const selected = ['add','edit','cash','reset'].includes(active ?? '') ? 'account' : active;
  const items = [
    { view: 'account', title: '계좌 관리', caption: '계좌 정보와 현재 예수금을 관리합니다.', value: query.isError ? '조회 실패' : `${accounts.length}개 계좌` },
    { view: 'target-arrival', title: '목표가 도래 조건', caption: '보유기간별 목표수익률 조건을 편집합니다.', value: '계좌별' },
    { view: 'collection', title: '시세 수집', caption: '수집 주기와 최근 수집 상태를 확인합니다.', value: status.isError ? '조회 실패' : ({ OK: '정상', SUCCESS: '완료', RUNNING: '진행 중', PARTIAL: '일부 실패', FAILED: '실패', DELAYED: '지연', WAITING: '대기', NOT_IMPLEMENTED: '미구현', NO_DATA: '미수집', NOT_CONFIGURED: '설정 필요', NO_FILING: '미공시' } as Record<string,string>)[status.data?.features.find(item => item.id === 'realtime-prices')?.status ?? ''] ?? '상태 조회' },
    { view: 'theme', title: '테마 설정', caption: '앱 화면의 테마를 선택합니다.', value: '' },
  ];
  return <Stack component="nav" aria-label="설정 메뉴" spacing="12px">{items.map(item => <ButtonBase key={item.view} aria-current={selected === item.view ? 'page' : undefined} onClick={() => navigate(`/detail/settings?view=${item.view}`)} sx={{ ...row, bgcolor: '#090F1C', borderColor: selected === item.view ? '#3B82F6' : '#21304A', width: '100%', height: { xs: 72, sm: 72 }, px: '14px', gap: '10px', display: 'flex', textAlign: 'left' }}>
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
  if (compact) return <Box data-testid="more-settings-panel" sx={{ ...panel, height: 300, p: '13px', boxSizing: 'border-box' }}>
    <Typography sx={{ ...heading, lineHeight: '28px', mb: '6px' }}>설정</Typography>
    <Stack spacing="16px">
      <LinkRow title="계좌 관리" onClick={() => go('account')} />
      <LinkRow title="시세 수집" value="상태 조회" onClick={() => go('collection')} />
      <LinkRow title="테마 설정" value={theme === 'dark' ? '다크' : theme === 'light' ? '라이트' : '시스템 설정'} onClick={() => go('theme')} active />
      <Box data-testid="theme-buttons" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: '8px' }}>{(['dark', 'light', 'system'] as const).map(value => <ButtonBase key={value} aria-label={value === 'dark' ? '다크' : value === 'light' ? '라이트' : '시스템 설정'} aria-pressed={theme === value} onClick={() => chooseTheme(value)} sx={{ ...row, flex: 1, minWidth: 0, height: 56, display: 'flex', flexDirection: 'column', gap: '4px', bgcolor: theme === value ? '#3C85F2' : '#0B111B', borderColor: '#1F2B42', color: '#E8EDF7' }}>
        <Typography sx={{ fontSize: 12, lineHeight: '19px', fontWeight: theme === value ? 600 : 400, whiteSpace: 'nowrap' }}>{value === 'dark' ? '다크' : value === 'light' ? '라이트' : '시스템 설정'}</Typography>
        <Typography sx={{ fontSize: 10, lineHeight: '14px', height: 14 }}>{theme === value ? '선택됨' : ''}</Typography>
      </ButtonBase>)}</Box>
    </Stack>
  </Box>;
  return <SettingsMenu />;
}

export function AccountManagement(_props: { openReset?: () => void }) {
 const navigate=useNavigate();const {accounts,selected,query,select}=useMoreAccounts();
 if(liveApiEnabled&&query.isPending)return <Skeleton height={100}/>;
 if(liveApiEnabled&&query.isError)return <Button role="alert" onClick={()=>void query.refetch()}>계좌 조회 실패 · 다시 시도</Button>;
 return <Stack spacing="8px">{!accounts.length&&<Typography>등록된 계좌가 없습니다. 계좌를 추가해 주세요.</Typography>}{accounts.map(item=><AccountCard key={item.id} item={item} active={selected?.id===item.id} select={()=>void select(item.id)}/>)}<Button fullWidth variant="contained" sx={{height:42,bgcolor:colors.buttonPrimary,color:'#fff'}} onClick={()=>navigate('/detail/settings?view=add')}>계좌 추가</Button></Stack>;
}
function AccountCard({item,active,select}:{item:AccountDto;active:boolean;select:()=>void}) {
 const navigate=useNavigate();const allocation=useAccountAllocation(item.id);const cash=allocation.query.data?allocation.query.data.cashBalance:item.cashBalance;
 return <Box data-testid={'account-card-'+item.id} sx={{...settingsPanel,p:'8px 15px',border:'2px solid',borderColor:active?'#FACC15':'#21304A',display:'flex',flexDirection:'column',gap:'8px'}}>
 <Stack direction="row" sx={{justifyContent:'space-between',alignItems:'center',gap:1}}><Typography sx={{fontSize:16,color:active?'#FACC15':colors.textPrimary,overflowWrap:'anywhere',minWidth:0}}>{item.name}</Typography><ActionButton size="small" tone={active?'primary':'muted'} sx={{width:60,flexShrink:0,fontSize:12}} onClick={select}>{active?'사용중':'선택'}</ActionButton></Stack>
 <Typography data-testid="account-cash" sx={{fontSize:24,color:allocation.cashColor,textAlign:'right',overflowWrap:'anywhere'}}>{fmt(cash)}</Typography>
 <Stack direction="row" sx={{justifyContent:'space-between',alignItems:'center',gap:1}}><Typography sx={{...hint,fontSize:11}}>최근 수정 {item.updatedAt?new Date(item.updatedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'—'}</Typography><IconButton aria-label={item.name+' 계좌 정보 수정'} sx={{p:0,width:20,height:20,flexShrink:0}} onClick={()=>navigate('/detail/settings?view=edit&accountId='+item.id)}><img src="/phase15/account-edit.svg" alt="" width="20" height="20"/></IconButton></Stack>
 </Box>;
}

export function useTargetAccount(){const state=useMoreAccounts();const [params]=useSearchParams();const target=params.get('accountId');return {...state,selected:target?state.accounts.find(a=>a.id===target):state.selected};}

export function AccountForm({ add }: { add: boolean }) {
  const { selected, query } = useTargetAccount();
  if (!add && query.isPending && liveApiEnabled) return <Skeleton height={80}/>;
  if (!add && query.isError && liveApiEnabled) return <Button role="alert" onClick={() => void query.refetch()}>계좌 조회 실패 · 다시 시도</Button>;
  if (!add && !selected) return <Typography role="status" sx={hint}>계좌를 선택해 주세요.</Typography>;
  return <AccountFormContent key={add ? 'add' : selected!.id} add={add} />;
}
function AccountFormContent({ add }: { add: boolean }) {
  const navigate = useNavigate(); const client = useQueryClient();
  const { selected, accounts, refresh } = useTargetAccount();
  const state=useQuery({queryKey:['account-data-state',selected?.id],queryFn:()=>getAccountDataState(selected!.id),enabled:liveApiEnabled&&!add&&!!selected});
  const [confirmDelete,setConfirmDelete]=useState(false);const busy=useRef(false);
  const remove=async()=>{if(!selected||busy.current||!state.data||state.isError||state.data.hasData)return;busy.current=true;setSaving(true);setError('');try{
   const result=await deleteAccount(selected.id);
   await client.cancelQueries();client.removeQueries({predicate:q=>q.queryKey[0]!=='accounts'});
   const current=localStorage.getItem(selectedAccountStorageKey);
   if(current===selected.id||!current){if(result.nextAccountId)localStorage.setItem(selectedAccountStorageKey,result.nextAccountId);else localStorage.removeItem(selectedAccountStorageKey);}
   client.setQueryData(['accounts','api'],accounts.filter(a=>a.id!==selected.id).map(a=>({...a,isDefault:a.isDefault||a.id===result.nextAccountId})));
   window.dispatchEvent(new Event('roxstock-selected-account'));setConfirmDelete(false);
   navigate('/detail/settings?view=account',{replace:true});void client.invalidateQueries({queryKey:['accounts']});
  }catch(cause){setError(cause instanceof Error?cause.message:'계좌 삭제에 실패했습니다. 다시 시도해 주세요.');if(cause instanceof ApiError&&cause.code==='ACCOUNT_HAS_DATA'){setConfirmDelete(false);void state.refetch();}}finally{busy.current=false;setSaving(false);}};
  const [name, setName] = useState(add ? '' : selected?.name ?? '');
  const [broker, setBroker] = useState(add ? '' : selected?.brokerName ?? '');
  const [number, setNumber] = useState(add ? '' : selected?.accountNumber ?? '');
  const [isDefault, setDefault] = useState(add ? accounts.length === 0 : !!selected?.isDefault);
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  useEffect(() => { if (!add && selected) { setName(selected.name); setBroker(selected.brokerName); setNumber(selected.accountNumber ?? ''); setDefault(!!selected.isDefault); } }, [add, selected?.id]);
  const submit = async () => {
    if (busy.current || !name.trim() || !broker.trim() || !number.replace(/[\s-]/g,'') || saving || (!add && !selected)) return;
    busy.current=true;setSaving(true); setError('');
    try {
      const input = { name: name.trim(), brokerName: broker.trim(), accountNumber: number.trim(), isDefault };
      if (liveApiEnabled) {
        const result = add ? await createAccount(input) : await updateAccount(selected!.id, input);
        if (add) { localStorage.setItem(selectedAccountStorageKey, result.id); window.dispatchEvent(new Event('roxstock-selected-account')); }
        await refresh();
        await client.fetchQuery({ queryKey: ['accounts', 'api'], queryFn: listAccounts, staleTime: 0 });
      } else if (add) addDemoAccount(input); else editDemoAccount(selected!.id, input);
      navigate('/detail/settings?view=account');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '계좌 변경에 실패했습니다.'); }
    finally { busy.current=false;setSaving(false); }
  };
  const brokerInput = useRef<HTMLInputElement>(null); const numberInput = useRef<HTMLInputElement>(null);
  return <Stack spacing="12px" component="form" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <FormTextField size="small" clearIconSrc="/settings-v03/clear.svg" required label="계좌명" value={name} onChange={setName} autoFocus disabled={saving} enterKeyHint="next" onEnter={() => brokerInput.current?.focus()} />
    <FormTextField size="small" clearIconSrc="/settings-v03/clear.svg" required label="증권사" value={broker} onChange={setBroker} inputRef={brokerInput} disabled={saving} enterKeyHint="next" onEnter={() => numberInput.current?.focus()} />
    <FormTextField size="small" clearIconSrc="/settings-v03/clear.svg" required label="계좌번호" value={number} onChange={setNumber} inputRef={numberInput} disabled={saving} enterKeyHint="done" onEnter={() => void submit()} />
    <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', py: '8px' }}><Typography sx={{ fontSize: 13 }}>기본 계좌로 사용</Typography><ButtonBase role="switch" aria-label="기본 계좌로 사용" aria-checked={isDefault} disabled={saving || (!add && selected?.isDefault)} onClick={() => setDefault(!isDefault)} sx={{ width: 42, height: 24, borderRadius: '12px', bgcolor: '#334054', flexShrink: 0 }}>{isDefault ? <Box component="img" src="/settings-v03/switch-on.svg" alt="" /> : <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'white', position: 'absolute', left: 2 }} />}</ButtonBase></Stack>
    <Typography sx={hint}>계좌번호는 목록에서 일부만 표시됩니다.</Typography>
    {error && <Typography role="alert" sx={{ fontSize: 12, textAlign: 'right', overflowWrap: 'anywhere' }} color="error">{error}</Typography>}
    {!add&&state.isError&&<Button role="alert" onClick={()=>void state.refetch()}>계좌 상태 조회 실패 · 다시 시도</Button>}
    <Stack direction="row" spacing="8px">{!add&&<Button variant="contained" sx={{flex:1,height:42,bgcolor:'#EF4444',color:'#fff'}} disabled={saving||!liveApiEnabled||state.isPending||state.isError||!state.data||state.isFetching} onClick={()=>state.data?.hasData?navigate('/detail/settings?view=reset&accountId='+selected!.id):setConfirmDelete(true)}>{state.data?.hasData?'데이터 초기화':state.data?'계좌 삭제':'상태 확인 중'}</Button>}
    <Button type="submit" variant="contained" disabled={!name.trim()||!broker.trim()||!number.replace(/[\s-]/g,'')||saving||(!add&&!selected)} sx={{height:42,flex:1,bgcolor:colors.buttonPrimary,color:'#fff'}}>{saving?'처리 중…':add?'추가':'변경'}</Button></Stack>
    <Dialog open={confirmDelete} onClose={()=>{if(!busy.current)setConfirmDelete(false)}} aria-labelledby="delete-account-title" slotProps={{backdrop:{sx:{bgcolor:'rgba(0,0,0,.6)'}},paper:{sx:{width:306,maxWidth:'calc(100vw - 64px)',m:0,p:'20px 16px',borderRadius:'8px',bgcolor:colors.surface,backgroundImage:'none'}}}}>
    <Typography id="delete-account-title" sx={{fontSize:16,fontWeight:600}}>계좌 삭제</Typography><Typography sx={{fontSize:14,fontWeight:400,my:'16px'}}>삭제하시겠습니까?</Typography>
    {error&&<Typography role="alert" color="error" sx={{fontSize:12,mb:1}}>{error}</Typography>}
    <Stack direction="row" spacing="8px"><Button variant="outlined" sx={{height:42,flex:1,color:colors.textMuted,borderColor:colors.borderStrong}} disabled={saving} onClick={()=>setConfirmDelete(false)}>취소</Button><Button variant="contained" sx={{height:42,flex:1,bgcolor:'#EF4444',color:'#fff'}} disabled={saving} onClick={()=>void remove()}>{saving?'삭제 중…':'삭제'}</Button></Stack></Dialog>
  </Stack>;
}

export function CashAdjustment() {
  const navigate = useNavigate();
  const { selected, query } = useMoreAccounts();
  if (query.isPending && liveApiEnabled) return <Skeleton height={80}/>;
  if (query.isError && liveApiEnabled) return <Button role="alert" onClick={() => void query.refetch()}>계좌 조회 실패 · 다시 시도</Button>;
  if (!selected) return <Typography role="status" sx={hint}>계좌를 선택해 주세요.</Typography>;
  if (liveApiEnabled) return <Stack spacing="14px"><Typography sx={hint}>현재예수금은 최신 등록 내역의 세후예수금입니다. 예수금 화면의 현재예수금 카드를 눌러 해당 내역을 수정해 주세요.</Typography><Button variant="contained" onClick={() => navigate('/detail/cash')}>예수금 내역 편집으로 이동</Button></Stack>;
  return <CashAdjustmentContent key={selected.id} />;
}
function CashAdjustmentContent() {
  const { selected, query } = useMoreAccounts(); const navigate = useNavigate();
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const base = selected?.cashBalance ?? '';
  const [amount, setAmount] = useState(base);
  useEffect(() => { setAmount(base); }, [base, selected?.id]);
  const value = Number(amount.replaceAll(',', '')); const delta = value - Number(base);
  const submit = async () => {
    if (!selected || saving || !amount.trim() || !Number.isFinite(value) || value < 0) return;
    setSaving(true); setError('');
    try {
      changeDemoCash(selected.id, String(value));
      navigate('/detail/settings?view=account');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '예수금 수정에 실패했습니다.'); }
    finally { setSaving(false); }
  };
  if (liveApiEnabled && query.isPending) return <LabelledCard title="계좌 정보"><Skeleton height={80}/></LabelledCard>;
  if (liveApiEnabled && query.isError) return <Button role="alert" onClick={() => void query.refetch()}>계좌 조회 실패 · 다시 시도</Button>;
  if (liveApiEnabled && !selected) return <Typography role="status">선택된 계좌가 없습니다.</Typography>;
  return <Stack spacing="14px" component="form" onSubmit={event => { event.preventDefault(); void submit(); }}>
    <NumberField size="small" clearIconSrc="/settings-v03/clear.svg" label="현재 예수금" value={base} onChange={() => {}} readOnly suffix="원" />
    <NumberField size="small" clearIconSrc="/settings-v03/clear.svg" label="변경 예수금" value={amount} onChange={next => { if (/^\d*$/.test(next)) setAmount(next); }} autoFocus disabled={saving} suffix="원" enterKeyHint="done" onEnter={() => void submit()} />
    <Box sx={{ bgcolor: '#090F1C', p: '14px', borderRadius: '8px' }}>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}><Typography sx={hint}>변경 후 예수금</Typography><Typography sx={{ fontSize: 14 }}>{amount.trim() && Number.isFinite(value) ? fmt(value) : '—'}</Typography></Stack>
      <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, mt: '9px' }}><Typography sx={hint}>변경 금액</Typography><Typography sx={{ fontSize: 14, color: delta > 0 ? colors.marketRise : delta < 0 ? colors.marketFall : colors.textPrimary }}>{amount.trim() && Number.isFinite(delta) ? fmt(delta) : '—'}</Typography></Stack>
    </Box>
    <Typography sx={hint}>입력한 금액으로 현재 예수금을 즉시 변경합니다. 과거 거래내역은 자동 재계산하지 않습니다.</Typography>
    {error && <Typography role="alert" sx={{ fontSize: 12, textAlign: 'right', overflowWrap: 'anywhere' }} color="error">{error}</Typography>}
    <Button type="submit" variant="contained" disabled={saving || !amount.trim() || !Number.isFinite(value) || value < 0} sx={{ height: 42 }}>{saving ? '저장 중…' : '변경'}</Button>
  </Stack>;
}

export function CollectionSettings() {
  const status = useQuery({ queryKey: ['collectionStatus'], queryFn: getCollectionStatus, enabled: liveApiEnabled, refetchInterval: 60_000 });
  const monitor = useQuery({ queryKey: ['collection-monitoring-summary'], queryFn: getCollectionMonitorSummary, enabled: liveApiEnabled, refetchInterval: 60_000 });
  const feature = monitor.data?.features.find(item => item.id === 'realtime-prices');
  const labels: Record<string,string> = { OK: '정상', SUCCESS: '완료', RUNNING: '진행 중', PARTIAL: '일부 실패', FAILED: '실패', DELAYED: '지연', WAITING: '대기', NOT_IMPLEMENTED: '미구현', NO_DATA: '미수집', NOT_CONFIGURED: '설정 필요', NO_FILING: '미공시' };
  const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '기록 없음';
  return <Stack spacing="12px">
    <LabelledCard><Stack spacing="14px">
      {[['수집 상태', feature ? labels[feature.status] ?? '상태 미확인' : monitor.isPending ? '조회 중' : '미수집'], ['마지막 시도', dateLabel(feature?.lastAttemptAt)], ['마지막 성공', dateLabel(feature?.lastSuccessAt)], ['다음 수집', dateLabel(feature?.nextAt)], ['수집 실패', feature?.recent.failed != null ? feature.recent.failed + '건' : '—']].map(([label,value]) => <Stack key={label} direction="row" sx={{ justifyContent: 'space-between', gap: '8px' }}><Typography sx={hint}>{label}</Typography><Typography sx={{ fontSize: 12, textAlign: 'right', overflowWrap: 'anywhere', minWidth: 0 }}>{value}</Typography></Stack>)}
    </Stack>
    {(monitor.isError || status.isError) && <Button role="alert" onClick={() => { void monitor.refetch(); void status.refetch(); }}>수집 상태 조회 실패 · 다시 시도</Button>}
    </LabelledCard>
    <LabelledCard title="자동 수집">
      <Typography sx={{ ...hint, mt: '12px', textAlign: 'right' }}>{feature?.schedule ?? '수집 일정 미수집'}</Typography>
      <Typography sx={{ ...hint, mt: '12px' }}>보유·관심 종목의 실제 수집 상태를 조회합니다.</Typography>
      <Typography sx={{ ...hint, mt: '12px' }}>앱에서 수집 주기를 변경하는 기능은 미구현입니다.</Typography>
    </LabelledCard>
    <Button disabled variant="contained" sx={{ height: 42 }}>지금 수집 · 미구현</Button>
  </Stack>;
}

export function ThemeSettings() {
  const [theme, setTheme] = useState(readDemoSettings().theme);
  return <Stack spacing="10px">{(['dark','light','system'] as const).map(value => <ButtonBase key={value} aria-pressed={theme === value} onClick={() => { setTheme(value); saveDemoSettings({ theme: value }); }} sx={{ ...row, p: '14px 15px', height: 64, textAlign: 'left', display: 'flex', gap: 1, bgcolor: theme === value ? '#3B82F6' : '#090F1C', borderColor: theme === value ? '#60A5FA' : '#21304A' }}>
    <Box sx={{ flex: 1 }}><Typography sx={{ fontSize: 14 }}>{value === 'dark' ? '다크' : value === 'light' ? '라이트' : '시스템 설정'}</Typography><Typography sx={{ ...hint, mt: '5px', color: theme === value ? '#D9E7FF' : '#7385A1' }}>{value === 'dark' ? '어두운 화면으로 표시합니다.' : value === 'light' ? '밝은 화면으로 표시합니다.' : '기기의 테마 설정을 따릅니다.'}</Typography></Box><Box component="img" src={theme === value ? '/utility-v04/radio-selected.svg' : '/utility-v04/radio.svg'} alt="" />
  </ButtonBase>)}<Typography role="status" sx={hint}>테마 선택 상태는 저장됩니다. 전체 화면 테마 적용은 아직 지원하지 않습니다.</Typography></Stack>;
}
