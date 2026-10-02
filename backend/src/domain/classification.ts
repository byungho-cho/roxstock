import { Prisma, type WatchlistType } from '../generated/prisma/index.js';
import { ApiError } from '../lib/api-error.js';

export function manualClassification(value: unknown): WatchlistType {
  if (value !== 'WATCHLIST' && value !== 'HOLDING') {
    throw new ApiError(400, 'INVALID_LIST_TYPE', '관심·보유만 직접 분류할 수 있습니다. 거래종목은 자동 판정됩니다.');
  }
  return value;
}

export async function requireActiveAccount(tx: Prisma.TransactionClient, accountId: bigint) {
  const account = await tx.account.findUnique({ where: { id: accountId }, select: { id: true, isActive: true } });
  if (!account?.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', '계좌를 찾을 수 없습니다.');
}
