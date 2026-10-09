import type {Prisma} from '../generated/prisma/index.js';
/** Every Account FK, including indirect children via buys/plans; no date/visibility filter. */
export async function accountConnections(tx:Prisma.TransactionClient,accountId:bigint) {
 const [buyTrades,cashTransactions,dividends,accountSnapshots,positionSnapshots,compoundPlans,watchlistItems,tradeRequests]=await Promise.all([
 tx.buyTrade.count({where:{accountId}}),tx.cashTransaction.count({where:{accountId}}),tx.dividend.count({where:{accountId}}),tx.dailyAccountSnapshot.count({where:{accountId}}),tx.dailyPositionSnapshot.count({where:{accountId}}),tx.compoundGrowthPlan.count({where:{accountId}}),tx.accountWatchlistItem.count({where:{accountId}}),tx.tradeRequest.count({where:{accountId}})]);
 const counts={buyTrades,cashTransactions,dividends,accountSnapshots,positionSnapshots,compoundPlans,watchlistItems,tradeRequests};
 return {hasData:Object.values(counts).some(count=>count>0),counts};
}
