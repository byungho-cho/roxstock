export const analysisPeriods = [{ value: '1m', label: '1개월', months: 1 }, { value: '3m', label: '3개월', months: 3 }, { value: '6m', label: '6개월', months: 6 }, { value: '1y', label: '1년', months: 12 }, { value: 'all', label: '전체', months: 0 }] as const;
export type AnalysisPeriod = typeof analysisPeriods[number]['value'];
export function analysisRange(period: AnalysisPeriod, today: string) {
  const months = analysisPeriods.find(item => item.value === period)!.months;
  if (!months) return { to: today };
  const date = new Date(today + 'T00:00:00Z'), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() - months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return { from: date.toISOString().slice(0, 10), to: today };
}
export function periodLabel(from?: string | null, to?: string | null) {
  return from && to ? `${from.slice(2).replaceAll('-', '.')} ~ ${to.slice(2).replaceAll('-', '.')}` : '—';
}
export function decimalValue(value: string | null | undefined) {
  return value == null || value.trim() === '' ? Number.NaN : Number(value);
}
