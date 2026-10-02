import type { FastifyInstance } from 'fastify';
import { Prisma } from '../generated/prisma/index.js';

import { calculateBuyBalance, calculateRemainingQuantity, calculateSellBalance } from '../domain/trade.js';
import { valueBuyLot } from '../domain/lot-valuation.js';
import { realtimePriceCache } from '../realtime/price-cache.js';
import { ApiError } from '../lib/api-error.js';
import { dateTime, id, nonNegativeDecimal, optionalMemo, positiveDecimal } from '../lib/input.js';
import { prisma } from '../lib/prisma.js';
import { serializable } from '../lib/transaction.js';
import { registerTrade, requestId } from '../domain/trade-request.js';

type BuyBody = {
  requestId?: unknown;
  accountId?: unknown;
  securityId?: unknown;
  boughtAt?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  feeTaxAmount?: unknown;
  memo?: unknown;
};

type SellBody = {
  accountId?: unknown;
  requestId?: unknown;
  buyTradeId?: unknown;
  soldAt?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  feeTaxAmount?: unknown;
  memo?: unknown;
};

type AccountParams = { accountId: string };
type TradeQuery = { from?: string; to?: string; securityId?: string };
type LotQuery = { securityId?: string; remainingOnly?: string };
type TradeParams = { tradeId: string };
type AccountQuery = { accountId?: string };
type DeleteBuyQuery = AccountQuery & { cascadeSells?: string };
type EditBuyBody = {
  accountId?: unknown;
  securityId?: unknown;
  boughtAt?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  memo?: unknown;
};
type EditSellBody = {
  accountId?: unknown;
  soldAt?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  memo?: unknown;
};

const dateOnly = (value: string | undefined, fieldName: string) => {
  if (value === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, 'INVALID_INPUT', `${fieldName} must use YYYY-MM-DD.`);
  }
  const result = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(result.getTime())) {
    throw new ApiError(400, 'INVALID_INPUT', `${fieldName} must be a valid date.`);
  }
  return result;
};

const kstDate = (value: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(value);

const optionalId = (value: string | undefined, fieldName: string) => (
  value === undefined ? undefined : id(value, fieldName)
);

const mapLinkedCashTransaction = (cashTransaction: {
  id: bigint; feeTaxAmount: Prisma.Decimal; balanceAfter: Prisma.Decimal;
} | null) => cashTransaction ? {
  id: cashTransaction.id.toString(),
  feeTaxAmount: cashTransaction.feeTaxAmount.toString(),
  balanceAfter: cashTransaction.balanceAfter.toString(),
} : null;

export async function tradeRoutes(app: FastifyInstance) {
  app.get<{ Params: AccountParams; Querystring: TradeQuery }>('/accounts/:accountId/trades', async (request) => {
    const accountId = id(request.params.accountId, 'accountId');
    const securityId = optionalId(request.query.securityId, 'securityId');
    const from = dateOnly(request.query.from, 'from');
    const toStart = dateOnly(request.query.to, 'to');
    const to = toStart ? new Date(toStart.getTime() + 86_400_000) : undefined;
    if (from && to && from >= to) throw new ApiError(400, 'INVALID_INPUT', 'from must not be later than to.');

    const account = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true, isActive: true } });
    if (!account || !account.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');

    const dateRange = { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) };
    const [buys, sells] = await Promise.all([
      prisma.buyTrade.findMany({
        where: { accountId, ...(securityId ? { securityId } : {}), ...((from || to) ? { boughtAt: dateRange } : {}) },
        include: { security: { select: { id: true, symbol: true, name: true, marketType: true } } },
      }),
      prisma.sellTrade.findMany({
        where: { buyTrade: { accountId, ...(securityId ? { securityId } : {}) }, ...((from || to) ? { soldAt: dateRange } : {}) },
        include: { buyTrade: { include: { security: { select: { id: true, symbol: true, name: true, marketType: true } } } } },
      }),
    ]);

    const entries = [
      ...buys.map((trade) => ({
        id: trade.id.toString(), type: 'BUY' as const, buyTradeId: trade.id.toString(), tradedAt: trade.boughtAt,
        security: trade.security, quantity: trade.quantity, unitPrice: trade.unitPrice,
        amount: trade.quantity.mul(trade.unitPrice), realizedProfitLoss: null as Prisma.Decimal | null, memo: trade.memo,
      })),
      ...sells.map((trade) => ({
        id: trade.id.toString(), type: 'SELL' as const, buyTradeId: trade.buyTradeId.toString(), tradedAt: trade.soldAt,
        security: trade.buyTrade.security, quantity: trade.quantity, unitPrice: trade.unitPrice,
        amount: trade.quantity.mul(trade.unitPrice),
        realizedProfitLoss: trade.quantity.mul(trade.unitPrice.minus(trade.buyTrade.unitPrice)), memo: trade.memo,
      })),
    ].sort((left, right) => right.tradedAt.getTime() - left.tradedAt.getTime());

    const daily = new Map<string, { buyCount: number; sellCount: number; buyAmount: Prisma.Decimal; sellAmount: Prisma.Decimal; realizedProfitLoss: Prisma.Decimal }>();
    for (const entry of entries) {
      const key = kstDate(entry.tradedAt);
      const item = daily.get(key) ?? { buyCount: 0, sellCount: 0, buyAmount: new Prisma.Decimal(0), sellAmount: new Prisma.Decimal(0), realizedProfitLoss: new Prisma.Decimal(0) };
      if (entry.type === 'BUY') {
        item.buyCount += 1; item.buyAmount = item.buyAmount.plus(entry.amount);
      } else {
        item.sellCount += 1; item.sellAmount = item.sellAmount.plus(entry.amount);
        item.realizedProfitLoss = item.realizedProfitLoss.plus(entry.realizedProfitLoss ?? 0);
      }
      daily.set(key, item);
    }

    return {
      data: entries.map((entry) => ({
        id: entry.id, type: entry.type, buyTradeId: entry.buyTradeId, tradedAt: entry.tradedAt.toISOString(),
        security: { id: entry.security.id.toString(), symbol: entry.security.symbol, name: entry.security.name, marketType: entry.security.marketType },
        quantity: entry.quantity.toString(), unitPrice: entry.unitPrice.toString(), amount: entry.amount.toString(),
        realizedProfitLoss: entry.realizedProfitLoss?.toString() ?? null, memo: entry.memo,
      })),
      summary: {
        buyAmount: entries.filter((entry) => entry.type === 'BUY').reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0)).toString(),
        sellAmount: entries.filter((entry) => entry.type === 'SELL').reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0)).toString(),
        realizedProfitLoss: entries.reduce((sum, entry) => sum.plus(entry.realizedProfitLoss ?? 0), new Prisma.Decimal(0)).toString(),
      },
      daily: [...daily.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, item]) => ({
        date, buyCount: item.buyCount, sellCount: item.sellCount, buyAmount: item.buyAmount.toString(),
        sellAmount: item.sellAmount.toString(), realizedProfitLoss: item.realizedProfitLoss.toString(),
      })),
      meta: { accountId: accountId.toString(), count: entries.length, timezone: 'Asia/Seoul' },
    };
  });

  app.get<{ Params: TradeParams; Querystring: AccountQuery }>('/buy-trades/:tradeId', async (request) => {
    const tradeId = id(request.params.tradeId, 'tradeId');
    const trade = await prisma.buyTrade.findUnique({
      where: { id: tradeId },
      include: {
        account: { select: { id: true, name: true } },
        security: { select: { id: true, symbol: true, name: true, marketType: true } },
        cashTransaction: { select: { id: true, feeTaxAmount: true, balanceAfter: true } },
        sellTrades: {
          include: { cashTransaction: { select: { id: true, feeTaxAmount: true, balanceAfter: true } } },
          orderBy: [{ soldAt: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!trade || request.query.accountId !== undefined && trade.accountId !== id(request.query.accountId, 'accountId')) throw new ApiError(404, 'BUY_TRADE_NOT_FOUND', 'Buy trade not found.');
    const soldQuantity = trade.sellTrades.reduce((sum, sell) => sum.plus(sell.quantity), new Prisma.Decimal(0));
    const remainingQuantity = trade.quantity.minus(soldQuantity);
    const realizedProfitLoss = trade.sellTrades.reduce(
      (sum, sell) => sum.plus(sell.quantity.mul(sell.unitPrice.minus(trade.unitPrice))),
      new Prisma.Decimal(0),
    );
    return {
      data: {
        id: trade.id.toString(), type: 'BUY',
        account: { id: trade.account.id.toString(), name: trade.account.name },
        security: { id: trade.security.id.toString(), symbol: trade.security.symbol, name: trade.security.name, marketType: trade.security.marketType },
        boughtAt: trade.boughtAt.toISOString(), quantity: trade.quantity.toString(), soldQuantity: soldQuantity.toString(),
        remainingQuantity: remainingQuantity.toString(), unitPrice: trade.unitPrice.toString(),
        amount: trade.quantity.mul(trade.unitPrice).toString(), remainingPurchaseAmount: remainingQuantity.mul(trade.unitPrice).toString(),
        realizedProfitLoss: realizedProfitLoss.toString(), memo: trade.memo,
        cashTransaction: mapLinkedCashTransaction(trade.cashTransaction),
        sellTrades: trade.sellTrades.map((sell) => ({
          id: sell.id.toString(), buyTradeId: trade.id.toString(), soldAt: sell.soldAt.toISOString(),
          quantity: sell.quantity.toString(), unitPrice: sell.unitPrice.toString(), amount: sell.quantity.mul(sell.unitPrice).toString(),
          realizedProfitLoss: sell.quantity.mul(sell.unitPrice.minus(trade.unitPrice)).toString(), memo: sell.memo,
          cashTransaction: mapLinkedCashTransaction(sell.cashTransaction),
        })),
        createdAt: trade.createdAt.toISOString(), updatedAt: trade.updatedAt.toISOString(),
      },
      meta: { historicalCashLinkAvailable: trade.cashTransaction !== null },
    };
  });

  app.get<{ Params: TradeParams; Querystring: AccountQuery }>('/sell-trades/:tradeId', async (request) => {
    const tradeId = id(request.params.tradeId, 'tradeId');
    const trade = await prisma.sellTrade.findUnique({
      where: { id: tradeId },
      include: {
        cashTransaction: { select: { id: true, feeTaxAmount: true, balanceAfter: true } },
        buyTrade: {
          include: {
            account: { select: { id: true, name: true } },
            security: { select: { id: true, symbol: true, name: true, marketType: true } },
          },
        },
      },
    });
    if (!trade || request.query.accountId !== undefined && trade.buyTrade.accountId !== id(request.query.accountId, 'accountId')) throw new ApiError(404, 'SELL_TRADE_NOT_FOUND', 'Sell trade not found.');
    return {
      data: {
        id: trade.id.toString(), type: 'SELL', buyTradeId: trade.buyTradeId.toString(),
        account: { id: trade.buyTrade.account.id.toString(), name: trade.buyTrade.account.name },
        security: {
          id: trade.buyTrade.security.id.toString(), symbol: trade.buyTrade.security.symbol,
          name: trade.buyTrade.security.name, marketType: trade.buyTrade.security.marketType,
        },
        soldAt: trade.soldAt.toISOString(), quantity: trade.quantity.toString(), unitPrice: trade.unitPrice.toString(),
        amount: trade.quantity.mul(trade.unitPrice).toString(), buyUnitPrice: trade.buyTrade.unitPrice.toString(),
        realizedProfitLoss: trade.quantity.mul(trade.unitPrice.minus(trade.buyTrade.unitPrice)).toString(), memo: trade.memo,
        cashTransaction: mapLinkedCashTransaction(trade.cashTransaction),
        createdAt: trade.createdAt.toISOString(), updatedAt: trade.updatedAt.toISOString(),
      },
      meta: { historicalCashLinkAvailable: trade.cashTransaction !== null },
    };
  });

  app.get<{ Params: AccountParams; Querystring: LotQuery }>('/accounts/:accountId/buy-lots', async (request) => {
    const accountId = id(request.params.accountId, 'accountId');
    const securityId = optionalId(request.query.securityId, 'securityId');
    if (request.query.remainingOnly !== undefined && request.query.remainingOnly !== 'true' && request.query.remainingOnly !== 'false') {
      throw new ApiError(400, 'INVALID_INPUT', 'remainingOnly must be true or false.');
    }
    const remainingOnly = request.query.remainingOnly !== 'false';
    const account = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true, isActive: true } });
    if (!account || !account.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
    const lots = await prisma.buyTrade.findMany({
      where: { accountId, ...(securityId ? { securityId } : {}) },
      include: {
        security: { select: { id: true, symbol: true, name: true, marketType: true, marketPrice: true } },
        sellTrades: { select: { id: true, soldAt: true, quantity: true, unitPrice: true }, orderBy: { soldAt: 'asc' } },
      },
      orderBy: [{ boughtAt: 'asc' }, { id: 'asc' }],
    });
    const now = new Date();
    const livePrices = new Map(realtimePriceCache.get().map(price => [price.securityId, price]));
    const data = lots.map((lot) => {
      const soldQuantity = lot.sellTrades.reduce((sum, sell) => sum.plus(sell.quantity), new Prisma.Decimal(0));
      const remainingQuantity = calculateRemainingQuantity(lot.quantity, lot.sellTrades.map((sell) => sell.quantity));
      const stored = lot.security.marketPrice;
      const live = livePrices.get(lot.securityId.toString());
      const useLive = live && (!stored || Date.parse(live.observedAt) >= stored.priceUpdatedAt.getTime());
      const valuation = valueBuyLot(lot.boughtAt, lot.quantity.toString(), lot.unitPrice.toString(),
        useLive ? live.currentPrice : stored?.currentPrice.toString() ?? null,
        useLive ? new Date(live.observedAt) : stored?.priceUpdatedAt ?? null, now);
      return {
        ...valuation,
        profitLoss: valuation.currentPrice === null ? null : new Prisma.Decimal(valuation.currentPrice).minus(lot.unitPrice).mul(remainingQuantity).toString(),
        id: lot.id.toString(), boughtAt: lot.boughtAt.toISOString(),
        security: { id: lot.security.id.toString(), symbol: lot.security.symbol, name: lot.security.name, marketType: lot.security.marketType },
        quantity: lot.quantity.toString(), soldQuantity: soldQuantity.toString(), remainingQuantity: remainingQuantity.toString(),
        unitPrice: lot.unitPrice.toString(), remainingPurchaseAmount: remainingQuantity.mul(lot.unitPrice).toString(), memo: lot.memo,
        sellTrades: lot.sellTrades.map((sell) => ({ id: sell.id.toString(), soldAt: sell.soldAt.toISOString(), quantity: sell.quantity.toString(), unitPrice: sell.unitPrice.toString() })),
      };
    }).filter((lot) => !remainingOnly || new Prisma.Decimal(lot.remainingQuantity).greaterThan(0));
    return { data, meta: { accountId: accountId.toString(), count: data.length, remainingOnly, calculatedAt: now.toISOString(), timezone: 'Asia/Seoul' } };
  });

  app.patch<{ Params: TradeParams; Body: EditBuyBody }>('/buy-trades/:tradeId', async (request) => {
    const tradeId = id(request.params.tradeId, 'tradeId');
    const body = request.body ?? {};
    const result = await serializable(async (tx) => {
      const current = await tx.buyTrade.findUnique({
        where: { id: tradeId },
        include: { sellTrades: { select: { soldAt: true, quantity: true } } },
      });
      if (!current || body.accountId !== undefined && current.accountId !== id(body.accountId, 'accountId')) throw new ApiError(404, 'BUY_TRADE_NOT_FOUND', 'Buy trade not found.');
      const securityId = body.securityId === undefined ? current.securityId : id(body.securityId, 'securityId');
      const boughtAt = body.boughtAt === undefined ? current.boughtAt : dateTime(body.boughtAt, 'boughtAt');
      const quantity = body.quantity === undefined ? current.quantity : positiveDecimal(body.quantity, 'quantity');
      const unitPrice = body.unitPrice === undefined ? current.unitPrice : positiveDecimal(body.unitPrice, 'unitPrice');
      const memo = body.memo === undefined ? current.memo : optionalMemo(body.memo);
      const soldQuantity = current.sellTrades.reduce((sum, sell) => sum.plus(sell.quantity), new Prisma.Decimal(0));
      if (quantity.lessThan(soldQuantity)) {
        throw new ApiError(409, 'QUANTITY_BELOW_SOLD', 'Buy quantity cannot be less than its total sold quantity.');
      }
      if (current.sellTrades.some((sell) => boughtAt > sell.soldAt)) {
        throw new ApiError(400, 'INVALID_BOUGHT_AT', 'boughtAt cannot be later than a connected sell trade.');
      }
      if (securityId !== current.securityId && current.sellTrades.length > 0) {
        throw new ApiError(409, 'SECURITY_CHANGE_BLOCKED', 'A buy trade with connected sells cannot change security.');
      }
      if (securityId !== current.securityId) {
        const security = await tx.security.findUnique({ where: { id: securityId }, select: { isActive: true } });
        if (!security?.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
      }
      const trade = await tx.buyTrade.update({ where: { id: tradeId }, data: { securityId, boughtAt, quantity, unitPrice, memo } });
      return { trade, remainingQuantity: quantity.minus(soldQuantity) };
    });
    return {
      data: {
        id: result.trade.id.toString(), remainingQuantity: result.remainingQuantity.toString(),
        cashBalanceAdjusted: false, historicalCashTransactionsAdjusted: false, historicalSnapshotsAdjusted: false,
      },
    };
  });

  app.patch<{ Params: TradeParams; Body: EditSellBody }>('/sell-trades/:tradeId', async (request) => {
    const tradeId = id(request.params.tradeId, 'tradeId');
    const body = request.body ?? {};
    const result = await serializable(async (tx) => {
      const current = await tx.sellTrade.findUnique({
        where: { id: tradeId },
        include: { buyTrade: { include: { sellTrades: { select: { id: true, quantity: true } } } } },
      });
      if (!current || body.accountId !== undefined && current.buyTrade.accountId !== id(body.accountId, 'accountId')) throw new ApiError(404, 'SELL_TRADE_NOT_FOUND', 'Sell trade not found.');
      const soldAt = body.soldAt === undefined ? current.soldAt : dateTime(body.soldAt, 'soldAt');
      const quantity = body.quantity === undefined ? current.quantity : positiveDecimal(body.quantity, 'quantity');
      const unitPrice = body.unitPrice === undefined ? current.unitPrice : positiveDecimal(body.unitPrice, 'unitPrice');
      const memo = body.memo === undefined ? current.memo : optionalMemo(body.memo);
      if (soldAt < current.buyTrade.boughtAt) {
        throw new ApiError(400, 'INVALID_SOLD_AT', 'soldAt cannot be earlier than boughtAt.');
      }
      const otherSold = current.buyTrade.sellTrades
        .filter((sell) => sell.id !== tradeId)
        .reduce((sum, sell) => sum.plus(sell.quantity), new Prisma.Decimal(0));
      if (otherSold.plus(quantity).greaterThan(current.buyTrade.quantity)) {
        throw new ApiError(409, 'QUANTITY_EXCEEDS_REMAINING', 'Sell quantity exceeds the selected lot remaining quantity.');
      }
      const trade = await tx.sellTrade.update({ where: { id: tradeId }, data: { soldAt, quantity, unitPrice, memo } });
      return { trade, remainingQuantity: current.buyTrade.quantity.minus(otherSold).minus(quantity) };
    });
    return {
      data: {
        id: result.trade.id.toString(), remainingQuantity: result.remainingQuantity.toString(),
        cashBalanceAdjusted: false, historicalCashTransactionsAdjusted: false, historicalSnapshotsAdjusted: false,
      },
    };
  });

  app.delete<{ Params: TradeParams; Querystring: DeleteBuyQuery }>('/buy-trades/:tradeId', async (request) => {
    const tradeId = id(request.params.tradeId, 'tradeId');
    if (request.query.cascadeSells !== undefined && request.query.cascadeSells !== 'true' && request.query.cascadeSells !== 'false') {
      throw new ApiError(400, 'INVALID_INPUT', 'cascadeSells must be true or false.');
    }
    const cascadeSells = request.query.cascadeSells === 'true';
    const result = await serializable(async (tx) => {
      const current = await tx.buyTrade.findUnique({ where: { id: tradeId }, include: { sellTrades: { select: { id: true } } } });
      if (!current || request.query.accountId !== undefined && current.accountId !== id(request.query.accountId, 'accountId')) throw new ApiError(404, 'BUY_TRADE_NOT_FOUND', 'Buy trade not found.');
      if (current.sellTrades.length > 0 && !cascadeSells) {
        throw new ApiError(409, 'CONNECTED_SELLS_EXIST', 'Connected sell trades exist. Retry with cascadeSells=true after confirmation.');
      }
      if (cascadeSells) await tx.sellTrade.deleteMany({ where: { buyTradeId: tradeId } });
      await tx.buyTrade.delete({ where: { id: tradeId } });
      return { deletedSellCount: current.sellTrades.length };
    });
    return {
      data: {
        id: tradeId.toString(), deleted: true, deletedSellCount: result.deletedSellCount,
        cashBalanceAdjusted: false, historicalCashTransactionsAdjusted: false, historicalSnapshotsAdjusted: false,
      },
    };
  });

  app.delete<{ Params: TradeParams; Querystring: AccountQuery }>('/sell-trades/:tradeId', async (request) => {
    const tradeId = id(request.params.tradeId, 'tradeId');
    await serializable(async (tx) => {
      const current = await tx.sellTrade.findUnique({ where: { id: tradeId }, include: { buyTrade: { select: { securityId: true, accountId: true } } } });
      if (!current || request.query.accountId !== undefined && current.buyTrade.accountId !== id(request.query.accountId, 'accountId')) throw new ApiError(404, 'SELL_TRADE_NOT_FOUND', 'Sell trade not found.');
      await tx.sellTrade.delete({ where: { id: tradeId } });
    });
    return {
      data: {
        id: tradeId.toString(), deleted: true,
        cashBalanceAdjusted: false, historicalCashTransactionsAdjusted: false, historicalSnapshotsAdjusted: false,
      },
    };
  });

  app.post<{ Body: BuyBody }>('/buy-trades', async (request, reply) => {
    const body = request.body ?? {};
    const accountId = id(body.accountId, 'accountId');
    const securityId = id(body.securityId, 'securityId');
    const boughtAt = dateTime(body.boughtAt, 'boughtAt');
    const quantity = positiveDecimal(body.quantity, 'quantity');
    const unitPrice = positiveDecimal(body.unitPrice, 'unitPrice');
    const feeTaxAmount = nonNegativeDecimal(body.feeTaxAmount, 'feeTaxAmount');
    const memo = optionalMemo(body.memo);

    const result = await registerTrade(accountId, 'BUY', requestId(body.requestId), {
      securityId: securityId.toString(), boughtAt: boughtAt.toISOString(), quantity: quantity.toString(), unitPrice: unitPrice.toString(), feeTaxAmount: feeTaxAmount.toString(), memo,
    }, async (tx) => {
      const [account, security] = await Promise.all([
        tx.account.findUnique({ where: { id: accountId } }),
        tx.security.findUnique({ where: { id: securityId } }),
      ]);
      if (!account || !account.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
      if (!security || !security.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');

      const { amount, balanceAfter } = calculateBuyBalance(account.cashBalance, quantity, unitPrice, feeTaxAmount);
      if (balanceAfter.isNegative()) {
        throw new ApiError(409, 'INSUFFICIENT_CASH', 'Cash balance is insufficient for this purchase.');
      }

      const trade = await tx.buyTrade.create({
        data: { accountId, securityId, boughtAt, quantity, unitPrice, memo },
      });
      await tx.account.update({ where: { id: accountId }, data: { cashBalance: balanceAfter } });
      const cashTransaction = await tx.cashTransaction.create({
        data: {
          accountId,
          buyTradeId: trade.id,
          transactionType: 'BUY',
          transactionDate: boughtAt,
          amount,
          feeTaxAmount,
          balanceAfter,
          memo,
        },
      });
      return { id: trade.id.toString(), cashTransactionId: cashTransaction.id.toString(), amount: amount.toString(), feeTaxAmount: feeTaxAmount.toString(), balanceAfter: balanceAfter.toString() };
    });

    return reply.code(201).send({ data: result });
  });

  app.post<{ Body: SellBody }>('/sell-trades', async (request, reply) => {
    const body = request.body ?? {};
    const buyTradeId = id(body.buyTradeId, 'buyTradeId');
    const soldAt = dateTime(body.soldAt, 'soldAt');
    const quantity = positiveDecimal(body.quantity, 'quantity');
    const unitPrice = positiveDecimal(body.unitPrice, 'unitPrice');
    const feeTaxAmount = nonNegativeDecimal(body.feeTaxAmount, 'feeTaxAmount');
    const memo = optionalMemo(body.memo);

    const owner = await prisma.buyTrade.findUnique({ where: { id: buyTradeId }, select: { accountId: true } });
    if (!owner) throw new ApiError(404, 'BUY_TRADE_NOT_FOUND', 'Buy trade not found.');
    const accountId = body.accountId === undefined ? owner.accountId : id(body.accountId, 'accountId');
    if (accountId !== owner.accountId) throw new ApiError(404, 'BUY_TRADE_NOT_FOUND', 'Buy trade not found in this account.');
    const result = await registerTrade(accountId, 'SELL', requestId(body.requestId), {
      buyTradeId: buyTradeId.toString(), soldAt: soldAt.toISOString(), quantity: quantity.toString(), unitPrice: unitPrice.toString(), feeTaxAmount: feeTaxAmount.toString(), memo,
    }, async (tx) => {
      const buyTrade = await tx.buyTrade.findUnique({
        where: { id: buyTradeId },
        include: { account: true, sellTrades: { select: { quantity: true } } },
      });
      if (!buyTrade) throw new ApiError(404, 'BUY_TRADE_NOT_FOUND', 'Buy trade not found.');
      if (soldAt < buyTrade.boughtAt) {
        throw new ApiError(400, 'INVALID_SOLD_AT', 'soldAt cannot be earlier than boughtAt.');
      }

      const remainingBefore = calculateRemainingQuantity(
        buyTrade.quantity,
        buyTrade.sellTrades.map((trade) => trade.quantity),
      );
      if (quantity.greaterThan(remainingBefore)) {
        throw new ApiError(409, 'QUANTITY_EXCEEDS_REMAINING', 'Sell quantity exceeds the selected lot remaining quantity.');
      }

      const { amount, balanceAfter } = calculateSellBalance(
        buyTrade.account.cashBalance,
        quantity,
        unitPrice,
        feeTaxAmount,
      );
      if (feeTaxAmount.greaterThan(amount)) {
        throw new ApiError(400, 'INVALID_FEE_TAX_AMOUNT', 'feeTaxAmount cannot exceed the sell amount.');
      }

      const trade = await tx.sellTrade.create({
        data: { buyTradeId, soldAt, quantity, unitPrice, memo },
      });
      await tx.account.update({ where: { id: buyTrade.accountId }, data: { cashBalance: balanceAfter } });
      const cashTransaction = await tx.cashTransaction.create({
        data: {
          accountId: buyTrade.accountId,
          sellTradeId: trade.id,
          transactionType: 'SELL',
          transactionDate: soldAt,
          amount,
          feeTaxAmount,
          balanceAfter,
          memo,
        },
      });


      return {
        id: trade.id.toString(), cashTransactionId: cashTransaction.id.toString(), amount: amount.toString(), feeTaxAmount: feeTaxAmount.toString(), balanceAfter: balanceAfter.toString(),
        remainingQuantity: remainingBefore.minus(quantity).toString(), realizedProfitLoss: quantity.mul(unitPrice.minus(buyTrade.unitPrice)).toString(),
      };
    });

    return reply.code(201).send({ data: result });
  });
}
