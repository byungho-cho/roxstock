import type { FastifyInstance } from 'fastify';
import { Prisma, type MarketType, type WatchlistType } from '../generated/prisma/index.js';

import { ApiError } from '../lib/api-error.js';
import { id, optionalMemo } from '../lib/input.js';
import { prisma } from '../lib/prisma.js';

type SecurityQuery = { query?: string; marketType?: string; listType?: string; excludeRegistered?: string; limit?: string; offset?: string };
type WatchlistBody = { securityId?: unknown; listType?: unknown; targetBuyPrice?: unknown; priority?: unknown; memo?: unknown };
type WatchlistParams = { id: string };

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

export async function securityRoutes(app: FastifyInstance) {
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
    return { data: securities.map(serializeSecurity), meta: { total, limit: hasPagination ? limit : total, offset: hasPagination ? offset : 0 } };
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
