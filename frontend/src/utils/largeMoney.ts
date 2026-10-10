const wonFormatter = new Intl.NumberFormat('ko-KR', {maximumFractionDigits:0});
const abbreviatedFormatter = new Intl.NumberFormat('ko-KR', {maximumFractionDigits:2});
/** Keep the stored won value unchanged; abbreviate only the display. */
export function largeMoney(value: string | number | null | undefined) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const n = Number(value), magnitude = Math.abs(n);
  const [scale, unit] = magnitude >= 1e12 ? [1e12, '조원'] : magnitude >= 1e8 ? [1e8, '억원'] : [1, '원'];
  return (scale === 1 ? wonFormatter : abbreviatedFormatter).format(n / Number(scale)) + unit;
}
