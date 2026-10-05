import type { FastifyInstance } from 'fastify';
import { defaultTargetConditions, evaluateTargetLots, validateTargetConditions } from '../domain/target-arrival.js';
import { ApiError } from '../lib/api-error.js';
import { id } from '../lib/input.js';
import { prisma } from '../lib/prisma.js';
import { realtimePriceCache } from '../realtime/price-cache.js';

type Params = { accountId: string };
const accountFor = async (accountId: bigint) => {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account?.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
  return account;
};
const settingsFor = (a: Awaited<ReturnType<typeof accountFor>>) => ({
  accountId: a.id.toString(), scope: 'ACCOUNT' as const, version: a.targetArrivalVersion,
  conditions: a.targetArrivalConditions === null ? defaultTargetConditions : validateTargetConditions(a.targetArrivalConditions),
});

export async function targetArrivalRoutes(app: FastifyInstance) {
  app.get<{ Params: Params }>('/accounts/:accountId/target-arrival-conditions', async request => ({
    data: settingsFor(await accountFor(id(request.params.accountId, 'accountId'))),
  }));
  app.put<{ Params: Params; Body: { conditions?: unknown; version?: unknown } }>('/accounts/:accountId/target-arrival-conditions', async request => {
    const accountId = id(request.params.accountId, 'accountId');
    const account = await accountFor(accountId);
    let conditions;
    try { conditions = validateTargetConditions(request.body?.conditions); }
    catch (cause) { throw new ApiError(400, 'INVALID_TARGET_CONDITIONS', (cause as Error).message); }
    const version = request.body?.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) throw new ApiError(400, 'INVALID_INPUT', '설정 버전을 확인해 주세요.');
    const result = await prisma.account.updateMany({ where: { id: accountId, isActive: true, targetArrivalVersion: version },
      data: { targetArrivalConditions: conditions, targetArrivalVersion: { increment: 1 } } });
    if (result.count !== 1) throw new ApiError(409, 'TARGET_SETTINGS_CONFLICT', '다른 곳에서 설정이 변경되었습니다. 최신 설정을 확인한 후 다시 저장해 주세요.');
    return { data: { ...settingsFor(account), conditions, version: version + 1 } };
  });
  app.get<{ Params: Params }>('/accounts/:accountId/target-arrivals', async request => {
    const accountId = id(request.params.accountId, 'accountId');
    // One DB read gives settings + trades + persisted prices a single snapshot.
    const account = await prisma.account.findUnique({ where: { id: accountId }, include: {
      buyTrades: { include: { sellTrades: { select: { quantity: true } }, security: { include: { marketPrice: true } } } },
    } });
    if (!account?.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
    const settings = settingsFor(account);
    const now = new Date();
    const livePrices = new Map(realtimePriceCache.get().map(p => [p.securityId, p]));
    const result = evaluateTargetLots(account.buyTrades.map(trade => {
      const stored = trade.security.marketPrice;
      const live = livePrices.get(trade.securityId.toString());
      const useLive = live && (!stored || Date.parse(live.observedAt) >= stored.priceUpdatedAt.getTime());
      return { id: trade.id.toString(), securityId: trade.securityId.toString(), symbol: trade.security.symbol, name: trade.security.name,
        boughtAt: trade.boughtAt, quantity: trade.quantity.toString(), soldQuantities: trade.sellTrades.map(s => s.quantity.toString()), unitPrice: trade.unitPrice.toString(),
        currentPrice: useLive ? live.currentPrice : stored?.currentPrice.toString() ?? null,
        priceUpdatedAt: useLive ? new Date(live.observedAt) : stored?.priceUpdatedAt ?? null };
    }), settings.conditions, now);
    const dates = result.quoteTimes.sort();
    return { data: result.data, meta: { accountId: accountId.toString(), conditionsVersion: settings.version,
      enabled: settings.conditions.length > 0, total: result.data.length, unavailableCount: result.unavailable.length,
      unavailable: result.unavailable, calculatedAt: now.toISOString(), asOfDate: result.asOfDate,
      priceAsOf: dates[0] ?? null, priceAsOfLatest: dates.at(-1) ?? null, timezone: 'Asia/Seoul', snapshotMode: 'ALL_RESULTS' } };
  });
}
