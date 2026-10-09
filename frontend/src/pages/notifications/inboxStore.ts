import { useSyncExternalStore } from 'react';
import { parseBrokerNotice, type InboxEntry } from './notificationModel';

declare global { interface Window { RoxStockNative?: { postMessage: (message: string) => void; onmessage?: (event: { data: string }) => void } } }
const key = 'roxstock-notification-inbox-v1';
let items: InboxEntry[] = [];
let error = '';
try { items = JSON.parse(localStorage.getItem(key) ?? '[]'); if (!Array.isArray(items)) items = []; } catch { error = '알림 보관함을 읽지 못했습니다.'; }
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
export function inboxError() { return error; }
function persist(next: InboxEntry[]) {
  // Do not claim a successful state transition if durable storage fails.
  localStorage.setItem(key, JSON.stringify(next)); items = next; emit();
}
export const getInboxEntry = (id: string) => items.find(item => item.id === id);
export function useInbox() { return useSyncExternalStore(callback => { listeners.add(callback); return () => { listeners.delete(callback); }; }, () => items); }
export function patchInbox(id: string, update: Partial<Pick<InboxEntry, 'status' | 'submission'>>) { persist(items.map(item => item.id === id ? { ...item, ...update } : item)); }
const requests = new Map<string, { resolve: (value: NativeReply) => void; reject: (error: Error) => void; timer: number }>();
interface NativeReply { entries?: InboxEntry[]; permission?: boolean; storageError?: boolean; error?: string; requestId: string }
export async function nativeRequest(action: string, extra: object = {}): Promise<NativeReply> {
  const bridge = window.RoxStockNative;
  if (!bridge) throw new Error('안드로이드 앱에서 사용할 수 있습니다.');
  bridge.onmessage = event => {
    try {
      const reply = JSON.parse(event.data) as NativeReply, pending = requests.get(reply.requestId);
      if (!pending) return;
      clearTimeout(pending.timer); requests.delete(reply.requestId);
      if (reply.error) pending.reject(new Error(reply.error)); else pending.resolve(reply);
    } catch { /* Ignore malformed bridge replies; the pending request times out. */ }
  };
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timer = window.setTimeout(() => { requests.delete(requestId); reject(new Error('앱 알림 연결이 지연되고 있습니다. 다시 시도하세요.')); }, 5000);
    requests.set(requestId, { resolve, reject, timer });
    bridge.postMessage(JSON.stringify({ action, requestId, ...extra }));
  });
}
export async function syncInbox() {
  const reply = await nativeRequest('list');
  const next = new Map(items.map(item => [item.id, item]));
  for (const incoming of reply.entries ?? []) {
    if (!/^[a-f0-9]{64}$/.test(incoming.id) || !Number.isFinite(incoming.receivedAt) || !parseBrokerNotice(incoming.raw)) continue;
    const previous = next.get(incoming.id);
    next.set(incoming.id, previous ? { ...previous, status: previous.status !== 'pending' ? previous.status : incoming.status } : incoming);
  }
  persist([...next.values()].sort((a, b) => b.receivedAt - a.receivedAt));
  for (const item of items) if (!item.sample && item.status !== 'pending' && reply.entries?.some(entry => entry.id === item.id && entry.status === 'pending')) await nativeRequest('status', { id: item.id, status: item.status });
  error = reply.storageError ? '휴대폰 알림 보관 중 오류가 있었습니다. 원본과 목록을 대조해 주세요.' : ''; emit();
  return reply;
}
export async function finishInbox(id: string, status: 'completed' | 'ignored') {
  patchInbox(id, { status });
  if (window.RoxStockNative && !getInboxEntry(id)?.sample) await nativeRequest('status', { id, status });
}
export function addSample(kind: 'buy' | 'sell' | 'dividend', account = '010-12**-**78-0') {
  const raw = kind === 'dividend'
    ? `[미래에셋증권] 권리 입금 안내\n${account}\nA005380 현대자동차보통주\n배당금입금 되었습니다.\n배정금액 : 137,500원(세전)\n소득세 : 19,250원\n지방소득세 : 1,920원\n세후금액 : 116,330원`
    : `[미래에셋증권] 전량체결\n계좌번호 : ${account}\n종목명 : SK하이닉스(A000660)\n매매구분 : ${kind === 'buy' ? '매수' : '매도'}\n주문수량 : 1주\n체결수량 : 1주\n체결단가 : ${kind === 'buy' ? '1,681,000' : '1,930,000'}원\n체결금액 : ${kind === 'buy' ? '1,681,000' : '1,930,000'}원\n주문번호 : ${kind === 'buy' ? '10001' : '10002'}`;
  persist([{ id: crypto.randomUUID(), raw, receivedAt: Date.now(), status: 'pending', sample: true }, ...items]);
}
