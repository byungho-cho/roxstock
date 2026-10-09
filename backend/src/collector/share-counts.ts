import {Prisma,type PrismaClient,type DartFinancialFiling} from '../generated/prisma/index.js';
import type {PeriodShares} from '../domain/share-counts.js';
export async function storeShareCounts(db:PrismaClient,f:DartFinancialFiling,shares:PeriodShares|undefined){
 if(!shares?.rows?.length||shares.receiptNo!==f.receiptNo)return;
 await db.$transaction(async tx=>{for(const row of shares.rows!){
  if(row.periodEndDate!==f.periodEndDate.toISOString().slice(0,10))throw Error('SHARES_PERIOD_MISMATCH');
  const where={securityId_receiptNo_stockKind:{securityId:f.securityId,receiptNo:f.receiptNo,stockKind:row.stockKind}};
  const values={...(row.issuedShares!==null?{issuedShares:new Prisma.Decimal(row.issuedShares)}:{}),...(row.treasuryShares!==null?{treasuryShares:new Prisma.Decimal(row.treasuryShares)}:{}),...(row.outstandingShares!==null?{outstandingShares:new Prisma.Decimal(row.outstandingShares)}:{})};
  const data={fiscalYear:f.fiscalYear,reportCode:f.reportCode,shareClass:row.shareClass,periodEndDate:f.periodEndDate,collectedAt:new Date(shares.collectedAt??Date.now()),...values};
  await tx.dartShareSnapshot.upsert({where,create:{securityId:f.securityId,receiptNo:f.receiptNo,stockKind:row.stockKind,...data},update:data});
 }});
}
