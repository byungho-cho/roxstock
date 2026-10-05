import type { FastifyInstance } from 'fastify';
import { CashTransactionType, Prisma } from '../generated/prisma/index.js';
import { ApiError } from '../lib/api-error.js';
import { dateTime, id, optionalMemo, positiveDecimal } from '../lib/input.js';
import { prisma } from '../lib/prisma.js';

type CashEditBody = { transactionDate?: unknown; amount?: unknown; memo?: unknown; securityId?: unknown; grossAmount?: unknown };
type DividendBody = { accountId?: unknown; securityId?: unknown; receivedDate?: unknown; grossAmount?: unknown; netAmount?: unknown; memo?: unknown };
const transactionOptions = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 } as const;
const dividendDay = (date: Date) => new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
const editable = (type: CashTransactionType) => type === CashTransactionType.DEPOSIT || type === CashTransactionType.WITHDRAWAL || type === CashTransactionType.DIVIDEND;

export async function cashMutationRoutes(app: FastifyInstance) {
  app.post<{ Body: DividendBody }>('/dividends', async (request, reply) => {
    const body = request.body ?? {};
    const accountId = id(body.accountId, 'accountId');
    const securityId = id(body.securityId, 'securityId');
    const receivedAt = dateTime(body.receivedDate, 'receivedDate');
    const grossAmount = positiveDecimal(body.grossAmount, 'grossAmount');
    const netAmount = positiveDecimal(body.netAmount, 'netAmount');
    if (grossAmount.lessThan(netAmount)) throw new ApiError(400, 'INVALID_INPUT', 'grossAmount must be at least netAmount.');
    const memo = optionalMemo(body.memo);
    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account || !account.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
      const security = await tx.security.findUnique({ where: { id: securityId } });
      if (!security || !security.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
      const balanceAfter = account.cashBalance.plus(netAmount);
      const cash = await tx.cashTransaction.create({ data: {
        accountId, transactionType: CashTransactionType.DIVIDEND, transactionDate: receivedAt,
        amount: netAmount, feeTaxAmount: new Prisma.Decimal(0), balanceAfter, memo,
      } });
      const dividend = await tx.dividend.create({ data: {
        accountId, securityId, cashTransactionId: cash.id, receivedDate: dividendDay(receivedAt), grossAmount, netAmount, memo,
      } });
      await tx.account.update({ where: { id: accountId }, data: { cashBalance: balanceAfter } });
      return { id: dividend.id.toString(), cashTransactionId: cash.id.toString(), balanceAfter: balanceAfter.toString() };
    }, transactionOptions);
    return reply.code(201).send({ data: result });
  });

  app.patch<{ Params: { transactionId: string }; Body: CashEditBody }>('/cash-transactions/:transactionId', async (request) => {
    const transactionId = id(request.params.transactionId, 'transactionId');
    const body = request.body ?? {};
    const result = await prisma.$transaction(async (tx) => {
      const cash = await tx.cashTransaction.findUnique({ where: { id: transactionId }, include: { dividend: true } });
      if (!cash || !editable(cash.transactionType)) throw new ApiError(404, 'CASH_TRANSACTION_NOT_FOUND', 'Editable cash transaction not found.');
      const transactionDate = body.transactionDate === undefined ? cash.transactionDate : dateTime(body.transactionDate, 'transactionDate');
      const amount = body.amount === undefined ? cash.amount : positiveDecimal(body.amount, 'amount');
      const memo = body.memo === undefined ? cash.memo : optionalMemo(body.memo);
      if (cash.transactionType === CashTransactionType.DIVIDEND) {
        if (!cash.dividend) throw new ApiError(409, 'DIVIDEND_LINK_MISSING', 'Dividend record is missing.');
        const securityId = body.securityId === undefined ? cash.dividend.securityId : id(body.securityId, 'securityId');
        const security = await tx.security.findUnique({ where: { id: securityId } });
        if (!security || !security.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
        const grossAmount = body.grossAmount === undefined ? cash.dividend.grossAmount : positiveDecimal(body.grossAmount, 'grossAmount');
        if (grossAmount.lessThan(amount)) throw new ApiError(400, 'INVALID_INPUT', 'grossAmount must be at least amount.');
        await tx.dividend.update({ where: { id: cash.dividend.id }, data: {
          securityId, grossAmount, netAmount: amount, receivedDate: dividendDay(transactionDate), memo,
        } });
      } else if (body.securityId !== undefined || body.grossAmount !== undefined) {
        throw new ApiError(400, 'INVALID_INPUT', 'Dividend fields are only valid for dividends.');
      }
      await tx.cashTransaction.update({ where: { id: transactionId }, data: { transactionDate, amount, memo } });
      return { id: transactionId.toString(), cashBalanceAdjusted: false };
    }, transactionOptions);
    return { data: result };
  });

  app.delete<{ Params: { transactionId: string } }>('/cash-transactions/:transactionId', async (request) => {
    const transactionId = id(request.params.transactionId, 'transactionId');
    const result = await prisma.$transaction(async (tx) => {
      const cash = await tx.cashTransaction.findUnique({ where: { id: transactionId }, include: { dividend: true } });
      if (!cash || !editable(cash.transactionType)) throw new ApiError(404, 'CASH_TRANSACTION_NOT_FOUND', 'Editable cash transaction not found.');
      if (cash.transactionType === CashTransactionType.DIVIDEND && !cash.dividend) throw new ApiError(409, 'DIVIDEND_LINK_MISSING', 'Dividend record is missing.');
      if (cash.dividend) await tx.dividend.delete({ where: { id: cash.dividend.id } });
      await tx.cashTransaction.delete({ where: { id: transactionId } });
      return { id: transactionId.toString(), cashBalanceAdjusted: false };
    }, transactionOptions);
    return { data: result };
  });

  app.patch<{ Params: { accountId: string }; Body: { amount?: unknown } }>('/accounts/:accountId/cash-balance', async (request) => {
    const accountId = id(request.params.accountId, 'accountId');
    const raw = request.body?.amount;
    if (typeof raw !== 'string' || !/^\d+(\.\d+)?$/.test(raw)) throw new ApiError(400, 'INVALID_INPUT', 'amount must be a non-negative decimal string.');
    const amount = new Prisma.Decimal(raw);
    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account || !account.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
      await tx.account.update({ where: { id: accountId }, data: { cashBalance: amount } });
      return { accountId: accountId.toString(), previousBalance: account.cashBalance.toString(), cashBalance: amount.toString() };
    }, transactionOptions);
    request.log.info({ accountId: result.accountId, previousBalance: result.previousBalance, cashBalance: result.cashBalance }, 'cash balance corrected directly');
    return { data: result };
  });
}
