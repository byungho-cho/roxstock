// Runs only against the disposable CI MariaDB before the new migration.
import { prisma } from '../src/lib/prisma.js';
const a = await prisma.account.create({data:{name:'Migration owner',brokerName:'CI',isDefault:true,cashBalance:'1000000'}});
const b = await prisma.account.create({data:{name:'Migration second',brokerName:'CI',cashBalance:'500000'}});
for (const [symbol,listType] of [['990001','WATCHLIST'],['990002','RECOMMENDED'],['990003','HOLDING']] as const) {
 const security=await prisma.security.create({data:{symbol,name:symbol,marketType:'OTHER'}});
 await prisma.watchlistItem.create({data:{securityId:security.id,listType,memo:'preserved',targetBuyPrice:'123',priority:3}});
 if(listType==='HOLDING'){await prisma.buyTrade.create({data:{accountId:b.id,securityId:security.id,boughtAt:new Date('2026-01-01'),quantity:'10',unitPrice:'100'}});await prisma.dailyPositionSnapshot.create({data:{accountId:b.id,securityId:security.id,snapshotDate:new Date('2026-01-01'),quantity:'10',purchaseAmount:'1000',marketPrice:'100',marketValue:'1000',unrealizedProfitLoss:'0'}});}
}
await prisma.dailyAccountSnapshot.create({data:{accountId:a.id,snapshotDate:new Date('2026-01-01'),cashBalance:'1000000',stockValue:'0',totalAssetValue:'1000000'}});
await prisma.$disconnect();
