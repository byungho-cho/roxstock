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

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 10_000,
} as const;

export async function tradeRoutes(app: FastifyInstance) {
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
