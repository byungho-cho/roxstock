import type {Prisma} from '@roxstock/shared/prisma';
import {ApiError} from '@roxstock/shared/lib/api-error';
import {authContext} from '../auth/context.js';

/** Installation-wide delete protection: expose reason labels, never another user's rows. */
export async function securityUsageReasons(db:Pick<Prisma.TransactionClient,'$queryRaw'>,securityId:bigint){
 if(authContext.getStore()?.role!=='ADMIN')throw new ApiError(403,'ADMIN_REQUIRED','관리자만 사용할 수 있습니다.');
 const rows=await db.$queryRaw<Array<{reason:string}>>`
  SELECT '보유·거래내역' AS reason WHERE EXISTS (SELECT 1 FROM buy_trades WHERE security_id=${securityId})
  UNION ALL SELECT '관심·추천 목록' WHERE EXISTS (SELECT 1 FROM account_watchlist_items WHERE security_id=${securityId})
  UNION ALL SELECT '기존 관심 목록' WHERE EXISTS (SELECT 1 FROM watchlist_items WHERE security_id=${securityId})
  UNION ALL SELECT '배당' WHERE EXISTS (SELECT 1 FROM dividends WHERE security_id=${securityId})
  UNION ALL SELECT '과거 보유 스냅샷' WHERE EXISTS (SELECT 1 FROM daily_position_snapshots WHERE security_id=${securityId})
 `;
 return rows.map(row=>row.reason);
}
