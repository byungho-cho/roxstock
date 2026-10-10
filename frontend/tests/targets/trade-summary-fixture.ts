// Fixtures expose the same compact contract as the stock-list API.
export function tradeFixtureData(url: URL, trades: any[]) {
  if (url.searchParams.get('view') !== 'stocks') return trades;
  const rows = new Map<string, any>();
  for (const trade of trades) {
    const row = rows.get(trade.security.id) ?? { security: trade.security, realizedProfitLoss: null, lastSoldAt: null };
    if (trade.type === 'SELL') {
      row.realizedProfitLoss = String(Number(row.realizedProfitLoss ?? 0) + Number(trade.realizedProfitLoss ?? 0));
      if (!row.lastSoldAt || trade.tradedAt > row.lastSoldAt) row.lastSoldAt = trade.tradedAt;
    }
    rows.set(trade.security.id, row);
  }
  return [...rows.values()];
}
