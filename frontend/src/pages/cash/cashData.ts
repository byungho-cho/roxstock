import { getCashHistory, type AssetHistoryDto } from '../../data/roxstockApi';

export const cashToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
export function monthShift(month: string, delta: number) {
  const [year, number] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, number - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
export function cashRange(mode: 'month' | 'year', month: string, year: number, olderMonths = 0) {
  const start = mode === 'month' ? month : `${year}-01`;
  const end = mode === 'month' ? monthShift(month, 1) : `${year + 1}-01`;
  const last = new Date(end + '-01T00:00:00Z'); last.setUTCDate(0);
  return { from: monthShift(start, -olderMonths) + '-01', to: last.toISOString().slice(0, 10) };
}
export async function cashHistory(accountId: string, range: { from: string; to: string }) {
  const first = await getCashHistory(accountId, 100, 0, range);
  const rows = [...first.data];
  for (let offset = first.data.length; offset < first.meta.total;) {
    const page = await getCashHistory(accountId, 100, offset, range);
    if (!page.data.length) throw new Error('내역 조회가 완료되지 않았습니다. 다시 시도해 주세요.');
    rows.push(...page.data); offset += page.data.length;
  }
  return { ...first, data: [...new Map(rows.map(row => [row.id, row])).values()].sort((a, b) =>
    (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id.localeCompare(a.id, undefined, { numeric: true })) };
}
export function cashNumber(value: string | null | undefined) {
  return value == null || value.trim() === '' ? Number.NaN : Number(value);
}
// A daily snapshot gap is deliberately a break; an absent balance is never zero.
export function cashSegments(data: AssetHistoryDto['data']) {
  const segments: Array<Array<{ date: string; value: number }>> = [];
  let current: Array<{ date: string; value: number }> = [];
  for (const point of [...data].sort((a, b) => a.date.localeCompare(b.date))) {
    const value = cashNumber(point.cashBalance);
    const previous = current.at(-1);
    if (!Number.isFinite(value) || (previous && Date.parse(point.date) - Date.parse(previous.date) > 86_400_000)) {
      if (current.length) segments.push(current); current = [];
    }
    if (Number.isFinite(value)) current.push({ date: point.date, value });
  }
  if (current.length) segments.push(current);
  return segments;
}

// Decimal text arithmetic avoids rounding errors while editing the common amount fields.
export function cashDifference(before: string, value: string, operation: 'subtract' | 'add' = 'subtract') {
  if (!/^\d+(?:\.\d+)?$/.test(before) || !/^\d+(?:\.\d+)?$/.test(value)) return '';
  const scale = Math.max(before.split('.')[1]?.length ?? 0, value.split('.')[1]?.length ?? 0);
  const units = (text:string) => {const [integer,fraction='']=text.split('.');return BigInt(integer+fraction.padEnd(scale,'0'));};
  const difference=operation === 'add' ? units(before)+units(value) : units(before)-units(value), sign=difference<0n?'-':'';
  const digits=(difference<0n?-difference:difference).toString().padStart(scale+1,'0');
  return sign+(scale ? (digits.slice(0,-scale)+'.'+digits.slice(-scale)).replace(/\.?0+$/, '') : digits);
}
