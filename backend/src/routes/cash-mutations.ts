import { lockCashAccount, readCurrentCash, requireCash, syncCurrentCash } from '../domain/current-cash.js';
import { serializable } from '../lib/transaction.js';
import type { FastifyInstance } from 'fastify';
import { CashTransactionType, Prisma } from '../generated/prisma/index.js';
import { ApiError } from '../lib/api-error.js';
import { dateTime, id, optionalMemo, positiveDecimal } from '../lib/input.js';
import { prisma } from '../lib/prisma.js';

type CashEditBody = { accountId?: unknown; expectedLatestId?: unknown; transactionDate?: unknown; amount?: unknown; memo?: unknown; securityId?: unknown; grossAmount?: unknown; feeTaxAmount?: unknown; balanceAfter?: unknown };
type DividendBody = { accountId?: unknown; securityId?: unknown; receivedDate?: unknown; grossAmount?: unknown; netAmount?: unknown; memo?: unknown };
const dividendDay = (date: Date) => new Date(`${date.toISOString().slice(0, 10)}T00:00:00.000Z`);
async function latestAccount(tx: Prisma.TransactionClient, cash: {id: bigint; accountId: bigint}) {
  const account = await tx.account.findUnique({where:{id:cash.accountId}});
  if (!account?.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
  const latest = await tx.cashTransaction.findFirst({where:{accountId:cash.accountId},orderBy:[{createdAt:'desc'},{id:'desc'}]});
  if (latest?.id !== cash.id) throw new ApiError(409, 'LATEST_CASH_ONLY', '가장 최근 등록된 예수금 내역만 삭제할 수 있습니다.');
  return account;
}

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
    const result = await serializable(async (tx) => {
      await lockCashAccount(tx, accountId);
      const account = await tx.account.findUnique({ where: { id: accountId } });
      if (!account || !account.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
      const security = await tx.security.findUnique({ where: { id: securityId } });
      if (!security || !security.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
      const balanceAfter = requireCash((await readCurrentCash(tx, accountId)).balance).plus(netAmount);
      const cash = await tx.cashTransaction.create({ data: {
        accountId, transactionType: CashTransactionType.DIVIDEND, transactionDate: receivedAt,
        amount: netAmount, feeTaxAmount: grossAmount.minus(netAmount), balanceAfter, memo,
      } });
      const dividend = await tx.dividend.create({ data: {
        accountId, securityId, cashTransactionId: cash.id, receivedDate: dividendDay(receivedAt), grossAmount, netAmount, memo,
      } });
      await tx.account.update({ where: { id: accountId }, data: { cashBalance: balanceAfter } });
      return { id: dividend.id.toString(), cashTransactionId: cash.id.toString(), balanceAfter: balanceAfter.toString() };
    });
    return reply.code(201).send({ data: result });
  });

  app.patch<{ Params: { transactionId: string }; Body: CashEditBody }>('/cash-transactions/:transactionId', async (request) => {
    const transactionId = id(request.params.transactionId, 'transactionId');
    const body = request.body ?? {};
    const result = await serializable(async (tx) => {
      const initialCash = await tx.cashTransaction.findUnique({ where: { id: transactionId }, include: { dividend: true } });
      if (!initialCash) throw new ApiError(404, 'CASH_TRANSACTION_NOT_FOUND', 'Editable cash transaction not found.');
      if (request.body?.accountId !== undefined && id(request.body.accountId, 'accountId') !== initialCash.accountId) throw new ApiError(404, 'CASH_TRANSACTION_NOT_FOUND', 'Cash transaction not found in this account.');
      await lockCashAccount(tx, initialCash.accountId);
      const cash = await tx.cashTransaction.findUnique({ where: { id: transactionId }, include: { dividend: true } });
      if (!cash) throw new ApiError(409, 'CASH_CHANGED', '내역이 변경됐습니다. 다시 조회해 주세요.');
      const account = await tx.account.findUnique({where:{id:cash.accountId}});
      if (!account?.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
      const latest = await readCurrentCash(tx, cash.accountId);
      if (body.expectedLatestId !== undefined && (id(body.expectedLatestId, 'expectedLatestId').toString() !== latest.transactionId || latest.transactionId !== cash.id.toString())) throw new ApiError(409, 'LATEST_CASH_CHANGED', '최신 예수금 내역이 변경됐습니다. 카드를 다시 열어 주세요.');
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
      const decimalAmount = (value: unknown, field: string, signed = false) => {
        if (typeof value !== 'string' || !(signed ? /^-?\d+(\.\d+)?$/ : /^\d+(\.\d+)?$/).test(value)) throw new ApiError(400, 'INVALID_INPUT', `${field} must be ${signed ? 'a signed' : 'a non-negative'} decimal string.`);
        return new Prisma.Decimal(value);
      };
      const feeTaxAmount = body.feeTaxAmount === undefined ? (cash.dividend ? (body.grossAmount === undefined ? cash.dividend.grossAmount : positiveDecimal(body.grossAmount, 'grossAmount')).minus(amount) : cash.feeTaxAmount) : decimalAmount(body.feeTaxAmount, 'feeTaxAmount', true);
      const balanceAfter = body.balanceAfter === undefined ? cash.balanceAfter : decimalAmount(body.balanceAfter, 'balanceAfter');
      await tx.cashTransaction.update({ where: { id: transactionId }, data: { transactionDate, amount, memo, feeTaxAmount, balanceAfter } });
      const basis = latest.transactionId === cash.id.toString() ? await syncCurrentCash(tx, cash.accountId) : latest;
      return { id: transactionId.toString(), cashBalanceAdjusted: latest.transactionId === cash.id.toString(), currentBalance: basis.balance?.toString() ?? null, balanceStatus: basis.status };

    });
    return { data: result };
  });

  app.delete<{ Params: { transactionId: string }; Querystring: { accountId?: string } }>('/cash-transactions/:transactionId', async (request) => {
    const transactionId = id(request.params.transactionId, 'transactionId');
    const result = await serializable(async (tx) => {
      const initialCash = await tx.cashTransaction.findUnique({ where: { id: transactionId }, include: { dividend: true } });
      if (!initialCash) throw new ApiError(404, 'CASH_TRANSACTION_NOT_FOUND', 'Editable cash transaction not found.');
      if (request.query.accountId !== undefined && id(request.query.accountId, 'accountId') !== initialCash.accountId) throw new ApiError(404, 'CASH_TRANSACTION_NOT_FOUND', 'Cash transaction not found in this account.');
      await lockCashAccount(tx, initialCash.accountId);
      const cash = await tx.cashTransaction.findUnique({ where: { id: transactionId }, include: { dividend: true } });
      if (!cash) throw new ApiError(409, 'CASH_CHANGED', '내역이 변경됐습니다. 다시 조회해 주세요.');
      await latestAccount(tx, cash);
      if (cash.transactionType === CashTransactionType.DIVIDEND && !cash.dividend) throw new ApiError(409, 'DIVIDEND_LINK_MISSING', 'Dividend record is missing.');
      if (cash.dividend) await tx.dividend.delete({ where: { id: cash.dividend.id } });
      await tx.cashTransaction.delete({ where: { id: transactionId } });
      const basis = await syncCurrentCash(tx, cash.accountId);
      return { id: transactionId.toString(), cashBalanceAdjusted: true, currentBalance: basis.balance?.toString() ?? null, balanceStatus: basis.status };
    });
    return { data: result };
  });

  // Retired endpoint: a separate current-balance edit must not compete with the ledger.
  app.patch('/accounts/:accountId/cash-balance', async () => {
    throw new ApiError(409, 'LATEST_CASH_EDIT_REQUIRED', '현재예수금 카드에서 최신 내역을 수정해 주세요.');
  });
}
