export type MarketDirection = 'up' | 'down' | 'flat';

const numberFormatter = new Intl.NumberFormat('ko-KR', {
  maximumFractionDigits: 1,
});

export function formatAmount(value: number): string {
  const absolute = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absolute < 10_000) {
    return `${sign}${numberFormatter.format(absolute)}원`;
  }

  return `${sign}${numberFormatter.format(absolute / 10_000)}만원`;
}

export function formatSignedAmount(value: number): string {
  if (value === 0) return '0원';
  return `${value > 0 ? '+' : ''}${formatAmount(value)}`;
}

export const formatWon = (value: number): string => `${Math.round(value).toLocaleString('ko-KR')}원`;
export const formatSignedWon = (value: number): string => `${value > 0 ? '+' : ''}${formatWon(value)}`;
export const formatPercent = (value: number): string => `${value.toFixed(1)}%`;

export function formatRate(value: number, fractionDigits = 1): string {
  if (value === 0) return `${(0).toFixed(fractionDigits)}%`;
  return `${value > 0 ? '+' : ''}${value.toFixed(fractionDigits)}%`;
}

export function getDirection(value: number): MarketDirection {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}

export function getMarketColor(value: number): 'market.up' | 'market.down' | 'market.flat' {
  const direction = getDirection(value);
  return `market.${direction}`;
}

export function formatDate(date: string): string {
  return date.replaceAll('-', '.');
}
