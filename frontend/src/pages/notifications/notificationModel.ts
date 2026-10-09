export type NoticeKind = 'buy' | 'sell' | 'dividend';
export interface BrokerNotice {
  kind: NoticeKind; maskedAccount: string; symbol: string; name: string;
  quantity: string; price: string; amount: string; gross: string; tax: string;
  orderNumber: string; warnings: string[];
}
export interface InboxEntry {
  id: string; raw: string; receivedAt: number; status: 'pending' | 'completed' | 'ignored';
  sample?: boolean;
  submission?: { accountId: string; kind: NoticeKind; body: Record<string, unknown> };
}
const field = (text: string, label: string) => text.match(new RegExp(label + '\\s*[:：]\\s*([^\\n]+)'))?.[1].trim() ?? '';
const number = (value: string) => value.match(/^([\d,]+(?:\.\d+)?)/)?.[1].replaceAll(',', '') ?? '';
export function parseBrokerNotice(raw: string): BrokerNotice | null {
  if (!raw.includes('[미래에셋증권]')) return null;
  const trade = /\[미래에셋증권\]\s*전량체결/.test(raw);
  const side = field(raw, '매매구분');
  const dividend = raw.includes('권리 입금 안내') && /배당금\s*입금/.test(raw);
  if (!(trade && /^(매수|매도)$/.test(side)) && !dividend) return null;
  const code = raw.match(/\bA([0-9A-Z]{6})\b/)?.[1] ?? '';
  const stock = field(raw, '종목명').replace(/\([^)]*\)/g, '').trim();
  const name = stock || raw.match(/\bA[0-9A-Z]{6}\s+([^\n]+)/)?.[1].trim() || '';
  const quantity = number(field(raw, '체결수량')), price = number(field(raw, '체결단가'));
  const amount = number(field(raw, dividend ? '세후금액' : '체결금액'));
  const gross = number(field(raw, '배정금액'));
  const income = number(field(raw, '(?<!지방)소득세')), local = number(field(raw, '지방소득세'));
  const tax = income && local ? String(Number(income) + Number(local)) : '';
  const warnings: string[] = [];
  if (!code) warnings.push('종목코드를 읽지 못했습니다. 종목을 직접 선택하세요.');
  if (trade && (!quantity || !price)) warnings.push('체결수량 또는 단가가 누락됐습니다. 원본을 확인하세요.');
  if (trade && amount && quantity && price && Math.abs(Number(amount) - Number(quantity) * Number(price)) > 0.01) warnings.push('수량 × 단가와 체결금액이 다릅니다. 전체 체결 내역을 확인하세요.');
  if (trade && number(field(raw, '주문수량')) !== quantity) warnings.push('주문수량과 체결수량이 다릅니다. 분할 체결의 전체 수량을 확인하세요.');
  if (dividend && (!gross || !amount)) warnings.push('배당금 정보가 누락됐습니다. 원본을 확인하세요.');
  if (dividend && tax && gross && amount && Number(gross) - Number(tax) !== Number(amount)) warnings.push('세전·세금·세후 금액이 맞지 않습니다. 원본을 확인하세요.');
  return { kind: dividend ? 'dividend' : side === '매도' ? 'sell' : 'buy', maskedAccount: raw.match(/[0-9*]+(?:-[0-9*]+){2,}/)?.[0] ?? '', symbol: code, name, quantity, price, amount, gross, tax, orderNumber: number(field(raw, '주문번호')), warnings };
}
export function matchesMaskedAccount(masked: string, full: string | null | undefined): boolean {
  const mask = masked.replace(/[-\s]/g, ''), actual = (full ?? '').replace(/[-\s]/g, '');
  return /^[\d*]+$/.test(mask) && /\d/.test(mask) && /^\d+$/.test(actual) && mask.length === actual.length && [...mask].every((char, index) => char === '*' || char === actual[index]);
}
export function resolveNoticeAccount<T extends { id: string; accountNumber?: string | null; isActive?: boolean }>(masked: string, accounts: T[], currentId?: string): T | undefined {
  const matches = accounts.filter(account => account.isActive !== false && matchesMaskedAccount(masked, account.accountNumber));
  return matches.length === 1 && matches[0].id === currentId ? matches[0] : undefined;
}
export const kstInput = (milliseconds: number) => new Date(milliseconds + 9 * 3600_000).toISOString().slice(0, 19);
export const notificationLabels: Record<NoticeKind, string> = { buy: '매수', sell: '매도', dividend: '배당' };
