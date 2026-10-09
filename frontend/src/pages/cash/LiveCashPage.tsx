import {useAccountAllocation} from '../../hooks/useAccountAllocation';
import { useMainLoading } from '../../hooks/useMainLoading';
import { storedQueryOptions } from '../../data/storedQueryOptions';
import { invalidatePortfolio } from '../../data/invalidatePortfolio';
import {ConfirmActionDialog} from '../../components/common/ConfirmActionDialog';
import { usePageMemory } from '../../hooks/navigation/usePageMemory';
import { ChevronLeftRounded, ChevronRightRounded } from '@mui/icons-material';
import { Box, Button, MenuItem, Select, IconButton, Skeleton,  Stack, Typography, useMediaQuery } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { ActionButton, AppCard } from '../../components/common/Common';
import { DateField, FormTextField, NumberField } from '../../components/forms/Fields';
import { PageHeader } from '../../components/navigation/Navigation';
import { getBuyLots, createCashTransaction, createDividend, deleteCashTransaction, getCashOverview, updateCashTransaction, type CashTransactionDto } from '../../data/roxstockApi';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { flushSync } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { OverlayRegionScrollbar } from '../../components/navigation/OverlayRegionScrollbar';
import { CashSearch } from './CashSearch';
import { CashTrend } from './CashTrend';
import { CashPopup } from './CashPopup';
import { cashDifference, cashHistory, cashNumber, cashRange, cashToday as today, monthShift } from './cashData';
import '../dashboard/home-font.css';
import { formatWon } from '../../utils/format';
import { colors } from '../../styles/tokens';

const initialMonth = today().slice(0, 7);
const labels: Record<CashTransactionDto['transactionType'], string> = { BUY: '매수', SELL: '매도', DEPOSIT: '입금', WITHDRAWAL: '출금', DIVIDEND: '배당' };
const shortDate = (date: string) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit' }).format(new Date(date)).replace(/\s/g, '').replace(/\.$/, '');
const signed = (amount: number) => `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${formatWon(Math.abs(amount))}`;
const overviewQuery = (accountId: string, mode: 'month' | 'year', period: string | number) => ({
  queryKey: ['cashOverview', accountId, mode, period] as const,
  queryFn: () => getCashOverview(accountId, mode === 'month' ? Number(String(period).slice(0, 4)) : Number(period), mode === 'month' ? Number(String(period).slice(5)) : undefined),
  ...storedQueryOptions,
});

export function LiveCashPage() {
  const queryClient = useQueryClient();
  const { accountId, accounts } = useActiveAccount();
  const tablet = useMediaQuery('(min-width:600px)'), navigate = useNavigate(), location = useLocation();
  const [params] = useSearchParams();
  const bodyRef = useRef<HTMLDivElement>(null), leftRef = useRef<HTMLDivElement>(null), rightRef = useRef<HTMLDivElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false), [securityName, setSecurityName] = useState('');
  const [mode, setMode] = usePageMemory<'month' | 'year'>('cashMode','month');
  const [month, setMonth] = usePageMemory('cashMonth',initialMonth);
  const [year, setYear] = usePageMemory('cashYear',Number(initialMonth.slice(0, 4)));
  const [olderMonths, setOlderMonths] = usePageMemory('cashRange',0);
  const [periodPicker, setPeriodPicker] = useState(false);
  const [chosenYear, setChosenYear] = useState(year);
  const [chosenMonth, setChosenMonth] = useState(Number(initialMonth.slice(5)));
  const [cardError, setCardError] = useState('');
  const [cardEditing, setCardEditing] = useState(false);
  const mutationLock = useRef(false);
  const amountRef = useRef<HTMLInputElement>(null);
  const grossRef = useRef<HTMLInputElement>(null);
  const taxRef = useRef<HTMLInputElement>(null);
  const memoRef = useRef<HTMLInputElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const balance = useQuery({ queryKey: ['cashBalance', accountId], queryFn: () => getCashOverview(accountId!), enabled: !!accountId });
  const allocation=useAccountAllocation(accountId??undefined,balance.isError?null:balance.data?.account.currentBalance??null);
  const overview = useQuery({ ...overviewQuery(accountId ?? '', mode, mode === 'month' ? month : year), enabled: !!accountId });
  useEffect(() => {
    if (!accountId || !overview.data || overview.isError) return;
    const adjacent = mode === 'month' ? [monthShift(month, -1), monthShift(month, 1)].filter((target) => target <= initialMonth) : [year - 1, year + 1].filter((target) => target <= Number(initialMonth.slice(0, 4)));
    for (const period of adjacent) void queryClient.prefetchQuery(overviewQuery(accountId, mode, period));
  }, [accountId, mode, month, year, overview.data, overview.isError, queryClient]);
  const range = cashRange(mode, month, year);
  const historyRange = cashRange(mode, month, year, olderMonths);
  const history = useQuery({ ...storedQueryOptions, queryKey: ['cashTransactions', accountId, mode, month, year, olderMonths], queryFn: () => cashHistory(accountId!, historyRange), enabled: !!accountId,
    placeholderData: (previous, query) => query && query.queryKey[1] === accountId && query.queryKey[2] === mode && query.queryKey[3] === month && query.queryKey[4] === year ? previous : undefined });
  const pendingBottom = useRef<string | null>(null);
  const olderLock = useRef(false), [olderLoading, setOlderLoading] = useState(false), [olderError, setOlderError] = useState('');
  const rangeContext = useRef(''); rangeContext.current = JSON.stringify([accountId, mode, month, year]);
  useEffect(() => {
    if (pendingBottom.current !== JSON.stringify([accountId, mode, month, year, olderMonths])) return;
    if (history.isError) { pendingBottom.current = null; return; }
    if (history.isFetching || history.isPlaceholderData || !history.data) return;
    const frame = requestAnimationFrame(() => {
      const region = tablet ? rightRef.current : bodyRef.current;
      region?.scrollTo({ top: region.scrollHeight, behavior: 'auto' });
      pendingBottom.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [accountId, mode, month, year, olderMonths, history.data, history.isError, history.isFetching, history.isPlaceholderData, tablet]);
  const loadOlder = async () => {
    if (!accountId || history.isFetching || olderLock.current || pendingBottom.current) return;
    olderLock.current = true; setOlderLoading(true); setOlderError('');
    const context = rangeContext.current, next = olderMonths + 1;
    try {
      await queryClient.fetchQuery({queryKey:['cashTransactions',accountId,mode,month,year,next], queryFn:()=>cashHistory(accountId,cashRange(mode,month,year,next)), ...storedQueryOptions});
      if (context !== rangeContext.current) return;
      pendingBottom.current = JSON.stringify([accountId,mode,month,year,next]);
      setOlderMonths(next);
    } catch {
      if (context === rangeContext.current) setOlderError('추가 내역 조회 실패 · 다시 시도');
    } finally { olderLock.current = false; setOlderLoading(false); }
  };
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CashTransactionDto | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [type, setType] = useState<CashTransactionDto['transactionType']>('DEPOSIT');
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState('');
  const [gross, setGross] = useState('');
  const [tax, setTax] = useState('');
  const [after, setAfter] = useState('');
  const tradeEdit = !!editing && (type === 'BUY' || type === 'SELL');
  const canDelete = !!editing && !balance.isError && editing.id === balance.data?.recentTransactions[0]?.id;
  const changeGross = (value:string) => {setGross(value); setTax(''); if(tradeEdit) setAfter(''); else setAmount('');};
  const changeAfter = (value:string) => {if(tradeEdit) setAfter(value); else setAmount(value); setTax(value !== '' && gross !== '' ? cashDifference(gross,value) : '');};
  const changeTax = (value:string) => {setTax(value); const calculated=value !== '' && gross !== '' ? cashDifference(gross,value) : ''; if(tradeEdit) setAfter(calculated); else setAmount(calculated);};
  const [securityId, setSecurityId] = useState('');
  const [memo, setMemo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useMainLoading(olderLoading);
  const dividendLots = useQuery({queryKey:['allBuyLots',accountId,'dividend-options'],queryFn:()=>getBuyLots(accountId!,undefined,false),enabled:!!accountId});
  const dividendOptions = [...new Map((dividendLots.data??[]).map(lot=>[lot.security.id,lot.security])).values()];
  const inputVisible = tablet ? open : params.has('cashInput');
  const searching = tablet ? searchOpen : params.get('cashInput') === 'search';
  useEffect(()=>{if(inputVisible&&!searching){const frame=requestAnimationFrame(()=>{if(!tablet) bodyRef.current?.scrollTo({top:0});(type==='DIVIDEND'||tradeEdit?grossRef:amountRef).current?.focus({preventScroll:true});});return()=>cancelAnimationFrame(frame);}},[inputVisible,searching,type,tradeEdit,tablet]);
  const enterInput = (search = false) => {
    if (tablet) { if (search) setSearchOpen(true); return; }
    const next = new URLSearchParams(location.search); next.set('cashInput', search ? 'search' : 'form');
    flushSync(() => navigate({ pathname: location.pathname, search: next.toString() }, { state: {
      ...location.state, listEntryKey: location.state?.listEntryKey ?? location.key,
      cashSourceIndex: location.state?.cashSourceIndex ?? window.history.state?.idx,
    } }));
    bodyRef.current?.querySelector<HTMLInputElement>('[data-initial-focus="true"]')?.focus({ preventScroll: true });
  };
  const closeInput = () => {
    setOpen(false); setSearchOpen(false);
    if (tablet) return;
    const distance = Number(window.history.state?.idx) - Number(location.state?.cashSourceIndex);
    if (Number.isFinite(distance) && distance > 0) navigate(-distance);
    else { const next = new URLSearchParams(location.search); next.delete('cashInput'); navigate({ pathname: location.pathname, search: next.toString() }, { replace: true }); }
  };
  const backFromSearch = () => { if (tablet) setSearchOpen(false); else navigate(-1); };
  useEffect(() => { if (!tablet) { setOpen(params.has('cashInput')); setSearchOpen(params.get('cashInput') === 'search'); } }, [tablet, params]);
  useEffect(() => { if (inputVisible && !editingAccountId && accountId) setEditingAccountId(accountId); }, [inputVisible, editingAccountId, accountId]);
  const openCreate = () => { setCardEditing(false); setCardError(''); setEditing(null); setEditingAccountId(accountId ?? null); setType('DEPOSIT'); setDate(today()); setAmount(''); setGross(''); setTax(''); setSecurityId(''); setSecurityName(''); setMemo(''); setError(''); setFieldErrors({}); setOpen(true); enterInput(); };
  const openEdit = (entry: CashTransactionDto, fromCard = false) => {
    setCardEditing(fromCard); setCardError('');
    setEditing(entry); setEditingAccountId(accountId ?? null); setType(entry.transactionType);
    setDate(new Date(entry.transactionDate).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }));
    setAmount(entry.amount); setGross(entry.dividend?.grossAmount ?? ((entry.transactionType === 'BUY' || entry.transactionType === 'SELL') ? cashDifference(entry.balanceAfter ?? '',entry.feeTaxAmount,'add') : ''));
    setTax(entry.dividend ? cashDifference(entry.dividend.grossAmount,entry.dividend.netAmount) : entry.feeTaxAmount);
    setAfter(entry.balanceAfter ?? '');
    setSecurityId(entry.dividend?.securityId ?? ''); setSecurityName(entry.dividend?.securityName ?? ''); setMemo(entry.memo ?? ''); setError(''); setFieldErrors({}); setOpen(true); enterInput();
  };
  const invalidateCash = async () => invalidatePortfolio(queryClient);
  const latestEntry = !balance.isError ? balance.data?.recentTransactions[0] : undefined;
  const editBalance = () => {
    if (balance.isError || !balance.data) { setCardError('최신 내역 조회에 실패했습니다. 다시 조회해 주세요.'); return; }
    if (!latestEntry) { setCardError('예수금 내역이 없습니다. 입금을 등록해 주세요.'); return; }
    openEdit(latestEntry, true);
  };
  useEffect(() => { setCardError(''); }, [accountId]);
  const openPeriodPicker = () => { setChosenYear(mode === 'month' ? Number(month.slice(0, 4)) : year); setChosenMonth(Number(month.slice(5))); setPeriodPicker(true); };
  const selectPeriod = () => { if (chosenYear > Number(initialMonth.slice(0, 4)) || (mode === 'month' && `${chosenYear}-${String(chosenMonth).padStart(2, '0')}` > initialMonth)) return; if (mode === 'month') setMonth(`${chosenYear}-${String(chosenMonth).padStart(2, '0')}`); else setYear(chosenYear); setOlderMonths(0); setPeriodPicker(false); };

  const changePeriod = (delta: number) => {
    setOlderMonths(0);
    if (mode === 'month') setMonth((previous) => { const next = monthShift(previous, delta); return next > initialMonth ? previous : next; });
    else setYear((previous) => Math.min(Number(initialMonth.slice(0, 4)), previous + delta));
  };
  const handleTouchEnd = (x: number, y: number) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const horizontal = x - start.x;
    if (Math.abs(horizontal) > 55 && Math.abs(horizontal) > Math.abs(y - start.y)) changePeriod(horizontal < 0 ? 1 : -1);
  };
  const submit = async () => {
    if (mutationLock.current) return;
    if (!accountId || accountId !== editingAccountId) { setError('계좌가 변경됐습니다. 다시 열어 주세요.'); return; }
    const invalid: Record<string, string> = {};
    if (!date || Number.isNaN(new Date(date).getTime())) invalid.date = '거래일자를 선택해 주세요.';
    if (!/^\d+(?:\.\d+)?$/.test(amount) || Number(amount) <= 0) invalid.amount = '0원보다 큰 금액을 입력해 주세요.';
    if (type === 'DIVIDEND') {
      if (!securityId) invalid.security = '배당 종목을 선택해 주세요.';
      if (!/^\d+(?:\.\d+)?$/.test(gross) || Number(gross) <= 0) invalid.gross = '세전 배당금을 입력해 주세요.';
      if (tax && (!/^\d+(?:\.\d+)?$/.test(tax) || Number(tax) < 0)) invalid.tax = '세금을 확인해 주세요.';
      if (Number(gross) < Number(amount) || Number(gross) < Number(tax)) invalid.amount = '세후 배당금은 세전 배당금을 넘을 수 없습니다.';
    }
    if(tradeEdit) {
      if(!/^\d+(?:\.\d+)?$/.test(gross)) invalid.gross='세전예수금을 입력해 주세요.';
      if(!/^\d+(?:\.\d+)?$/.test(after)) invalid.amount='세후예수금을 입력해 주세요.';
      if(!/^-?\d+(?:\.\d+)?$/.test(tax) || Number(cashDifference(gross,after))!==Number(tax)) invalid.tax='제세금을 확인해 주세요.';
    }
    if (editing && !/^\d+(?:\.\d+)?$/.test(after)) invalid.after = '세후예수금을 입력해 주세요.';
    setFieldErrors(invalid);
    if (Object.keys(invalid).length) { ({ gross: grossRef, tax: taxRef, amount: amountRef } as Record<string, typeof amountRef>)[Object.keys(invalid)[0]]?.current?.focus(); return; }
    mutationLock.current = true;
    setSaving(true); setError('');
    try {
      const transactionDate = new Date(`${date}T12:00:00+09:00`).toISOString();
      if (editing) await updateCashTransaction(editing.id, { transactionDate, amount, memo: memo || null, ...(type === 'DIVIDEND' ? { securityId, grossAmount: gross } : {}), ...(editing ? { balanceAfter: after, accountId, ...(cardEditing ? { expectedLatestId: editing.id } : {}) } : {}), ...(tradeEdit ? {feeTaxAmount:tax} : {}) });
      else if (type === 'DIVIDEND') await createDividend({ accountId, securityId, receivedDate: transactionDate, grossAmount: gross, netAmount: amount, memo: memo || null });
      else if(type==='DEPOSIT'||type==='WITHDRAWAL') await createCashTransaction({ accountId, transactionType: type, transactionDate, amount, memo: memo || null });
      await invalidateCash();
      closeInput(); setAmount(''); setMemo('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '예수금 등록에 실패했습니다.'); }
    finally { mutationLock.current = false; setSaving(false); }
  };
  const remove = async () => {
    if (mutationLock.current || !canDelete || !editing || !accountId || accountId !== editingAccountId) return;
    mutationLock.current = true;
    setSaving(true); setError('');
    try { await deleteCashTransaction(editing.id, accountId); await invalidateCash(); setConfirmDelete(false); closeInput(); }
    catch (cause) { setConfirmDelete(false); setError(cause instanceof Error ? cause.message : '삭제에 실패했습니다.'); }
    finally { mutationLock.current = false; setSaving(false); }
  };

  const period = mode === 'month' ? overview.data?.monthly : overview.data?.yearly;
  const entries = history.data?.data ?? [];
  const condition = JSON.stringify([accountId, mode, month, year]);
  const scrollStyle = { minWidth: 0, minHeight: 0, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, overscrollBehavior: 'contain' } as const;
  const primary = { height: 40, minWidth: 0, borderRadius: '8px', fontSize: 12, bgcolor: colors.buttonPrimary, color: '#fff' };
  const popupActions = (cancel: () => void, confirm: () => void, label: string, busy = false) => <Stack direction="row" spacing="8px" sx={{ mt: '24px' }}><Button disabled={busy} onClick={cancel} sx={{ ...primary, width: 88, bgcolor: '#0f1726', border: '1px solid ' + colors.border }}>취소</Button><Button disabled={busy} onClick={confirm} sx={{ ...primary, flex: 1 }}>{busy ? '저장 중…' : label}</Button></Stack>;
  const inputTitle = searching ? '배당 종목 검색' : editing ? `예수금 ${labels[type]} 수정` : '예수금 등록';
  const inputActions = <Stack direction="row" spacing="8px" sx={{pt:'4px'}}>
      {editing && <ActionButton tone="danger" disabled={saving || !canDelete} onClick={()=>setConfirmDelete(true)} sx={{width:80,height:48}}>삭제</ActionButton>}
      <ActionButton tone="muted" disabled={saving} onClick={closeInput} sx={{width:96,height:48}}>취소</ActionButton>
      <ActionButton disabled={saving} onClick={()=>void submit()} sx={{flex:1,height:48}}>{saving ? '저장 중…' : editing ? '저장' : '등록'}</ActionButton>
    </Stack>;
  const inputContent = searching ? <CashSearch accountId={editingAccountId ?? undefined} onSelect={security => {
    setSecurityId(security.id); setSecurityName(security.name); backFromSearch();
    requestAnimationFrame(() => grossRef.current?.focus());
  }} /> : <Stack spacing="8px" data-testid="cash-form" sx={{ '& .MuiInputBase-root + .MuiIconButton-root': {ml:'8px'}, '& .MuiTypography-root + .MuiIconButton-root': {ml:'8px'}, '& .MuiInputBase-root + img': {ml:'8px'}, '& input': { fontSize: '14px !important', fontWeight: '600 !important' }, '& .MuiFormControl-root > .MuiStack-root > .MuiBox-root > .MuiTypography-root': { fontSize: 12 } }}>
    {!tradeEdit && <Stack direction="row" spacing="6px">{(['DEPOSIT', 'WITHDRAWAL', 'DIVIDEND'] as const).map(option => <Button key={option} aria-pressed={type === option} disabled={saving || (!!editing && type !== option)} onClick={() => { setType(option); setFieldErrors({}); }} sx={{ flex: 1, height: 32, minWidth: 0, borderRadius: '10px', bgcolor: type === option ? colors.buttonPrimary : colors.surface, color: type === option ? '#fff' : colors.textMuted, fontSize: 14, fontWeight: 600 }}>{labels[option]}</Button>)}</Stack>}
    <DateField size="small" calendarIconSrc="/cash-v04/calendar.svg" label="거래일자" value={date} onChange={setDate} inputRef={dateRef} error={fieldErrors.date} disabled={saving} onEnter={() => type === 'DIVIDEND' || tradeEdit ? grossRef.current?.focus() : amountRef.current?.focus()} enterKeyHint="next" />
    {tradeEdit && <NumberField size="small" clearIconSrc="/stocks-v03/clear.svg" autoFocus label="세전예수금" value={gross} onChange={changeGross} suffix="원" inputRef={grossRef} error={fieldErrors.gross} disabled={saving} onEnter={()=>amountRef.current?.focus()} />}
    {type === 'DIVIDEND' && <>
      <Select size="small" displayEmpty value={securityId} disabled={saving||dividendLots.isPending} onChange={e=>{setSecurityId(e.target.value);setSecurityName(dividendOptions.find(s=>s.id===e.target.value)?.name??'');}} inputProps={{'aria-label':'배당 종목 선택',required:true}} sx={{height:36,bgcolor:colors.raised,fontSize:12}}><MenuItem value="" disabled>종목을 선택하세요.</MenuItem>{dividendOptions.map(stock=><MenuItem key={stock.id} value={stock.id}>{stock.name}</MenuItem>)}</Select>
      {dividendLots.isError&&<Button onClick={()=>void dividendLots.refetch()}>종목 조회 실패 · 다시 시도</Button>}
      {fieldErrors.security && <Typography role="alert" sx={{ fontSize: 11, color: colors.error }}>{fieldErrors.security}</Typography>}
      <NumberField size="small" clearIconSrc="/stocks-v03/clear.svg" autoFocus label="세전 배당" value={gross} onChange={changeGross} suffix="원" error={fieldErrors.gross} inputRef={grossRef} disabled={saving} enterKeyHint="next" onEnter={() => amountRef.current?.focus()} />
    </>}
    <NumberField size="small" clearIconSrc="/stocks-v03/clear.svg" autoFocus={type!=='DIVIDEND'&&!tradeEdit} label={tradeEdit ? '세후예수금' : type === 'DIVIDEND' ? '세후 배당' : '금액'} value={tradeEdit ? after : amount} onChange={value => {if(tradeEdit || type === 'DIVIDEND') changeAfter(value); else setAmount(value);}} suffix="원" error={fieldErrors.amount} inputRef={amountRef} disabled={saving} enterKeyHint="next" onEnter={() => (tradeEdit || type === 'DIVIDEND' ? taxRef : memoRef).current?.focus()} />
    {(tradeEdit || type === 'DIVIDEND') && <NumberField size="small" clearIconSrc="/stocks-v03/clear.svg" label="제세금" value={tax} onChange={changeTax} suffix="원" error={fieldErrors.tax} inputRef={taxRef} disabled={saving} enterKeyHint="next" onEnter={() => memoRef.current?.focus()} />}
    {editing && !tradeEdit && <NumberField size="small" clearIconSrc="/stocks-v03/clear.svg" label="세후예수금" value={after} onChange={setAfter} suffix="원" error={fieldErrors.after} disabled={saving} enterKeyHint="next" onEnter={() => memoRef.current?.focus()} />}
    <FormTextField size="small" clearIconSrc="/stocks-v03/clear.svg" label="메모" value={memo} onChange={setMemo} inputRef={memoRef} disabled={saving} enterKeyHint="done" onEnter={() => void submit()} />
    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{tradeEdit ? '제세금 반영 결과' : '변동 정보'}</Typography>
    <AppCard sx={{ p: '8px 14px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <Stack direction="row" sx={{ height: 18, justifyContent: 'space-between', alignItems: 'center' }}><Typography sx={{ fontSize: 11, color: colors.textMuted }}>{tradeEdit ? '제세금' : '변동금액'}</Typography><Typography sx={{ fontSize: 11, color: !tradeEdit && (type === 'WITHDRAWAL'||type==='BUY') ? colors.marketFall : colors.marketRise }}>{tradeEdit ? (tax !== '' ? formatWon(Number(tax)) : '—') : amount ? signed(((type === 'WITHDRAWAL'||type==='BUY') ? -1 : 1) * Number(amount)) : '—'}</Typography></Stack>
      <Stack direction="row" sx={{ height: 18, justifyContent: 'space-between', alignItems: 'center' }}><Typography sx={{ fontSize: 11, color: colors.textMuted }}>{'거래 후 예수금'}</Typography><Typography sx={{ fontSize: 12 }}>{editing ? (after !== '' ? formatWon(Number(after)) : '—') : !balance.isError && balance.data && (Number.isFinite(cashNumber(balance.data.account.currentBalance)) || (balance.data.account.balanceStatus === 'NO_TRANSACTIONS' && type === 'DEPOSIT')) && amount ? formatWon(Number(balance.data.account.currentBalance) + (((type === 'WITHDRAWAL'||type==='BUY') ? -1 : 1) * Number(amount))) : '—'}</Typography></Stack>
    </AppCard>
    {editing && !tradeEdit && <Typography sx={{ fontSize: 11, color: colors.textMuted }}>최신 내역의 세후예수금만 현재예수금에 반영됩니다. 이후 내역과 과거 스냅샷은 재계산하지 않습니다.</Typography>}
    {error && <Typography role="alert" sx={{ fontSize: 12, color: colors.error }}>{error}</Typography>}

  </Stack>;

  return <Box className="rox-home" data-testid="cash-page" data-screen-id={tablet ? 'T1300' : 'C1300'} sx={{ height: '100%', minHeight: 0, fontFamily: 'RoxHomeInter, sans-serif', '& .MuiButton-root': { minHeight: 0 } }}>
    <PageHeader embedded assetOverview title={!tablet && inputVisible ? inputTitle : '예수금'} backPath="/" showBackTablet={!tablet && inputVisible} onBack={!tablet && inputVisible ? () => { if (!saving) searching ? backFromSearch() : closeInput(); } : undefined} backIcon={<Box component="span" sx={{ fontSize: 30, width: 11 }}>‹</Box>} action={!tablet && inputVisible ? <Box /> : <IconButton aria-label="예수금 등록" onClick={openCreate} sx={{ width: 32, height: 32, p: 0, bgcolor: colors.raised, color: colors.textPrimary, fontSize: 22 }}>+</IconButton>} />
    <Box ref={bodyRef} data-scroll-region="cash-body" data-list-condition={!tablet && inputVisible ? params.get('cashInput') : condition} data-restoration-ready={inputVisible || !history.isPending || history.isError} sx={{ ...scrollStyle, height: '100%', overflowY: tablet ? 'hidden' : 'auto', pb: tablet ? 0 : '80px', boxSizing: 'border-box' }}>
      {!tablet && inputVisible ? <>{inputContent}{!searching && <Box sx={{bgcolor:colors.canvas,py:'8px'}}>{inputActions}</Box>}</> : accounts.isError ? <Button role="alert" onClick={() => void accounts.refetch()}>계좌 조회 실패 · 다시 시도</Button> : !accounts.isPending && !accountId ? <Typography role="status">선택된 계좌가 없습니다.</Typography> :
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0,1fr)', sm: 'repeat(2,minmax(0,1fr))' }, gap: '8px', height: { sm: '100%' }, minHeight: 0 }}>
          <Stack ref={leftRef} data-scroll-region="cash-left" data-list-condition={condition} spacing="8px" onTouchStart={event => { const touch = event.touches[0]; touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null; }} onTouchEnd={event => { const touch = event.changedTouches[0]; if (touch) handleTouchEnd(touch.clientX, touch.clientY); }} onTouchCancel={() => { touchStart.current = null; }} sx={{ ...scrollStyle, overflowY: { sm: 'auto' }, pb: { sm: '80px' }, height: { sm: '100%' }, boxSizing: 'border-box' }}>
            <AppCard data-testid="cash-balance" component="button" aria-busy={balance.isPending} onClick={editBalance} aria-label="현재 예수금 편집" sx={{ width: '100%', color: 'inherit', textAlign: 'left', cursor: 'pointer', height: 96, flexShrink: 0, p: '10px 16px 6px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <Stack direction="row" sx={{ height: 22, alignItems: 'center', justifyContent: 'space-between', width: '100%' }}><Typography sx={{ fontSize: 12, color: colors.textSecondary }}>현재 예수금</Typography><Box component="img" src="/cash-v04/edit.svg" alt="" sx={{ width: 16, height: 16 }} /></Stack>
              <Typography data-testid="cash-balance-value" sx={{ width: '100%', textAlign: 'right', color: allocation.cashColor, fontSize: 28, fontWeight: 700, lineHeight: '34px', overflowWrap: 'anywhere' }}>{balance.isError ? '—' : balance.data ? Number.isFinite(cashNumber(balance.data.account.currentBalance)) ? formatWon(Number(balance.data.account.currentBalance)) : '—' : <Skeleton width="70%" sx={{ ml: 'auto' }} />}</Typography>
              <Stack direction="row" sx={{width:'100%',justifyContent:'space-between',gap:'4px'}}><Typography data-testid="cash-year-tax" sx={{color:colors.marketFall,fontSize:10,lineHeight:'15px'}}>올해 제세금 {balance.isError ? '조회 실패' : balance.data?.currentYearTax ? formatWon(Number(balance.data.currentYearTax.amount)) : '—'}</Typography><Typography sx={{color:colors.textMuted,fontSize:10,lineHeight:'15px'}}>{balance.data?.account.updatedAt ? `계좌 기준 · ${shortDate(balance.data.account.updatedAt)} ${new Date(balance.data.account.updatedAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false })} 갱신` : ''}</Typography></Stack>
            </AppCard>
            {cardError && <Typography role="alert" sx={{ fontSize: 12, color: colors.error }}>{cardError}</Typography>}
            {!balance.isError && balance.data && balance.data.account.currentBalance == null && <Typography role="status" sx={{ fontSize: 12, color: colors.textMuted }}>{latestEntry ? '최신 내역의 세후예수금이 없습니다.' : '예수금 내역이 없습니다. 입금을 등록해 주세요.'}</Typography>}
            {balance.isError && <Button role="alert" onClick={() => void balance.refetch()}>예수금 조회 실패 · 다시 시도</Button>}
            <AppCard data-testid="cash-summary" sx={{ minHeight: 102, flexShrink: 0, px: '14px', pt: '12px', pb: '11px', borderRadius: '8px' }}>
              <Stack direction="row" sx={{ height: 24, alignItems: 'center' }}>
                <IconButton aria-label="이전 기간" onClick={() => changePeriod(-1)} sx={{ width: 24, height: 24, p: 0 }}><ChevronLeftRounded sx={{ fontSize: 16 }} /></IconButton>
                <Button aria-label="기간 직접 선택" onClick={openPeriodPicker} sx={{ flex: 1, minWidth: 0, p: 0, fontSize: 15, fontWeight: 600, color: colors.textPrimary }}>{mode === 'month' ? month.replace('-', '.') : `${year}년`}</Button>
                <IconButton aria-label="다음 기간" disabled={mode === 'month' ? month >= initialMonth : year >= Number(initialMonth.slice(0, 4))} onClick={() => changePeriod(1)} sx={{ width: 24, height: 24, p: 0 }}><ChevronRightRounded sx={{ fontSize: 16 }} /></IconButton>
                <Button aria-label="월간 연간 전환" onClick={() => { setMode(previous => previous === 'month' ? 'year' : 'month'); setOlderMonths(0); }} sx={{ ml: '8px', width: 54, minWidth: 54, height: 22, p: 0, borderRadius: '11px', bgcolor: colors.raised, color: colors.focus, fontSize: 10 }}>{mode === 'month' ? '월간' : '연간'}</Button>
              </Stack>
              <Box sx={{ height: '1px', bgcolor: colors.border, my: '7px' }} />
              <Stack direction="row" spacing="8px" sx={{ height: 38 }}>{(['withdrawal', 'deposit', 'dividend'] as const).map((key, index) => <Box key={key} sx={{ flex: 1, minWidth: 0, pr: index < 2 ? '8px' : 0, borderRight: index < 2 ? '1px solid ' + colors.border : undefined, color: key === 'withdrawal' ? colors.marketFall : colors.marketRise }}><Typography sx={{ fontSize: 11, lineHeight: '15px' }}>{key === 'withdrawal' ? '출금' : key === 'deposit' ? '입금' : '배당'}</Typography><Typography sx={{ fontSize: 10, fontWeight: 600, textAlign: 'right', mt: '3px', overflowWrap: 'anywhere' }}>{period && !overview.isError ? Number.isFinite(cashNumber(period[key])) ? signed((key === 'withdrawal' ? -1 : 1) * Number(period[key])) : '—' : overview.isError ? '—' : <Skeleton />}</Typography></Box>)}</Stack>
              {overview.isError && <Button role="alert" onClick={() => void overview.refetch()} sx={{ fontSize: 10, p: 0 }}>기간 조회 실패 · 다시 시도</Button>}
            </AppCard>
            <CashTrend accountId={accountId} range={range} />
          </Stack>
          <Box ref={rightRef} data-scroll-region="cash-right" data-list-condition={condition} sx={{ ...scrollStyle, overflowY: { sm: 'auto' }, pb: { sm: '80px' }, height: { sm: '100%' }, boxSizing: 'border-box' }}>
            <AppCard data-testid="cash-history" sx={{ borderRadius: '8px', p: '13px 14px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <Stack direction="row" sx={{ height: 22, alignItems: 'center', justifyContent: 'space-between' }}><Typography sx={{ fontSize: 16, fontWeight: 600 }}>변경내역</Typography><Typography data-testid="cash-history-total" sx={{ fontSize: 10, color: colors.textMuted }}>{history.data ? `총 ${history.data.meta.total.toLocaleString('ko-KR')}개` : '총 —개'}</Typography></Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: '42px 64px 72px minmax(0,1fr)', gap: '8px', height: 16, color: colors.textMuted, fontSize: 10 }}><Box>구분</Box><Box sx={{ textAlign: 'center' }}>날짜</Box><Box sx={{textAlign:'right'}}>제세금</Box><Box data-testid="cash-amount-heading" sx={{ textAlign: 'right' }}>잔액(세후)</Box></Box>
              {entries.map(entry => { const editable = true; const tone = entry.transactionType === 'BUY' || entry.transactionType === 'WITHDRAWAL' ? colors.marketFall : colors.marketRise; return <Box data-scroll-item={entry.id} data-testid="cash-history-row" key={entry.id} component={editable ? 'button' : 'div'} onClick={editable ? () => openEdit(entry) : undefined} aria-label={editable ? `${labels[entry.transactionType]} 내역 수정` : undefined} sx={{ width: '100%', display: 'grid', gridTemplateColumns: '42px 64px 72px minmax(0,1fr)', gap: '8px', alignItems: 'center', height: 20, border: 0, p: 0, bgcolor: 'transparent', cursor: editable ? 'pointer' : 'default', textAlign: 'left' }}><Typography sx={{ fontSize: 12, color: tone }}>{labels[entry.transactionType]}</Typography><Typography sx={{ fontSize: 10, color: colors.textMuted, textAlign: 'center' }}>{shortDate(entry.transactionDate)} {new Date(entry.transactionDate).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hour12:false})}</Typography><Typography data-testid="cash-row-tax" sx={{fontSize:10,color:colors.textMuted,textAlign:'right'}}>{formatWon(Number(entry.feeTaxAmount))}</Typography><Typography data-testid="cash-row-amount" sx={{ fontSize: 12, fontWeight: 600, color: tone, textAlign: 'right', whiteSpace: 'nowrap' }}>{Number.isFinite(cashNumber(entry.balanceAfter)) ? formatWon(Number(entry.balanceAfter)) : '—'}</Typography></Box>; })}
              {history.isPending && <Skeleton height={60} />}
              {history.isError && <Button role="alert" onClick={() => void history.refetch()} sx={{ fontSize: 11 }}>내역 조회 실패 · 다시 시도</Button>}
              {!history.isPending && !history.isError && !entries.length && <Typography role="status" sx={{ fontSize: 12, color: colors.textMuted }}>내용이 없습니다.</Typography>}

              {olderError && <Button role="alert" onClick={() => void loadOlder()} sx={{fontSize:11}}>{olderError}</Button>}
              <Button disabled={history.isFetching || olderLoading || history.isError || !history.data} onClick={() => void loadOlder()} sx={{ height: 36, flexShrink: 0, minWidth: 0, p: 0, color: colors.focus, fontSize: 11 }}>이전 1개월 불러오기</Button>
            </AppCard>
          </Box>
        </Box>}
    </Box>
    {!tablet && <OverlayRegionScrollbar scrollRef={bodyRef} label="예수금 본문 스크롤" offset={4} />}
    {tablet && <><OverlayRegionScrollbar scrollRef={leftRef} label="예수금 왼쪽 스크롤" offset={4} /><OverlayRegionScrollbar scrollRef={rightRef} label="예수금 오른쪽 스크롤" offset={4} /></>}
    <CashPopup input actions={tablet && inputVisible && !searching ? inputActions : undefined} open={tablet && inputVisible} title={inputTitle} onClose={() => { if (!saving) searching ? backFromSearch() : closeInput(); }}>{tablet && inputVisible && inputContent}</CashPopup>
    <CashPopup open={periodPicker} title={mode === 'month' ? '월간 기간 선택' : '연간 기간 선택'} onClose={() => setPeriodPicker(false)}>
      <Typography sx={{ fontSize: 11, color: colors.textMuted, pb: '8px', mb: '12px', borderBottom: '1px solid ' + colors.border }}>현재 기간 · {mode === 'month' ? month.replace('-', '년 ') + '월' : `${year}년`}</Typography>
      <Stack direction="row" sx={{ height: 36, border: '1px solid ' + colors.border, borderRadius: '8px', alignItems: 'center', mb: '12px' }}><IconButton aria-label="기간 선택 이전 연도" onClick={() => setChosenYear(previous => previous - (mode === 'month' ? 1 : 12))} sx={{ width: 36, p: 0 }}>‹</IconButton><Typography sx={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 600 }}>{mode === 'month' ? `${chosenYear}년` : `${Math.floor(chosenYear / 12) * 12}–${Math.floor(chosenYear / 12) * 12 + 11}년`}</Typography><IconButton aria-label="기간 선택 다음 연도" disabled={mode === 'month' ? chosenYear >= Number(initialMonth.slice(0, 4)) : Math.floor(chosenYear / 12) >= Math.floor(Number(initialMonth.slice(0, 4)) / 12)} onClick={() => setChosenYear(previous => previous + (mode === 'month' ? 1 : 12))} sx={{ width: 36, p: 0 }}>›</IconButton></Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: '8px' }}>{Array.from({ length: 12 }, (_, i) => { const value = mode === 'month' ? i + 1 : Math.floor(chosenYear / 12) * 12 + i; const selected = mode === 'month' ? chosenMonth === value : chosenYear === value; const disabled = mode === 'month' ? `${chosenYear}-${String(value).padStart(2, '0')}` > initialMonth : value > Number(initialMonth.slice(0, 4)); return <Button key={value} aria-pressed={selected} disabled={disabled} onClick={() => mode === 'month' ? setChosenMonth(value) : setChosenYear(value)} sx={{ minWidth: 0, width: '100%', height: 32, p: 0, borderRadius: '8px', boxShadow: 'inset 0 0 0 1px ' + (selected ? colors.buttonPrimary : colors.borderStrong), bgcolor: selected ? colors.buttonPrimary : '#0f1726', color: colors.textPrimary, fontSize: 11 }}>{mode === 'month' ? `${value}월` : value}</Button>; })}</Box>
      <Typography sx={{ fontSize: 10, color: colors.textMuted, mt: '8px' }}>미래 기간은 선택할 수 없습니다.</Typography>
      {popupActions(() => setPeriodPicker(false), selectPeriod, '선택')}
    </CashPopup>
    <ConfirmActionDialog open={confirmDelete} width={306} title={`${labels[type]} 내역을 삭제할까요?`} name={type==='DIVIDEND'?securityName:undefined} detail={date.replaceAll('-','.')} amount={editing?signed(Number(editing.signedAmount)):undefined} onClose={()=>setConfirmDelete(false)} onConfirm={()=>void remove()} busy={saving}>현재·과거 예수금은 자동으로 재계산하지 않습니다. 원본 매수·매도 기록은 유지됩니다.</ConfirmActionDialog>
  </Box>;
}
