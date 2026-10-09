import { colors } from '../styles/tokens';

// RGB interpolation is for bars only; amount/percentage text uses fixed tokens.
function mix(start: string, end: string, ratio: number) {
  const channels = [1, 3, 5].map(index => {
    const from = parseInt(start.slice(index, index + 2), 16);
    const to = parseInt(end.slice(index, index + 2), 16);
    return Math.round(from + (to - from) * ratio).toString(16).padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

/** Composition only: never use investment principal or rounded display percentages. */
export function cashAllocation(stockValue: number | string | null | undefined, cashBalance: number | string | null | undefined, pricingComplete = true) {
  const stock = stockValue == null ? NaN : Number(stockValue);
  const cash = cashBalance == null ? NaN : Number(cashBalance);
  const total = stock + cash;
  const available = pricingComplete && Number.isFinite(stock) && Number.isFinite(cash) && Number.isFinite(total) && stock >= 0 && cash >= 0 && total > 0;
  if (!available) return { available: false, stockPercent: NaN, cashPercent: NaN, stockColor: colors.textMuted as string, cashColor: colors.textMuted as string, stockBarColor: colors.textMuted as string, cashBarColor: colors.textMuted as string };
  const cashPercent = cash / total * 100;
  // Compare before display rounding, including exact 20% and 30% boundaries.
  const stable = cash * 5 > total && cash * 10 < total * 3;
  const shade = stable ? (cashPercent - 20) / 10 : Math.min(cashPercent, 50) / 50;
  return {
    available: true, stockPercent: 100 - cashPercent, cashPercent,
    stockColor: stable ? colors.positive : colors.marketRise,
    cashColor: stable ? colors.warning : colors.marketFall,
    stockBarColor: stable ? mix('#22C55E', '#A7F3D0', shade) : mix('#EF4444', '#FECACA', shade),
    cashBarColor: stable ? mix('#FEF08A', '#EAB308', shade) : mix('#BFDBFE', '#3B82F6', shade),
  };
}
