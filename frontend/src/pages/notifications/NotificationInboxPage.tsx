import { useEffect, useRef, useState } from 'react';
import { Alert, Badge, Box, Button, Card, FormControlLabel, Checkbox, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { NotificationsOutlined } from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/navigation/Navigation';
import { NumberField, FormTextField } from '../../components/forms/Fields';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { createBuyTrade, createSellTrade, createDividend, getBuyLots, listSecurities, selectedAccountStorageKey, type AccountDto, type BuyTradeInput, type SellTradeInput } from '../../data/roxstockApi';
import { ApiError } from '../../data/apiClient';
import { invalidatePortfolio } from '../../data/invalidatePortfolio';
import { liveApiEnabled } from '../../data/liveData';
import { addSample, finishInbox, getInboxEntry, inboxError, nativeRequest, patchInbox, syncInbox, useInbox } from './inboxStore';
import { kstInput, notificationLabels, parseBrokerNotice, resolveNoticeAccount, type InboxEntry } from './notificationModel';

const demoAccounts: AccountDto[] = [
  { id: 'sample-1', name: '샘플 계좌 1', brokerName: '미래에셋증권', accountNumber: '010-1234-5678-0', cashBalance: '10000000', isActive: true },
  { id: 'sample-2', name: '샘플 계좌 2', brokerName: '미래에셋증권', accountNumber: '010-9876-5432-0', cashBalance: '10000000', isActive: true },
];

export function NotificationBadge() {
  const entries = useInbox(), navigate = useNavigate();
  useEffect(() => {
    if (!window.RoxStockNative) return;
    let running = false;
    const refresh = async () => { if (running) return; running = true; try { await syncInbox(); } catch { /* Inbox page provides retry and detailed errors. */ } finally { running = false; } };
    void refresh(); const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
    return () => clearInterval(timer);
  }, []);
  if (!window.RoxStockNative && entries.length === 0) return null;
  return <IconButton aria-label="거래 알림 목록" onClick={() => navigate('/detail/notifications')} sx={{ position: 'fixed', right: 12, bottom: 100, zIndex: 15, bgcolor: '#172235', border: '1px solid #334155' }}><Badge badgeContent={entries.filter(entry => entry.status === 'pending').length} color="warning"><NotificationsOutlined /></Badge></IconButton>;
}

export function NotificationInboxPage() {
  const entries = useInbox(), [params, setParams] = useSearchParams();
  const { accounts, accountId } = useActiveAccount();
  const selected = entries.find(entry => entry.id === params.get('notice'));
  const [error, setError] = useState(''), [permission, setPermission] = useState<boolean | null>(null);
  const refresh = async () => { try { const reply = await syncInbox(); setPermission(reply.permission ?? false); setError(inboxError()); } catch (cause) { setError((cause as Error).message); } };
  useEffect(() => { if (window.RoxStockNative) void refresh(); }, []);
  return <Stack spacing={2} sx={{ pb: 10 }}>
    <PageHeader title="거래 알림" showAdd={false} backPath={selected ? '/detail/notifications' : '/more'} />
    {error && <Alert severity="error">{error}</Alert>}
    {selected ? <NoticeReview key={selected.id} entry={selected} accounts={selected.sample ? demoAccounts : (accounts.data ?? []).filter(account => account.isActive)} currentId={selected.sample ? 'sample-1' : accountId} onClose={() => setParams({})} /> : <>
      <Typography>등록 대기 {entries.filter(entry => entry.status === 'pending').length}건</Typography>
      <Typography variant="body2" color="text.secondary">알림을 선택하면 등록 화면에 자동 입력됩니다. 저장을 눌러야 거래에 반영됩니다.</Typography>
      {window.RoxStockNative && <Stack direction="row" spacing={1}><Button onClick={() => void nativeRequest('permission').catch(cause => setError(cause.message))}>{permission ? '알림 접근 설정' : '알림 접근 허용'}</Button><Button onClick={() => void refresh()}>새로고침</Button></Stack>}
      {!window.RoxStockNative && <Alert severity="info">웹에서는 카카오톡 알림을 수신하지 않습니다. 샘플로 화면 흐름을 확인할 수 있습니다.</Alert>}
      <Card sx={{ p: 2 }}><Typography>샘플 테스트 · 실제 거래 저장 없음</Typography><Stack direction="row" sx={{ flexWrap: 'wrap' }}>{(['buy', 'sell', 'dividend'] as const).map(kind => <Button key={kind} onClick={() => { try { addSample(kind); } catch { setError('샘플 보관에 실패했습니다. 저장 공간을 확인하세요.'); } }}>{notificationLabels[kind]} 샘플</Button>)}<Button onClick={() => addSample('buy', '010-98**-**32-0')}>계좌 불일치 샘플</Button></Stack></Card>
      {entries.length === 0 && <Typography color="text.secondary">수신한 거래 알림이 없습니다.</Typography>}
      {entries.map(entry => { const parsed = parseBrokerNotice(entry.raw); return <Card key={entry.id} sx={{ p: 1.5 }}>
        <Button fullWidth sx={{ justifyContent: 'space-between', textAlign: 'left' }} onClick={() => setParams({ notice: entry.id })}><Box>{entry.sample && '[샘플] '}{parsed?.name} · {parsed ? notificationLabels[parsed.kind] : '알림'}<Typography variant="caption" sx={{ display: 'block' }}>{new Date(entry.receivedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</Typography></Box><span>{entry.status === 'completed' ? '등록 완료' : entry.status === 'ignored' ? '무시' : '등록 대기'}</span></Button>
      </Card>; })}
    </>}
  </Stack>;
}

function NoticeReview({ entry, accounts, currentId, onClose }: { entry: InboxEntry; accounts: AccountDto[]; currentId?: string; onClose: () => void }) {
  const parsed = parseBrokerNotice(entry.raw)!;
  const [chosen, setChosen] = useState(entry.submission?.accountId ?? resolveNoticeAccount(parsed.maskedAccount, accounts, currentId)?.id ?? '');
  const account = accounts.find(item => item.id === chosen);
  // Wait for account loading before deciding whether the current account is an unambiguous match.
  useEffect(() => { if (!chosen) setChosen(resolveNoticeAccount(parsed.maskedAccount, accounts, currentId)?.id ?? ''); }, [accounts, currentId, chosen, parsed.maskedAccount]);
  if (entry.status !== 'pending') return <><Alert severity="info">{entry.status === 'completed' ? '이미 등록한 알림입니다.' : '무시한 알림입니다.'}</Alert><Button onClick={onClose}>목록으로</Button></>;
  if (!account && entry.submission) return <Alert severity="warning">이 알림은 계좌 {entry.submission.accountId}에 저장 요청한 내역이 있습니다. 해당 계좌를 불러올 수 없어 재등록을 중단했습니다. 계좌와 거래 내역을 확인하세요.</Alert>;
  if (!account) return <Stack spacing={2}><Alert severity="info">현재 계좌와 일치하지 않거나 계좌를 확정할 수 없습니다. 등록할 계좌를 선택하세요.</Alert><Typography>알림 계좌: {parsed.maskedAccount || '확인 불가'}</Typography>{accounts.length === 0 && <Typography>계좌를 불러오는 중이거나 활성 계좌가 없습니다. 설정에서 계좌를 확인하세요.</Typography>}{accounts.map(item => <Button variant="outlined" key={item.id} onClick={() => { setChosen(item.id); if (!entry.sample) { localStorage.setItem(selectedAccountStorageKey, item.id); window.dispatchEvent(new Event('roxstock-selected-account')); } }}>{item.name} ({item.accountNumber || '번호 미등록'})</Button>)}<Button onClick={onClose}>취소 · 대기 유지</Button></Stack>;
  return <NotificationRegistrationForm entry={entry} account={account} onClose={onClose} />;
}

function NotificationRegistrationForm({ entry, account, onClose }: { entry: InboxEntry; account: AccountDto; onClose: () => void }) {
  const parsed = parseBrokerNotice(entry.raw)!, client = useQueryClient();
  const previous = entry.submission?.body;
  const [search, setSearch] = useState(parsed.symbol || parsed.name), [securityId, setSecurityId] = useState(String(previous?.securityId ?? '')), [lotId, setLotId] = useState(String(previous?.buyTradeId ?? ''));
  const [date, setDate] = useState(previous ? kstInput(Date.parse(String(previous.boughtAt ?? previous.soldAt ?? previous.receivedDate))) : kstInput(entry.receivedAt));
  const [quantity, setQuantity] = useState(String(previous?.quantity ?? parsed.quantity)), [price, setPrice] = useState(String(previous?.unitPrice ?? parsed.price)), [fee, setFee] = useState(String(previous?.feeTaxAmount ?? '0'));
  const [gross, setGross] = useState(String(previous?.grossAmount ?? parsed.gross)), [net, setNet] = useState(String(previous?.netAmount ?? parsed.amount)), [memo, setMemo] = useState(String(previous?.memo ?? ''));
  const [confirmed, setConfirmed] = useState(false), [negativeCash, setNegativeCash] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false), [submission, setSubmission] = useState(entry.submission);
  const securities = useQuery({ queryKey: ['notification-securities', account.id, search], queryFn: () => listSecurities({ accountId: account.id, query: search, limit: 30 }), enabled: !entry.sample && liveApiEnabled && !!search });
  const options = entry.sample ? [{ id: 'sample-stock', symbol: parsed.symbol, name: parsed.name }] : securities.data ?? [];
  const actualSecurityId = securityId || options.find(stock => stock.symbol === parsed.symbol)?.id || '';
  const lots = useQuery({ queryKey: ['notification-lots', account.id, actualSecurityId], queryFn: () => getBuyLots(account.id, actualSecurityId), enabled: !entry.sample && liveApiEnabled && parsed.kind === 'sell' && !!actualSecurityId });
  const lotOptions = entry.sample ? [{ id: 'sample-lot', boughtAt: '2026-01-01T03:00:00Z', remainingQuantity: '10', unitPrice: '1000000' }] : lots.data ?? [];
  const actualLotId = lotId || (lotOptions.length === 1 ? lotOptions[0].id : '');
  const selectedLot = lotOptions.find(lot => lot.id === actualLotId);
  const positive = (value: string) => /^\d+(?:\.\d+)?$/.test(value) && Number(value) > 0;
  const validDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(date) && Number.isFinite(Date.parse(date + '+09:00'));
  const valid = !!actualSecurityId && validDate && confirmed && (parsed.kind === 'dividend'
    ? positive(gross) && positive(net) && Number(gross) >= Number(net)
    : /^\d+$/.test(quantity) && Number(quantity) > 0 && positive(price) && /^\d+(?:\.\d+)?$/.test(fee) && (parsed.kind !== 'sell' || !!selectedLot && Number(quantity) <= Number(selectedLot.remainingQuantity) && date.slice(0, 10) >= kstInput(Date.parse(selectedLot.boughtAt)).slice(0, 10)));
  const disabled = busy || !!submission;
  const save = async () => {
    if (lock.current || (!submission && !valid) || getInboxEntry(entry.id)?.status !== 'pending') return;
    if (!entry.sample && !liveApiEnabled) { setError('실제 등록은 API 연결 환경에서만 가능합니다.'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      if (entry.sample) { await finishInbox(entry.id, 'completed'); onClose(); return; }
      let request = submission;
      if (!request) {
        const received = new Date(date + '+09:00').toISOString();
        const common = { accountId: account.id, requestId: entry.id, memo: memo || null };
        const body = parsed.kind === 'dividend' ? { ...common, securityId: actualSecurityId, receivedDate: received, grossAmount: gross, netAmount: net }
          : parsed.kind === 'buy' ? { ...common, securityId: actualSecurityId, boughtAt: received, quantity, unitPrice: price, feeTaxAmount: fee, allowNegativeCash: negativeCash }
          : { ...common, buyTradeId: actualLotId, soldAt: received, quantity, unitPrice: price, feeTaxAmount: fee };
        request = { accountId: account.id, kind: parsed.kind, body };
        // Persist the exact request before sending so a lost response cannot cause a new transaction.
        patchInbox(entry.id, { submission: request }); setSubmission(request);
      }
      if (request.kind === 'buy') await createBuyTrade(request.body as unknown as BuyTradeInput);
      else if (request.kind === 'sell') await createSellTrade(request.body as unknown as SellTradeInput);
      else await createDividend(request.body as Parameters<typeof createDividend>[0]);
      await finishInbox(entry.id, 'completed');
      void invalidatePortfolio(client).catch(() => undefined); onClose();
    } catch (cause) {
      // Validation rejection is safe to edit; timeout/5xx retains the same request for replay.
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && cause.code !== 'REQUEST_ID_REUSED' && cause.status !== 408 && cause.status !== 429) { patchInbox(entry.id, { submission: undefined }); setSubmission(undefined); }
      setError(cause instanceof Error ? cause.message : '저장에 실패했습니다.');
    } finally { lock.current = false; setBusy(false); }
  };
  return <Stack spacing={1.5} data-testid="notification-registration">
    {entry.sample && <Alert severity="info">샘플 테스트입니다. 저장을 눌러도 실제 계좌·거래·예수금은 변경되지 않습니다.</Alert>}
    <Typography variant="h6">{notificationLabels[parsed.kind]} 등록</Typography><Typography>{account.name} ({account.accountNumber || '번호 미등록'})</Typography>
    <Typography variant="body2" color="text.secondary">알림 계좌 {parsed.maskedAccount} · 최초 수신 {new Date(entry.receivedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</Typography>
    {submission && <Alert severity="warning">저장 결과를 확인하지 못한 요청이 있습니다. 입력값을 변경하지 않고 같은 요청으로 재확인합니다. 등록 대상 계좌: {submission.accountId}</Alert>}
    {parsed.warnings.map(warning => <Alert key={warning} severity="warning">{warning}</Alert>)}
    <TextField label="종목 검색" size="small" value={search} disabled={disabled || entry.sample} onChange={event => { setSearch(event.target.value); setSecurityId(''); setLotId(''); }} />
    <TextField select label="종목" size="small" value={actualSecurityId} disabled={disabled} onChange={event => { setSecurityId(event.target.value); setLotId(''); }}><MenuItem value="">종목을 선택하세요</MenuItem>{actualSecurityId && !options.some(stock => stock.id === actualSecurityId) && <MenuItem value={actualSecurityId}>저장 요청 종목 {actualSecurityId}</MenuItem>}{options.map(stock => <MenuItem key={stock.id} value={stock.id}>{stock.name} ({stock.symbol})</MenuItem>)}</TextField>
    {securities.isError && <Alert severity="error">종목 조회 실패 <Button onClick={() => void securities.refetch()}>재시도</Button></Alert>}
    <TextField label="거래일시 (한국시간)" type="datetime-local" size="small" value={date} disabled={disabled} onChange={event => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 1 } }} />
    {parsed.kind === 'sell' && <><TextField select label="매도할 매수 건" size="small" value={actualLotId} disabled={disabled} onChange={event => setLotId(event.target.value)}><MenuItem value="">매수 건 선택</MenuItem>{lotOptions.map(lot => <MenuItem key={lot.id} value={lot.id}>{kstInput(Date.parse(lot.boughtAt)).slice(0, 10)} · 잔여 {lot.remainingQuantity}주 · {Number(lot.unitPrice).toLocaleString()}원</MenuItem>)}</TextField>{lots.isError && <Alert severity="error">보유 내역 조회 실패 <Button onClick={() => void lots.refetch()}>재시도</Button></Alert>}<Typography variant="caption">여러 매수 건에 걸친 매도는 이 화면에서 합쳐 저장하지 않습니다. 수량에 맞는 매수 건이 없으면 기존 매도 화면에서 나눠 등록한 뒤 알림을 무시 처리하세요.</Typography></>}
    {parsed.kind === 'dividend' ? <><NumberField label="세전 배당금" value={gross} onChange={setGross} disabled={disabled} suffix="원" /><NumberField label="세후 배당금" value={net} onChange={setNet} disabled={disabled} suffix="원" /><Typography>제세금 합계: {Number.isFinite(Number(gross) - Number(net)) ? (Number(gross) - Number(net)).toLocaleString() : '—'}원</Typography></> : <><NumberField label="체결수량" value={quantity} onChange={setQuantity} disabled={disabled} suffix="주" /><NumberField label="체결단가" value={price} onChange={setPrice} disabled={disabled} suffix="원" /><NumberField label="수수료·세금" value={fee} onChange={setFee} disabled={disabled} suffix="원" /><Typography>체결금액: {(Number(quantity) * Number(price)).toLocaleString()}원</Typography><Typography variant="caption">알림에 수수료·세금이 없어 0원으로 입력했습니다. 실제 금액을 확인해 수정하세요.</Typography></>}
    <FormTextField label="메모" value={memo} onChange={setMemo} disabled={disabled} />
    <Box component="details"><Box component="summary">원본 알림 보기</Box><Box component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{entry.raw}</Box></Box>
    {parsed.kind === 'buy' && <FormControlLabel control={<Checkbox checked={negativeCash} disabled={disabled} onChange={event => setNegativeCash(event.target.checked)} />} label="예수금이 부족해도 등록 허용" />}
    <FormControlLabel control={<Checkbox checked={confirmed} disabled={disabled} onChange={event => setConfirmed(event.target.checked)} />} label="계좌, 종목, 전체 체결수량과 금액을 확인했습니다." />
    {error && <Alert severity="error">{error}</Alert>}
    <Stack direction="row" spacing={1}><Button disabled={busy} onClick={onClose}>취소 · 대기 유지</Button><Button disabled={busy || (!submission && !valid)} variant="contained" onClick={() => void save()}>{busy ? '저장 중' : submission ? '동일 요청 재확인' : entry.sample ? '샘플 저장 확인' : '확인 후 저장'}</Button></Stack>
    <Button disabled={busy || !!submission} color="inherit" onClick={() => { void finishInbox(entry.id, 'ignored').then(onClose).catch(cause => setError(cause.message)); }}>이 알림 무시</Button>
  </Stack>;
}
