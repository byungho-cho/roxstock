import { cashBasis } from '../domain/current-cash.js';
import type { FastifyInstance } from 'fastify';
import { CashTransactionType, Prisma } from '../generated/prisma/index.js';

import { ApiError } from '../lib/api-error.js';
import { id } from '../lib/input.js';
import { prisma } from '../lib/prisma.js';

type AccountParams = { accountId: string };
type HistoryQuery = { from?: string; to?: string; types?: string; limit?: string; offset?: string };
type OverviewQuery = { year?: string; month?: string; limit?: string };
type DateRange = { gte: Date; lt: Date };
type CashGroup = {
  transactionType: CashTransactionType;
  _sum: { amount: Prisma.Decimal | null; feeTaxAmount: Prisma.Decimal | null };
};

const CASH_TYPES = Object.values(CashTransactionType);
const zero = () => new Prisma.Decimal(0);

const integer = (value: string | undefined, field: string, fallback: number, min: number, max: number) => {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new ApiError(400, 'INVALID_INPUT', `${field} must be an integer.`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) {
    throw new ApiError(400, 'INVALID_INPUT', `${field} must be between ${min} and ${max}.`);
  }
  return parsed;
};

const kstDate = (year: number, month: number, day: number) =>
  new Date(`${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T00:00:00+09:00`);

export const kstMonthRange = (year: number, month: number): DateRange => ({
  gte: kstDate(year, month, 1),
  lt: month === 12 ? kstDate(year + 1, 1, 1) : kstDate(year, month + 1, 1),
});

export const kstYearRange = (year: number): DateRange => ({
  gte: kstDate(year, 1, 1),
  lt: kstDate(year + 1, 1, 1),
});

const parseDateOnly = (value: string, field: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new ApiError(400, 'INVALID_INPUT', `${field} must use YYYY-MM-DD.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const result = kstDate(year, month, day);
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
  if (formatter.format(result) !== value) throw new ApiError(400, 'INVALID_INPUT', `${field} is not a valid date.`);
  return result;
};

const nextKstDay = (date: Date) => new Date(date.getTime() + 24 * 60 * 60 * 1_000);

export const cashDelta = (
  type: CashTransactionType,
  amount: Prisma.Decimal,
  feeTaxAmount: Prisma.Decimal,
) => {
  if (type === CashTransactionType.BUY) return amount.plus(feeTaxAmount).negated();
  if (type === CashTransactionType.SELL) return amount.minus(feeTaxAmount);
  if (type === CashTransactionType.WITHDRAWAL) return amount.negated();
  return amount;
};

export const summarizeCashGroups = (groups: CashGroup[]) => {
  const totals: Record<CashTransactionType, Prisma.Decimal> = {
    BUY: zero(), SELL: zero(), DEPOSIT: zero(), WITHDRAWAL: zero(), DIVIDEND: zero(),
  };
  let netChange = zero();
  for (const group of groups) {
    const amount = group._sum.amount ?? zero();
    const fee = group._sum.feeTaxAmount ?? zero();
    totals[group.transactionType] = amount;
    netChange = netChange.plus(cashDelta(group.transactionType, amount, fee));
  }
  return {
    buy: totals.BUY.toString(), sell: totals.SELL.toString(), deposit: totals.DEPOSIT.toString(),
    withdrawal: totals.WITHDRAWAL.toString(), dividend: totals.DIVIDEND.toString(), netChange: netChange.toString(),
  };
};

const mapTransaction = (transaction: {
  id: bigint; transactionType: CashTransactionType; transactionDate: Date; amount: Prisma.Decimal;
  feeTaxAmount: Prisma.Decimal; balanceAfter: Prisma.Decimal | null; memo: string | null; createdAt: Date; updatedAt: Date;
  dividend?: { id: bigint; securityId: bigint; grossAmount: Prisma.Decimal; netAmount: Prisma.Decimal; security: { name: string } } | null;
}) => ({
  id: transaction.id.toString(),
  transactionType: transaction.transactionType,
  transactionDate: transaction.transactionDate.toISOString(),
  amount: transaction.amount.toString(),
  feeTaxAmount: (transaction.dividend ? transaction.dividend.grossAmount.minus(transaction.dividend.netAmount) : transaction.feeTaxAmount).toString(),
  signedAmount: cashDelta(transaction.transactionType, transaction.amount, transaction.feeTaxAmount).toString(),
  balanceAfter: transaction.balanceAfter?.toString() ?? null,
  memo: transaction.memo,
  dividend: transaction.dividend ? { id: transaction.dividend.id.toString(), securityId: transaction.dividend.securityId.toString(), securityName: transaction.dividend.security.name, grossAmount: transaction.dividend.grossAmount.toString(), netAmount: transaction.dividend.netAmount.toString() } : null,
  createdAt: transaction.createdAt.toISOString(),
  updatedAt: transaction.updatedAt.toISOString(),
});

const ensureAccount = async (accountId: bigint) => {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || !account.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Account not found.');
  return account;
};

const groupedSummary = (accountId: bigint, range: DateRange, types?: CashTransactionType[]) => prisma.cashTransaction.groupBy({
  by: ['transactionType'],
  where: { accountId, transactionDate: range, ...(types ? { transactionType: { in: types } } : {}) },
  _sum: { amount: true, feeTaxAmount: true },
});

export async function cashRoutes(app: FastifyInstance) {
  app.get<{ Params: { accountId: string; id: string } }>('/accounts/:accountId/cash-transactions/:id', async request => {
    const accountId = id(request.params.accountId, 'accountId');
    await ensureAccount(accountId);
    const transaction = await prisma.cashTransaction.findFirst({
      where: { id: id(request.params.id, 'id'), accountId },
      include: { dividend: { include: { security: { select: { name: true } } } } },
    });
    if (!transaction) throw new ApiError(404, 'CASH_TRANSACTION_NOT_FOUND', '연결된 예수금 내역을 찾을 수 없습니다.');
    return { data: mapTransaction(transaction) };
  });
  app.get<{ Params: AccountParams; Querystring: HistoryQuery }>('/accounts/:accountId/cash-transactions', async (request) => {
    const accountId = id(request.params.accountId, 'accountId');
    await ensureAccount(accountId);
    const limit = integer(request.query.limit, 'limit', 20, 1, 100);
    const offset = integer(request.query.offset, 'offset', 0, 0, 1_000_000);
    const from = request.query.from ? parseDateOnly(request.query.from, 'from') : kstDate(1970, 1, 1);
    const to = request.query.to ? nextKstDay(parseDateOnly(request.query.to, 'to')) : kstDate(2100, 1, 1);
    if (from >= to) throw new ApiError(400, 'INVALID_INPUT', 'from must be on or before to.');
    const types = request.query.types
      ? request.query.types.split(',').map((type) => type.trim().toUpperCase())
      : undefined;
    if (types?.some((type) => !CASH_TYPES.includes(type as CashTransactionType))) {
      throw new ApiError(400, 'INVALID_INPUT', `types must contain only ${CASH_TYPES.join(', ')}.`);
    }
    const typedTypes = types as CashTransactionType[] | undefined;
    const where = {
      accountId,
      transactionDate: { gte: from, lt: to },
      ...(typedTypes ? { transactionType: { in: typedTypes } } : {}),
    };
    const [transactions, total, groups] = await Promise.all([
      prisma.cashTransaction.findMany({ where, include: { dividend: { include: { security: { select: { name: true } } } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: offset, take: limit }),
      prisma.cashTransaction.count({ where }),
      groupedSummary(accountId, { gte: from, lt: to }, typedTypes),
    ]);
    return {
      data: transactions.map(mapTransaction),
      summary: summarizeCashGroups(groups),
      meta: { accountId: accountId.toString(), count: transactions.length, total, limit, offset, timezone: 'Asia/Seoul' },
    };
  });

  app.get<{Params:AccountParams;Querystring:{date:string}}>('/accounts/:accountId/daily-position-profit', async request => {
    const accountId=id(request.params.accountId,'accountId');await ensureAccount(accountId);
    parseDateOnly(request.query.date??'', 'date');
    const snapshotDate=new Date(`${request.query.date}T00:00:00.000Z`);
    const rows=await prisma.dailyPositionSnapshot.findMany({where:{accountId,snapshotDate,quantity:{gt:0}},include:{security:{select:{name:true}}},orderBy:{unrealizedProfitLoss:'desc'}});
    const snapshot=await prisma.dailyAccountSnapshot.findUnique({where:{accountId_snapshotDate:{accountId,snapshotDate}}});
    return {data:rows.map(row=>({id:row.securityId.toString(),name:row.security.name,profit:row.unrealizedProfitLoss.toString()})),meta:{date:request.query.date,available:!!snapshot||rows.length>0}};
  });

  app.get<{ Params: AccountParams; Querystring: OverviewQuery }>('/accounts/:accountId/cash-overview', async (request) => {
    const accountId = id(request.params.accountId, 'accountId');
    const account = await ensureAccount(accountId);
    const nowKst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const year = integer(request.query.year, 'year', nowKst.getFullYear(), 2000, 2100);
    const month = integer(request.query.month, 'month', nowKst.getMonth() + 1, 1, 12);
    const limit = integer(request.query.limit, 'limit', 10, 1, 100);
    const [monthlyGroups, yearlyGroups, recent, yearTax, dividendTax] = await Promise.all([
      groupedSummary(accountId, kstMonthRange(year, month), [CashTransactionType.DEPOSIT, CashTransactionType.WITHDRAWAL, CashTransactionType.DIVIDEND]),
      groupedSummary(accountId, kstYearRange(year), [CashTransactionType.DEPOSIT, CashTransactionType.WITHDRAWAL, CashTransactionType.DIVIDEND]),
      prisma.cashTransaction.findMany({ where: { accountId }, include: { dividend: { include: { security: { select: { name: true } } } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit }),
      prisma.cashTransaction.aggregate({where:{accountId,transactionType:{not:CashTransactionType.DIVIDEND},transactionDate:{gte:kstDate(nowKst.getFullYear(),1,1),lte:new Date()}},_sum:{feeTaxAmount:true}}),
      prisma.dividend.aggregate({where:{accountId,cashTransaction:{transactionDate:{gte:kstDate(nowKst.getFullYear(),1,1),lte:new Date()}}},_sum:{grossAmount:true,netAmount:true}}),
    ]);
    return {
      data: {
        currentYearTax: {year:nowKst.getFullYear(), amount:(yearTax._sum.feeTaxAmount ?? zero()).plus(dividendTax._sum.grossAmount ?? zero()).minus(dividendTax._sum.netAmount ?? zero()).toString()},
        account: { id: account.id.toString(), name: account.name, currentBalance: cashBasis(recent[0]).balance?.toString() ?? null, balanceStatus: cashBasis(recent[0]).status, latestTransactionId: cashBasis(recent[0]).transactionId, updatedAt: cashBasis(recent[0]).updatedAt?.toISOString() ?? null },
        monthly: { year, month, ...summarizeCashGroups(monthlyGroups) },
        yearly: { year, ...summarizeCashGroups(yearlyGroups) },
        recentTransactions: recent.map(mapTransaction),
      },
      meta: { timezone: 'Asia/Seoul', recentLimit: limit },
    };
  });
}
