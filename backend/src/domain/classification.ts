import { Prisma, type WatchlistType } from '../generated/prisma/index.js';
import { ApiError } from '../lib/api-error.js';
import { calculateRemainingQuantity } from './trade.js';

export function manualClassification(value: unknown): WatchlistType {
  if (value !== 'WATCHLIST' && value !== 'RECOMMENDED' && value !== 'HOLDING') {
    throw new ApiError(400, 'INVALID_LIST_TYPE', '관심·추천·보유만 직접 분류할 수 있습니다. 거래종목은 자동 판정됩니다.');
  }
  return value;
}

export async function requireActiveAccount(tx: Prisma.TransactionClient, accountId: bigint) {
  const account = await tx.account.findUnique({ where: { id: accountId }, select: { id: true, isActive: true } });
  if (!account?.isActive) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', '계좌를 찾을 수 없습니다.');
}

export async function assertClassificationChange(
  tx: Prisma.TransactionClient, accountId: bigint, securityId: bigint, destination: WatchlistType | null,
) {
  const lots = await tx.buyTrade.findMany({
    where: { accountId, securityId },
    select: { quantity: true, sellTrades: { select: { quantity: true } } },
  });
  if (!lots.length) return;
  const remaining = lots.reduce((sum, lot) => sum.plus(calculateRemainingQuantity(lot.quantity, lot.sellTrades.map(s => s.quantity))), new Prisma.Decimal(0));
  if (remaining.lte(0)) {
    throw new ApiError(409, 'TRADED_CLASSIFICATION_READ_ONLY', '거래 이력이 있고 잔여수량이 0인 종목은 거래종목으로 자동 판정되어 분류를 변경할 수 없습니다.');
  }
  if (destination !== 'HOLDING') {
    throw new ApiError(409, 'HOLDING_HAS_TRADE_HISTORY', '이 계좌에 매수·거래 이력이 있어 보유종목을 관심·추천으로 이동하거나 목록에서 삭제할 수 없습니다.');
  }
}
