import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/index.js';
import { ApiError } from '../lib/api-error.js';
import { serializable } from '../lib/transaction.js';
import { requireActiveAccount } from './classification.js';

export function requestId(value: unknown): string | undefined {
  if (value === undefined) return undefined; // Older clients still use transaction validation.
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(value)) {
    throw new ApiError(400, 'INVALID_REQUEST_ID', 'requestId must contain 16–64 letters, digits, underscores or hyphens.');
  }
  return value;
}

export async function registerTrade(
  accountId: bigint, operation: 'BUY' | 'SELL', key: string | undefined,
  payload: Record<string, unknown>, work: (tx: Prisma.TransactionClient) => Promise<Record<string, string>>,
) {
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return serializable(async tx => {
    await requireActiveAccount(tx, accountId);
    if (key) {
      const previous = await tx.tradeRequest.findUnique({ where: { accountId_requestId: { accountId, requestId: key } } });
      if (previous) {
        if (previous.operation !== operation || previous.requestHash !== hash) {
          throw new ApiError(409, 'REQUEST_ID_REUSED', '이미 처리된 요청과 입력값이 다릅니다. 거래 내역을 확인한 후 새 거래로 등록하세요.');
        }
        return previous.response as Record<string, string>;
      }
    }
    const response = await work(tx);
    if (key) await tx.tradeRequest.create({ data: { accountId, requestId: key, operation, requestHash: hash, response: response as Prisma.InputJsonObject } });
    return response;
  });
}
