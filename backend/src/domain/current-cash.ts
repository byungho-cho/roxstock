import { Prisma } from '../generated/prisma/index.js';
import { ApiError } from '../lib/api-error.js';

export const latestCashOrder = [{ createdAt: 'desc' }, { id: 'desc' }] as const;
export function cashBasis(latest: { id: bigint; balanceAfter: Prisma.Decimal | null; updatedAt: Date } | null | undefined) {
  return { balance: latest?.balanceAfter ?? null, transactionId: latest?.id.toString() ?? null,
    status: !latest ? 'NO_TRANSACTIONS' as const : latest.balanceAfter == null ? 'BALANCE_MISSING' as const : 'AVAILABLE' as const,
    updatedAt: latest?.updatedAt ?? null };
}
export async function readCurrentCash(reader: Prisma.TransactionClient, accountId: bigint) {
  return cashBasis(await reader.cashTransaction.findFirst({ where: { accountId }, orderBy: [...latestCashOrder] }));
}
export function requireCash(balance: Prisma.Decimal | null) {
  if (balance === null) throw new ApiError(409, 'CASH_BALANCE_UNAVAILABLE', '최신 예수금 내역의 세후예수금이 없습니다. 입금 또는 해당 내역을 확인해 주세요.');
  return balance;
}
// All cash writers take this lock before reading the latest entry. Parameterized SQL only.
export async function lockCashAccount(tx: Prisma.TransactionClient, accountId: bigint) {
  await tx.$queryRaw`SELECT id FROM accounts WHERE id = ${accountId} FOR UPDATE`;
}
export async function syncCurrentCash(tx: Prisma.TransactionClient, accountId: bigint) {
  const basis = await readCurrentCash(tx, accountId);
  if (basis.balance !== null) await tx.account.update({ where: { id: accountId }, data: { cashBalance: basis.balance } });
  return basis;
}
