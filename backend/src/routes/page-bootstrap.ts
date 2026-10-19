import type { FastifyInstance } from 'fastify';
import { PageCache } from '@roxstock/shared/domain/page-cache';
import { id } from '../lib/input.js';
import { prisma } from '@roxstock/shared/lib/prisma';
import { realtimePriceCache } from '../realtime/price-cache.js';
import { loadAccounts } from './accounts.js';
import { loadDashboard, loadPortfolio, serializeHolding } from './portfolio.js';
import { loadSecurities } from './securities.js';
import { targetArrivalsResult } from './target-arrivals.js';
import { remainingBuyLots } from '../domain/recent-buy-lots.js';
import { recentBuysResult } from './recent-buys.js';
import { Prisma } from '@roxstock/shared/prisma';

export function stockTradeSummary(portfolio: Awaited<ReturnType<typeof loadPortfolio>>) {
  const rows = new Map<string, { security: { id: string; symbol: string; name: string; marketType: string }; realizedProfitLoss: Prisma.Decimal; lastSoldAt: Date | null }>();
  for (const lot of portfolio.account.buyTrades) {
    const key = String(lot.securityId);
    const row = rows.get(key) ?? { security: { id: key, symbol: lot.security.symbol, name: lot.security.name, marketType: lot.security.marketType }, realizedProfitLoss: new Prisma.Decimal(0), lastSoldAt: null };
    for (const sell of lot.sellTrades) {
      row.realizedProfitLoss = row.realizedProfitLoss.plus(sell.quantity.mul(sell.unitPrice.minus(lot.unitPrice)));
      if (!row.lastSoldAt || sell.soldAt > row.lastSoldAt) row.lastSoldAt = sell.soldAt;
    }
    rows.set(key, row);
  }
  return [...rows.values()].map(row => ({ ...row, realizedProfitLoss: row.lastSoldAt ? row.realizedProfitLoss.toString() : null, lastSoldAt: row.lastSoldAt?.toISOString() ?? null }));
}

/** Register on the root instance so committed mutations in every route invalidate pages. */
export function installPageBootstrap(app: FastifyInstance) {
  const cache = new PageCache();
  const unsubscribe = realtimePriceCache.subscribe(() => cache.clear());
  app.addHook('onClose', async () => { unsubscribe(); cache.clear(); });
  app.addHook('onSend', async (request, reply, payload) => {
    // Runs after the handler/transaction. Failed writes are also cleared defensively.
    if (request.routeOptions.url !== '/api/pages/read' && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) cache.clear();
    return payload;
  });
  for (const screen of ['home', 'stocks'] as const) {
    app.get<{ Querystring: { accountId?: string } }>(`/api/pages/${screen}`, async (request, reply) => {
      const selected = request.query.accountId ? String(id(request.query.accountId, 'accountId')) : undefined;
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
      const cacheKey = JSON.stringify([screen, selected, today]);
      const result = await cache.get(cacheKey, async () => {
        const { data: accounts } = await loadAccounts();
        const active = accounts.filter(account => account.isActive);
        const account = active.find(account => account.id === selected) ?? active.find(account => account.isDefault) ?? active[0];
        const base = { accounts, accountId: account?.id ?? null };
        if (!account) return base;
        const accountId = BigInt(account.id);
        const portfolio = loadPortfolio(accountId);
        if (screen === 'stocks') {
          const position = await portfolio;
          const catalog = await loadSecurities({ accountId: account.id, registeredOnly: 'true' }, position);
          return { ...base, stocks: { catalog: catalog.data, holdings: position.holdings.map(serializeHolding), trades: stockTradeSummary(position) } };
        }
        const dashboardPromise = loadDashboard(accountId, portfolio);
        // Secondary failures do not turn valid account balances into an error.
        const [dashboard, targets, recent] = await Promise.all([
          dashboardPromise,
          portfolio.then(position => targetArrivalsResult(position.account)).catch(() => null),
          portfolio.then(position => {
            const lots = remainingBuyLots(position.account.buyTrades).sort((a, b) => b.boughtAt.getTime() - a.boughtAt.getTime() || (a.id > b.id ? -1 : a.id < b.id ? 1 : 0));
            return recentBuysResult(lots.slice(0, 5), lots.length, accountId, 0);
          }).catch(() => null),
        ]);
        return { ...base, dashboard: dashboard.data, targets, recent };
      });
      if ('targets' in result.value && (result.value.targets === null || result.value.recent === null)) cache.delete(cacheKey);
      reply.header('Cache-Control', 'private, no-store');
      reply.header('X-Page-Cache', result.status);
      return { data: result.value };
    });
  }
}
