import type { FastifyInstance } from 'fastify';
import { Prisma, type MarketType, type WatchlistType } from '../generated/prisma/index.js';

import { ApiError } from '../lib/api-error.js';
import { id, optionalMemo } from '../lib/input.js';
import { prisma } from '../lib/prisma.js';

type SecurityQuery = { query?: string; marketType?: string; listType?: string; excludeRegistered?: string; limit?: string; offset?: string };
type WatchlistBody = { securityId?: unknown; listType?: unknown; targetBuyPrice?: unknown; priority?: unknown; memo?: unknown };
type WatchlistParams = { id: string };
type SecurityParams = { id: string };
type DirectSecurityBody = { symbol?: unknown; name?: unknown; marketType?: unknown; listType?: unknown };
type PriceBody = { currentPrice?: unknown };
type AnalysisBody = { operatingProfit?: unknown; controllingProfit?: unknown; issuedShares?: unknown; treasuryShares?: unknown; assets?: unknown; liabilities?: unknown; equity?: unknown; previousEquity?: unknown; dividend?: unknown; memo?: unknown };

const marketTypes = new Set<MarketType>(['KOSPI', 'KOSDAQ', 'KONEX', 'OTHER']);
const editableListTypes = new Set<WatchlistType>(['WATCHLIST', 'RECOMMENDED']);

const queryText = (value: string | undefined) => {
  const result = value?.trim() ?? '';
  if (result.length > 100) throw new ApiError(400, 'INVALID_INPUT', 'query must be at most 100 characters.');
  return result;
};

const marketType = (value: string | undefined): MarketType | undefined => {
  if (!value) return undefined;
  if (!marketTypes.has(value as MarketType)) throw new ApiError(400, 'INVALID_INPUT', 'marketType is invalid.');
  return value as MarketType;
};

const listTypeFilter = (value: string | undefined): WatchlistType | undefined => {
  if (!value) return undefined;
  if (!['WATCHLIST', 'HOLDING', 'RECOMMENDED'].includes(value)) throw new ApiError(400, 'INVALID_INPUT', 'listType is invalid.');
  return value as WatchlistType;
};

const editableListType = (value: unknown): WatchlistType => {
  if (typeof value !== 'string' || !editableListTypes.has(value as WatchlistType)) {
    throw new ApiError(400, 'INVALID_LIST_TYPE', 'listType must be WATCHLIST or RECOMMENDED.');
  }
  return value as WatchlistType;
};

const optionalPrice = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) {
    throw new ApiError(400, 'INVALID_INPUT', 'targetBuyPrice must be a non-negative decimal string or null.');
  }
  return new Prisma.Decimal(value);
};

const optionalPriority = (value: unknown) => {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new ApiError(400, 'INVALID_INPUT', 'priority must be an integer between 0 and 65535.');
  }
  return value;
};

const pageNumber = (value: string | undefined, name: string, fallback: number, maximum: number) => {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new ApiError(400, 'INVALID_INPUT', `${name} must be a non-negative integer.`);
  const parsed = Number(value);
  if (parsed > maximum) throw new ApiError(400, 'INVALID_INPUT', `${name} must not exceed ${maximum}.`);
  return parsed;
};

const serializeSecurity = (security: {
  id: bigint; symbol: string; name: string; marketType: MarketType; securityType: string;
  watchlistItem: { id: bigint; listType: WatchlistType; targetBuyPrice: Prisma.Decimal | null; priority: number; memo: string | null } | null;
  marketPrice: { currentPrice: Prisma.Decimal; previousClosePrice: Prisma.Decimal | null; priceUpdatedAt: Date } | null;
}) => ({
  id: security.id.toString(),
  symbol: security.symbol,
  name: security.name,
  marketType: security.marketType,
  securityType: security.securityType,
  listType: security.watchlistItem?.listType ?? null,
  watchlistItemId: security.watchlistItem?.id.toString() ?? null,
  targetBuyPrice: security.watchlistItem?.targetBuyPrice?.toString() ?? null,
  priority: security.watchlistItem?.priority ?? null,
  memo: security.watchlistItem?.memo ?? null,
  currentPrice: security.marketPrice?.currentPrice.toString() ?? null,
  previousClosePrice: security.marketPrice?.previousClosePrice?.toString() ?? null,
  priceUpdatedAt: security.marketPrice?.priceUpdatedAt.toISOString() ?? null,
});

const serializeMetrics = (metric: {
  metricDate: Date; eps: Prisma.Decimal | null; bps: Prisma.Decimal | null;
  per: Prisma.Decimal | null; pbr: Prisma.Decimal | null; roe: Prisma.Decimal | null;
  dividendPerShare: Prisma.Decimal | null; dividendYield: Prisma.Decimal | null; marketCap: Prisma.Decimal | null;
} | null) => metric && ({
  metricDate: metric.metricDate.toISOString().slice(0, 10),
  eps: metric.eps?.toString() ?? null, bps: metric.bps?.toString() ?? null,
  per: metric.per?.toString() ?? null, pbr: metric.pbr?.toString() ?? null,
  roe: metric.roe?.toString() ?? null, dividendPerShare: metric.dividendPerShare?.toString() ?? null,
  dividendYield: metric.dividendYield?.toString() ?? null, marketCap: metric.marketCap?.toString() ?? null,
});

export async function securityRoutes(app: FastifyInstance) {
  app.patch<{ Params: SecurityParams; Body: AnalysisBody }>('/securities/:id/analysis', async (request) => {
    const securityId = id(request.params.id, 'id');
    const security = await prisma.security.findUnique({ where: { id: securityId }, include: { watchlistItem: true } });
    if (!security || !security.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
    const body = request.body ?? {};
    const decimal = (key: keyof AnalysisBody) => {
      const value = body[key];
      if (value === undefined) return undefined;
      if (value === null || value === '') return null;
      if (typeof value !== 'string' || !/^-?\d+$/.test(value)) throw new ApiError(400, 'INVALID_INPUT', `${key} must be an integer string or null.`);
      return new Prisma.Decimal(value);
    };
    const operatingProfit = decimal('operatingProfit');
    const assets = decimal('assets');
    const liabilities = decimal('liabilities');
    const equity = decimal('equity');
    const dividend = decimal('dividend');
    const controllingProfit = decimal('controllingProfit');
    const issuedShares = decimal('issuedShares');
    const treasuryShares = decimal('treasuryShares');
    const previousEquity = decimal('previousEquity');
    await prisma.$transaction(async (tx) => {
      if (security.watchlistItem && security.watchlistItem.listType !== 'HOLDING' && body.memo !== undefined) {
        await tx.watchlistItem.update({ where: { id: security.watchlistItem.id }, data: { memo: optionalMemo(body.memo) } });
      }
      if ([operatingProfit, assets, liabilities, equity].some((value) => value !== undefined)) {
        const year = new Date().getUTCFullYear();
        await tx.financialStatement.upsert({
          where: { securityId_fiscalYear_periodType: { securityId, fiscalYear: year, periodType: 'ANNUAL' } },
          create: { securityId, fiscalYear: year, periodType: 'ANNUAL', periodEndDate: new Date(Date.UTC(year, 11, 31)), operatingProfit, totalAssets: assets, totalLiabilities: liabilities, totalEquity: equity },
          update: { operatingProfit, totalAssets: assets, totalLiabilities: liabilities, totalEquity: equity },
        });
      }
      if (dividend !== undefined) {
        const today = new Date(); today.setUTCHours(0, 0, 0, 0);
        const latest = await tx.valuationMetric.findFirst({ where: { securityId }, orderBy: { metricDate: 'desc' } });
        await tx.valuationMetric.upsert({
          where: { securityId_metricDate: { securityId, metricDate: today } },
          create: { securityId, metricDate: today, eps: latest?.eps, bps: latest?.bps, per: latest?.per, pbr: latest?.pbr, roe: latest?.roe, dividendYield: latest?.dividendYield, marketCap: latest?.marketCap, dividendPerShare: dividend },
          update: { dividendPerShare: dividend },
        });
      }
      if ([controllingProfit, issuedShares, treasuryShares, previousEquity].some((value) => value !== undefined)) {
        await tx.securityFundamentals.upsert({
          where: { securityId },
          create: { securityId, controllingProfit, issuedShares, treasuryShares, previousEquity },
          update: { controllingProfit, issuedShares, treasuryShares, previousEquity },
        });
      }
      if ([controllingProfit, issuedShares, treasuryShares, previousEquity, equity, dividend].some((value) => value !== undefined)) {
        const [fundamentals, annual, price, latest] = await Promise.all([
          tx.securityFundamentals.findUnique({ where: { securityId } }),
          tx.financialStatement.findFirst({ where: { securityId, periodType: 'ANNUAL' }, orderBy: { fiscalYear: 'desc' } }),
          tx.marketPrice.findUnique({ where: { securityId } }),
          tx.valuationMetric.findFirst({ where: { securityId }, orderBy: { metricDate: 'desc' } }),
        ]);
        const shares = fundamentals?.issuedShares?.minus(fundamentals.treasuryShares ?? 0);
        const bps = shares?.gt(0) && annual?.totalEquity ? annual.totalEquity.div(shares) : null;
        const eps = shares?.gt(0) && fundamentals?.controllingProfit ? fundamentals.controllingProfit.div(shares) : null;
        const prior = fundamentals?.previousEquity;
        const averageEquity = annual?.totalEquity && prior ? annual.totalEquity.plus(prior).div(2) : annual?.totalEquity;
        const roe = averageEquity?.gt(0) && fundamentals?.controllingProfit ? fundamentals.controllingProfit.div(averageEquity).mul(100) : null;
        const current = price?.currentPrice;
        const today = new Date(); today.setUTCHours(0, 0, 0, 0);
        const calculated = {
          eps, bps, roe,
          per: current && eps?.gt(0) ? current.div(eps) : null,
          pbr: current && bps?.gt(0) ? current.div(bps) : null,
          dividendYield: current?.gt(0) && latest?.dividendPerShare ? latest.dividendPerShare.div(current).mul(100) : null,
        };
        await tx.valuationMetric.upsert({
          where: { securityId_metricDate: { securityId, metricDate: today } },
          create: { securityId, metricDate: today, ...calculated, dividendPerShare: latest?.dividendPerShare ?? null },
          update: calculated,
        });
      }
    });
    return { data: { updated: true } };
  });

  app.get<{ Params: SecurityParams }>('/securities/:id/analysis', async (request) => {
    const securityId = id(request.params.id, 'id');
    const security = await prisma.security.findUnique({ where: { id: securityId }, include: { marketPrice: true, watchlistItem: true } });
    if (!security || !security.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
    const [metrics, statements, fundamentals] = await Promise.all([
      prisma.valuationMetric.findMany({ where: { securityId }, orderBy: { metricDate: 'desc' }, take: 2 }),
      prisma.financialStatement.findMany({ where: { securityId }, orderBy: [{ fiscalYear: 'desc' }, { periodType: 'desc' }], take: 24 }),
      prisma.securityFundamentals.findUnique({ where: { securityId } }),
    ]);
    return { data: {
      security: serializeSecurity(security),
      valuation: serializeMetrics(metrics[0] ?? null),
      previousValuation: serializeMetrics(metrics[1] ?? null),
      fundamentals: fundamentals && {
        controllingProfit: fundamentals.controllingProfit?.toString() ?? null,
        issuedShares: fundamentals.issuedShares?.toString() ?? null,
        treasuryShares: fundamentals.treasuryShares?.toString() ?? null,
        previousEquity: fundamentals.previousEquity?.toString() ?? null,
      },
      statements: statements.map((statement) => ({
        fiscalYear: statement.fiscalYear, periodType: statement.periodType,
        periodEndDate: statement.periodEndDate.toISOString().slice(0, 10),
        revenue: statement.revenue?.toString() ?? null,
        operatingProfit: statement.operatingProfit?.toString() ?? null,
        netIncome: statement.netIncome?.toString() ?? null,
        totalAssets: statement.totalAssets?.toString() ?? null,
        totalLiabilities: statement.totalLiabilities?.toString() ?? null,
        totalEquity: statement.totalEquity?.toString() ?? null,
        operatingCashFlow: statement.operatingCashFlow?.toString() ?? null,
        capitalExpenditure: statement.capitalExpenditure?.toString() ?? null,
      })),
    } };
  });

  app.post<{ Body: DirectSecurityBody }>('/securities', async (request, reply) => {
    const body = request.body ?? {};
    const symbol = typeof body.symbol === 'string' ? body.symbol.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!/^\d{6}$/.test(symbol) || !name || name.length > 100) throw new ApiError(400, 'INVALID_INPUT', 'A six-digit symbol and name are required.');
    const selectedMarket = marketType(body.marketType as string) ?? 'OTHER';
    const selectedList = editableListType(body.listType);
    const existing = await prisma.security.findUnique({ where: { marketType_symbol: { marketType: selectedMarket, symbol } } });
    if (existing) throw new ApiError(409, 'SECURITY_ALREADY_EXISTS', 'Security already exists. Search and add it instead.');
    const security = await prisma.security.create({
      data: { symbol, name, marketType: selectedMarket, watchlistItem: { create: { listType: selectedList } } },
      include: { watchlistItem: true, marketPrice: true },
    });
    return reply.code(201).send({ data: serializeSecurity(security) });
  });

  app.patch<{ Params: SecurityParams; Body: PriceBody }>('/securities/:id/price', async (request) => {
    const securityId = id(request.params.id, 'id');
    const currentPrice = optionalPrice(request.body?.currentPrice);
    if (!currentPrice || currentPrice.lte(0)) throw new ApiError(400, 'INVALID_INPUT', 'currentPrice must be positive.');
    const security = await prisma.security.findUnique({ where: { id: securityId } });
    if (!security || !security.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
    const previous = await prisma.marketPrice.findUnique({ where: { securityId } });
    const marketPrice = await prisma.marketPrice.upsert({
      where: { securityId },
      create: { securityId, currentPrice, previousClosePrice: previous?.previousClosePrice ?? null, priceUpdatedAt: new Date() },
      update: { currentPrice, priceUpdatedAt: new Date() },
    });
    const latest = await prisma.valuationMetric.findFirst({ where: { securityId }, orderBy: { metricDate: 'desc' } });
    if (latest) {
      await prisma.valuationMetric.update({ where: { id: latest.id }, data: {
        per: latest.eps?.gt(0) ? currentPrice.div(latest.eps) : null,
        pbr: latest.bps?.gt(0) ? currentPrice.div(latest.bps) : null,
        dividendYield: latest.dividendPerShare ? latest.dividendPerShare.div(currentPrice).mul(100) : null,
      } });
    }
    return { data: { currentPrice: marketPrice.currentPrice.toString(), previousClosePrice: marketPrice.previousClosePrice?.toString() ?? null, priceUpdatedAt: marketPrice.priceUpdatedAt.toISOString() } };
  });

  app.get<{ Querystring: SecurityQuery }>('/securities', async (request) => {
    const search = queryText(request.query.query);
    const selectedMarket = marketType(request.query.marketType);
    const selectedList = listTypeFilter(request.query.listType);
    const excludeRegistered = request.query.excludeRegistered === 'true';
    if (request.query.excludeRegistered && !['true', 'false'].includes(request.query.excludeRegistered)) {
      throw new ApiError(400, 'INVALID_INPUT', 'excludeRegistered must be true or false.');
    }
    if (selectedList && excludeRegistered) {
      throw new ApiError(400, 'INVALID_INPUT', 'listType and excludeRegistered=true cannot be used together.');
    }
    const hasPagination = request.query.limit !== undefined || request.query.offset !== undefined;
    const limit = pageNumber(request.query.limit, 'limit', 50, 100);
    const offset = pageNumber(request.query.offset, 'offset', 0, 100_000);
    const where: Prisma.SecurityWhereInput = {
      isActive: true,
      ...(selectedMarket && { marketType: selectedMarket }),
      ...(selectedList && { watchlistItem: { is: { listType: selectedList } } }),
      ...(excludeRegistered && { watchlistItem: { is: null } }),
      ...(search && { OR: [
        { symbol: { contains: search.replace(/^A(?=\d{6}$)/i, '') } },
        { name: { contains: search } },
      ] }),
    };
    const [securities, total] = await Promise.all([
      prisma.security.findMany({
        where,
        include: { watchlistItem: true, marketPrice: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        ...(hasPagination && { take: limit, skip: offset }),
      }),
      prisma.security.count({ where }),
    ]);
    const securityIds = securities.map((item) => item.id);
    const [metrics, financials] = await Promise.all([
      prisma.valuationMetric.findMany({ where: { securityId: { in: securityIds } }, orderBy: { metricDate: 'desc' }, distinct: ['securityId'] }),
      prisma.financialStatement.findMany({ where: { securityId: { in: securityIds }, periodType: 'ANNUAL' }, orderBy: { fiscalYear: 'desc' } }),
    ]);
    const metricById = new Map(metrics.map((item) => [item.securityId.toString(), item]));
    const financialById = new Map<string, typeof financials>();
    for (const item of financials) {
      const key = item.securityId.toString();
      const entries = financialById.get(key) ?? [];
      if (entries.length < 2) entries.push(item);
      financialById.set(key, entries);
    }
    return { data: securities.map((item) => {
      const years = financialById.get(item.id.toString()) ?? [];
      return { ...serializeSecurity(item), valuation: serializeMetrics(metricById.get(item.id.toString()) ?? null),
        operatingProfit: years[0]?.operatingProfit?.toString() ?? null,
        previousOperatingProfit: years[1]?.operatingProfit?.toString() ?? null };
    }), meta: { total, limit: hasPagination ? limit : total, offset: hasPagination ? offset : 0 } };
  });

  app.post<{ Body: WatchlistBody }>('/watchlist-items', async (request, reply) => {
    const body = request.body ?? {};
    const securityId = id(body.securityId, 'securityId');
    const selectedListType = editableListType(body.listType);
    const targetBuyPrice = optionalPrice(body.targetBuyPrice);
    const priority = optionalPriority(body.priority);
    const memo = optionalMemo(body.memo);
    const existing = await prisma.watchlistItem.findUnique({ where: { securityId } });
    if (existing) {
      const code = existing.listType === 'HOLDING' ? 'HOLDING_MANAGED_BY_TRADES' : 'WATCHLIST_ITEM_ALREADY_EXISTS';
      throw new ApiError(409, code, 'The security is already registered.');
    }
    const security = await prisma.security.findUnique({ where: { id: securityId } });
    if (!security || !security.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
    const item = await prisma.watchlistItem.create({
      data: { securityId, listType: selectedListType, targetBuyPrice, priority, memo },
      include: { security: { include: { watchlistItem: true, marketPrice: true } } },
    });
    return reply.code(201).send({ data: serializeSecurity(item.security) });
  });

  app.patch<{ Params: WatchlistParams; Body: WatchlistBody }>('/watchlist-items/:id', async (request) => {
    const itemId = id(request.params.id, 'id');
    const body = request.body ?? {};
    const existing = await prisma.watchlistItem.findUnique({ where: { id: itemId } });
    if (!existing) throw new ApiError(404, 'WATCHLIST_ITEM_NOT_FOUND', 'Watchlist item not found.');
    if (existing.listType === 'HOLDING') throw new ApiError(409, 'HOLDING_MANAGED_BY_TRADES', 'Holding classification is managed by buy and sell trades.');
    if (body.securityId !== undefined) throw new ApiError(400, 'IMMUTABLE_FIELD', 'securityId cannot be changed.');
    const item = await prisma.watchlistItem.update({
      where: { id: itemId },
      data: {
        ...(body.listType !== undefined && { listType: editableListType(body.listType) }),
        ...(body.targetBuyPrice !== undefined && { targetBuyPrice: optionalPrice(body.targetBuyPrice) }),
        ...(body.priority !== undefined && { priority: optionalPriority(body.priority) }),
        ...(body.memo !== undefined && { memo: optionalMemo(body.memo) }),
      },
      include: { security: { include: { watchlistItem: true, marketPrice: true } } },
    });
    return { data: serializeSecurity(item.security) };
  });

  app.delete<{ Params: WatchlistParams }>('/watchlist-items/:id', async (request, reply) => {
    const itemId = id(request.params.id, 'id');
    const existing = await prisma.watchlistItem.findUnique({ where: { id: itemId } });
    if (!existing) throw new ApiError(404, 'WATCHLIST_ITEM_NOT_FOUND', 'Watchlist item not found.');
    if (existing.listType === 'HOLDING') throw new ApiError(409, 'HOLDING_MANAGED_BY_TRADES', 'Holding classification is managed by buy and sell trades.');
    await prisma.watchlistItem.delete({ where: { id: itemId } });
    return reply.code(204).send();
  });
}
