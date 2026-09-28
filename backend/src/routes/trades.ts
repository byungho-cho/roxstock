import type { FastifyInstance } from 'fastify';
import { Prisma } from '../generated/prisma/index.js';

import { calculateBuyBalance, calculateRemainingQuantity, calculateSellBalance } from '../domain/trade.js';
import { ApiError } from '../lib/api-error.js';
import { dateTime, id, nonNegativeDecimal, optionalMemo, positiveDecimal } from '../lib/input.js';
import { prisma } from '../lib/prisma.js';

type BuyBody = {
  accountId?: unknown;
  securityId?: unknown;
  boughtAt?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  feeTaxAmount?: unknown;
  memo?: unknown;
};

type SellBody = {
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

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 10_000,
} as const;

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
        security: { select: { id: true, symbol: true, name: true, marketType: true } },
        sellTrades: { select: { id: true, soldAt: true, quantity: true, unitPrice: true }, orderBy: { soldAt: 'asc' } },
      },
      orderBy: [{ boughtAt: 'asc' }, { id: 'asc' }],
    });
    const data = lots.map((lot) => {
      const soldQuantity = lot.sellTrades.reduce((sum, sell) => sum.plus(sell.quantity), new Prisma.Decimal(0));
      const remainingQuantity = calculateRemainingQuantity(lot.quantity, lot.sellTrades.map((sell) => sell.quantity));
      return {
        id: lot.id.toString(), boughtAt: lot.boughtAt.toISOString(),
        security: { id: lot.security.id.toString(), symbol: lot.security.symbol, name: lot.security.name, marketType: lot.security.marketType },
        quantity: lot.quantity.toString(), soldQuantity: soldQuantity.toString(), remainingQuantity: remainingQuantity.toString(),
        unitPrice: lot.unitPrice.toString(), remainingPurchaseAmount: remainingQuantity.mul(lot.unitPrice).toString(), memo: lot.memo,
        sellTrades: lot.sellTrades.map((sell) => ({ id: sell.id.toString(), soldAt: sell.soldAt.toISOString(), quantity: sell.quantity.toString(), unitPrice: sell.unitPrice.toString() })),
      };
    }).filter((lot) => !remainingOnly || new Prisma.Decimal(lot.remainingQuantity).greaterThan(0));
    return { data, meta: { accountId: accountId.toString(), count: data.length, remainingOnly } };
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

    const result = await prisma.$transaction(async (tx) => {
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
          transactionType: 'BUY',
          transactionDate: boughtAt,
          amount,
          feeTaxAmount,
          balanceAfter,
          memo,
        },
      });
      await tx.watchlistItem.upsert({
        where: { securityId },
        create: { securityId, listType: 'HOLDING' },
        update: { listType: 'HOLDING' },
      });
      return { trade, cashTransaction, amount, balanceAfter };
    }, transactionOptions);

    return reply.code(201).send({
      data: {
        id: result.trade.id.toString(),
        cashTransactionId: result.cashTransaction.id.toString(),
        amount: result.amount.toString(),
        feeTaxAmount: feeTaxAmount.toString(),
        balanceAfter: result.balanceAfter.toString(),
      },
    });
  });

  app.post<{ Body: SellBody }>('/sell-trades', async (request, reply) => {
    const body = request.body ?? {};
    const buyTradeId = id(body.buyTradeId, 'buyTradeId');
    const soldAt = dateTime(body.soldAt, 'soldAt');
    const quantity = positiveDecimal(body.quantity, 'quantity');
    const unitPrice = positiveDecimal(body.unitPrice, 'unitPrice');
    const feeTaxAmount = nonNegativeDecimal(body.feeTaxAmount, 'feeTaxAmount');
    const memo = optionalMemo(body.memo);

    const result = await prisma.$transaction(async (tx) => {
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
          transactionType: 'SELL',
          transactionDate: soldAt,
          amount,
          feeTaxAmount,
          balanceAfter,
          memo,
        },
      });

      const lots = await tx.buyTrade.findMany({
        where: { accountId: buyTrade.accountId, securityId: buyTrade.securityId },
        select: { quantity: true, sellTrades: { select: { quantity: true } } },
      });
      const totalRemaining = lots.reduce(
        (total, lot) => total.plus(
          calculateRemainingQuantity(lot.quantity, lot.sellTrades.map((sell) => sell.quantity)),
        ),
        new Prisma.Decimal(0),
      );
      if (totalRemaining.isZero()) {
        await tx.watchlistItem.updateMany({
          where: { securityId: buyTrade.securityId },
          data: { listType: 'WATCHLIST' },
        });
      }

      return {
        trade,
        cashTransaction,
        amount,
        balanceAfter,
        remainingQuantity: remainingBefore.minus(quantity),
        realizedProfitLoss: quantity.mul(unitPrice.minus(buyTrade.unitPrice)),
      };
    }, transactionOptions);

    return reply.code(201).send({
      data: {
        id: result.trade.id.toString(),
        cashTransactionId: result.cashTransaction.id.toString(),
        amount: result.amount.toString(),
        feeTaxAmount: feeTaxAmount.toString(),
        balanceAfter: result.balanceAfter.toString(),
        remainingQuantity: result.remainingQuantity.toString(),
        realizedProfitLoss: result.realizedProfitLoss.toString(),
      },
    });
  });
}
