export function formatWon(value: number) { return `${new Intl.NumberFormat('ko-KR').format(value)}원`; }
export function formatRate(value: number) { return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`; }
