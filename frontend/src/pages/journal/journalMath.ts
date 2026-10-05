export type JournalEntry = {
  id: string; type: 'buy' | 'sell'; date: string; stockId: string; stockName: string;
  quantity: number; price: number; profit?: number; lotId?: string; buyPrice?: number; sample?: boolean;
};
export const finiteNumber = (value: string | number | null | undefined): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};
export function sellEvaluation(entry: JournalEntry) {
  const cost = entry.buyPrice === undefined ? undefined : entry.buyPrice * entry.quantity;
  const profit = cost === undefined ? entry.profit : (entry.price - entry.buyPrice!) * entry.quantity;
  return { cost, profit, rate: cost && profit !== undefined ? profit / cost * 100 : undefined };
}
export function journalTotals(entries: JournalEntry[]) {
  const buys = entries.filter(entry => entry.type === 'buy'), sells = entries.filter(entry => entry.type === 'sell');
  const evaluations = sells.map(sellEvaluation);
  const sum = (values: (number | undefined)[]) => values.some(value => value === undefined) ? undefined : values.reduce<number>((total, value) => total + value!, 0);
  return {
    buyCount: buys.length, sellCount: sells.length,
    buy: buys.reduce((total, entry) => total + entry.quantity * entry.price, 0),
    sell: sells.reduce((total, entry) => total + entry.quantity * entry.price, 0),
    cost: sum(evaluations.map(value => value.cost)),
    profit: sum(evaluations.map(value => value.profit)),
  };
}
