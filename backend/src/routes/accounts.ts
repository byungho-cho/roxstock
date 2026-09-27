import type { FastifyInstance } from 'fastify';
import { Prisma } from '../generated/prisma/index.js';

import { ApiError } from '../lib/api-error.js';
import { dateTime, id, optionalMemo, positiveDecimal } from '../lib/input.js';
import { prisma } from '../lib/prisma.js';

type AccountBody = { name?: unknown; brokerName?: unknown; accountNumber?: unknown };
type CashBody = {
  accountId?: unknown;
  transactionType?: unknown;
  transactionDate?: unknown;
  amount?: unknown;
  memo?: unknown;
};

const requiredText = (value: unknown, fieldName: string, maxLength: number) => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new ApiError(400, 'INVALID_INPUT', `${fieldName} must be between 1 and ${maxLength} characters.`);
  }
  return value.trim();
};

const optionalText = (value: unknown, fieldName: string, maxLength: number) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw new ApiError(400, 'INVALID_INPUT', `${fieldName} must be at most ${maxLength} characters.`);
  }
  return value.trim();
};

export async function accountRoutes(app: FastifyInstance) {
  app.get('/accounts', async () => {
    const accounts = await prisma.account.findMany({ orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }] });
    return {
      data: accounts.map((account) => ({
        id: account.id.toString(),
        name: account.name,
        brokerName: account.brokerName,
        accountNumber: account.accountNumber,
        cashBalance: account.cashBalance.toString(),
        isActive: account.isActive,
        displayOrder: account.displayOrder,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
      })),
    };
  });

  app.post<{ Body: AccountBody }>('/accounts', async (request, reply) => {
    const body = request.body ?? {};
    const account = await prisma.account.create({
      data: {
        name: requiredText(body.name, 'name', 100),
        brokerName: requiredText(body.brokerName, 'brokerName', 100),
        accountNumber: optionalText(body.accountNumber, 'accountNumber', 50),
      },
    });
    return reply.code(201).send({ data: { id: account.id.toString(), cashBalance: account.cashBalance.toString() } });
  });

  app.post<{ Body: CashBody }>('/cash-transactions', async (request, reply) => {
    const body = request.body ?? {};
    const accountId = id(body.accountId, 'accountId');
    const type = body.transactionType;
    if (type !== 'DEPOSIT' && type !== 'WITHDRAWAL') {
      throw new ApiError(400, 'INVALID_INPUT', 'transactionType must be DEPOSIT or WITHDRAWAL.');
    }
    const transactionDate = dateTime(body.transactionDate, 'transactionDate');
    const amount = positiveDecimal(body.amount, 'amount');
    const memo = optionalMemo(body.memo);
    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account || !account.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
      const balanceAfter = type === 'DEPOSIT' ? account.cashBalance.plus(amount) : account.cashBalance.minus(amount);
      if (balanceAfter.isNegative()) throw new ApiError(409, 'INSUFFICIENT_CASH', 'Cash balance is insufficient.');
      const transaction = await tx.cashTransaction.create({
        data: { accountId, transactionType: type, transactionDate, amount, feeTaxAmount: new Prisma.Decimal(0), balanceAfter, memo },
      });
      await tx.account.update({ where: { id: accountId }, data: { cashBalance: balanceAfter } });
      return { transaction, balanceAfter };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5_000, timeout: 10_000 });
    return reply.code(201).send({
      data: { id: result.transaction.id.toString(), balanceAfter: result.balanceAfter.toString() },
    });
  });
}
