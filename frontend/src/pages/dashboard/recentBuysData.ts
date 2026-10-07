import type { BuyLotDto } from '../../data/roxstockApi';

export const buyDate = (row: BuyLotDto) => row.buyDate || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date(row.boughtAt));
export function monthStart(today: string, monthsBack = 0) {
  return new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - monthsBack, 1)).toISOString().slice(0, 10);
}
export function recentBuys(rows: BuyLotDto[], today: string, monthsBack: number) {
  const unique = [...new Map(rows.map(row => [row.id, row])).values()];
  const ordered = unique.sort((a,b) => buyDate(b).localeCompare(buyDate(a)) || b.boughtAt.localeCompare(a.boughtAt) || b.id.localeCompare(a.id, undefined, { numeric: true }));
  const from = monthStart(today, monthsBack);
  const initial = new Set(ordered.slice(0, 5).map(row => row.id));
  const visible = ordered.filter(row => initial.has(row.id) || monthsBack > 0 && buyDate(row) >= from);
  return {
    count: visible.length,
    rows: visible,
    more: ordered.some(row => !initial.has(row.id) && (monthsBack === 0 || buyDate(row) < from)),
  };
}
