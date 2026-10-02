import type { FastifyInstance } from 'fastify';
import { Prisma } from '../generated/prisma/index.js';

import { ApiError } from '../lib/api-error.js';
import { dateTime, id, optionalMemo, positiveDecimal } from '../lib/input.js';
import { prisma } from '../lib/prisma.js';

type AccountBody = { name?: unknown; brokerName?: unknown; accountNumber?: unknown; isDefault?: unknown };
type AccountParams = { accountId: string };
type ResetBody = { confirmation?: unknown };
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

export const normalizeAccountNumber = (value: string | null) => {
  if (value === null) return null;
  const normalized = value.replace(/[\s-]/g, '');
  return normalized.length === 0 ? null : normalized;
};

export const isAccountDataResetEnabled = (value = process.env.ENABLE_ACCOUNT_DATA_RESET) => value === 'true';

const boolean = (value: unknown, fieldName: string) => {
  if (typeof value !== 'boolean') throw new ApiError(400, 'INVALID_INPUT', `${fieldName} must be a boolean.`);
  return value;
};

const transactionOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 5_000,
  timeout: 15_000,
} as const;

const duplicateAccountError = () => new ApiError(
  409,
  'ACCOUNT_ALREADY_EXISTS',
  'An account with the same broker and account number already exists.',
);

const mapAccountWriteError = (error: unknown): never => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw duplicateAccountError();
  throw error;
};

const resetLocks = new Set<string>();

export async function accountRoutes(app: FastifyInstance) {
  app.get('/accounts', async () => {
    const accounts = await prisma.account.findMany({ orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }] });
    return {
      data: accounts.map((account) => ({
        id: account.id.toString(),
        name: account.name,
        brokerName: account.brokerName,
        accountNumber: account.accountNumber,
        isDefault: account.isDefault,
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
    const name = requiredText(body.name, 'name', 100);
    const brokerName = requiredText(body.brokerName, 'brokerName', 100);
    const accountNumber = optionalText(body.accountNumber, 'accountNumber', 50);
    const normalizedAccountNumber = normalizeAccountNumber(accountNumber);
    const requestedDefault = body.isDefault === undefined ? false : boolean(body.isDefault, 'isDefault');
    try {
      const account = await prisma.$transaction(async (tx) => {
        const activeCount = await tx.account.count({ where: { isActive: true } });
        const isDefault = activeCount === 0 || requestedDefault;
        if (isDefault) await tx.account.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        return tx.account.create({
          data: { name, brokerName, accountNumber, normalizedAccountNumber, isDefault },
        });
      }, transactionOptions);
      return reply.code(201).send({
        data: { id: account.id.toString(), cashBalance: account.cashBalance.toString(), isDefault: account.isDefault },
      });
    } catch (error) {
      mapAccountWriteError(error);
    }
  });

  app.patch<{ Params: AccountParams; Body: AccountBody }>('/accounts/:accountId', async (request) => {
    const accountId = id(request.params.accountId, 'accountId');
    const body = request.body ?? {};
    if (body.name === undefined && body.brokerName === undefined && body.accountNumber === undefined && body.isDefault === undefined) {
      throw new ApiError(400, 'INVALID_INPUT', 'At least one account field is required.');
    }
    try {
      const account = await prisma.$transaction(async (tx) => {
        const current = await tx.account.findUnique({ where: { id: accountId } });
        if (!current || !current.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
        const accountNumber = body.accountNumber === undefined
          ? current.accountNumber
          : optionalText(body.accountNumber, 'accountNumber', 50);
        const makeDefault = body.isDefault === undefined ? current.isDefault : boolean(body.isDefault, 'isDefault');
        if (current.isDefault && !makeDefault) {
          throw new ApiError(409, 'DEFAULT_ACCOUNT_REQUIRED', 'Choose another default account before clearing this one.');
        }
        if (makeDefault) {
          await tx.account.updateMany({ where: { isDefault: true, id: { not: accountId } }, data: { isDefault: false } });
        }
        return tx.account.update({
          where: { id: accountId },
          data: {
            ...(body.name === undefined ? {} : { name: requiredText(body.name, 'name', 100) }),
            ...(body.brokerName === undefined ? {} : { brokerName: requiredText(body.brokerName, 'brokerName', 100) }),
            ...(body.accountNumber === undefined ? {} : {
              accountNumber,
              normalizedAccountNumber: normalizeAccountNumber(accountNumber),
            }),
            isDefault: makeDefault,
          },
        });
      }, transactionOptions);
      return {
        data: {
          id: account.id.toString(), name: account.name, brokerName: account.brokerName,
          accountNumber: account.accountNumber, cashBalance: account.cashBalance.toString(),
          isActive: account.isActive, isDefault: account.isDefault,
        },
      };
    } catch (error) {
      mapAccountWriteError(error);
    }
  });

  app.post<{ Params: AccountParams; Body: ResetBody }>('/accounts/:accountId/reset', async (request) => {
    if (!isAccountDataResetEnabled()) {
      throw new ApiError(403, 'ACCOUNT_RESET_DISABLED', 'Account data reset is disabled in this environment.');
    }
    if (request.body?.confirmation !== '초기화') {
      throw new ApiError(400, 'RESET_CONFIRMATION_MISMATCH', 'Type 초기화 to confirm account data reset.');
    }
    const accountId = id(request.params.accountId, 'accountId');
    const lockKey = accountId.toString();
    if (resetLocks.has(lockKey)) throw new ApiError(409, 'ACCOUNT_RESET_IN_PROGRESS', 'Account data reset is already running.');
    resetLocks.add(lockKey);
    try {
      const result = await prisma.$transaction(async (tx) => {
        const account = await tx.account.findUnique({ where: { id: accountId }, select: { id: true, isActive: true } });
        if (!account || !account.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
        const compoundGoals = await tx.compoundGrowthGoal.deleteMany({ where: { plan: { accountId } } });
        const compoundPlans = await tx.compoundGrowthPlan.deleteMany({ where: { accountId } });
        const positionSnapshots = await tx.dailyPositionSnapshot.deleteMany({ where: { accountId } });
        const accountSnapshots = await tx.dailyAccountSnapshot.deleteMany({ where: { accountId } });
        const dividends = await tx.dividend.deleteMany({ where: { accountId } });
        const sellTrades = await tx.sellTrade.deleteMany({ where: { buyTrade: { accountId } } });
        const buyTrades = await tx.buyTrade.deleteMany({ where: { accountId } });
        const cashTransactions = await tx.cashTransaction.deleteMany({ where: { accountId } });
        await tx.account.update({ where: { id: accountId }, data: { cashBalance: new Prisma.Decimal(0) } });

        return {
          compoundGoals: compoundGoals.count, compoundPlans: compoundPlans.count,
          positionSnapshots: positionSnapshots.count, accountSnapshots: accountSnapshots.count,
          dividends: dividends.count, sellTrades: sellTrades.count, buyTrades: buyTrades.count,
          cashTransactions: cashTransactions.count,
        };
      }, transactionOptions);
      request.log.warn({ accountId: lockKey, deleted: result }, 'account data reset completed');
      return { data: { accountId: lockKey, cashBalance: '0', deleted: result } };
    } finally {
      resetLocks.delete(lockKey);
    }
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

