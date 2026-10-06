/** Keep the stored won value unchanged; abbreviate only the display. */
export function largeMoney(value: string | number | null | undefined) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const n = Number(value), magnitude = Math.abs(n);
  const [scale, unit] = magnitude >= 1e12 ? [1e12, '조원'] : magnitude >= 1e8 ? [1e8, '억원'] : [1, '원'];
  return (n / Number(scale)).toLocaleString('ko-KR', { maximumFractionDigits: scale === 1 ? 0 : 2 }) + unit;
}
