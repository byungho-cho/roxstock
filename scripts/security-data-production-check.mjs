// Read-only operational evidence, executed inside the deployed collector after rollout.
import {PrismaClient} from '/app/shared/dist/generated/prisma/index.js';

const db=new PrismaClient(),json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
try{
 if(process.env.SECURITY_DATA_COLLECTION_ENABLED!=='true')throw Error('NEW_COLLECTOR_DISABLED');
 const run=await db.collectorRun.findFirst({where:{jobType:'dart-financial-statements',metadata:{path:'$.phase',equals:'SECURITY_DATA'}},orderBy:{id:'desc'}}),cursor=await db.securityDataCursor.findUnique({where:{id:1}});
 if(!run||!cursor)throw Error('NEW_COLLECTOR_NOT_OBSERVED');
 const counts=run.metadata?.counts;
 const [receipts,stored,legacyRuns]=await Promise.all([
 db.securityDataReceipt.groupBy({by:['status'],_count:true}),
 db.dartFinancialFiling.findMany({where:{collectedAt:{gte:run.startedAt}},select:{receiptNo:true,fiscalYear:true,periodType:true,fsDivision:true,collectedAt:true},take:5,orderBy:{collectedAt:'desc'}}),
 db.collectorRun.count({where:{jobType:{in:['dart-financial-statements','VALUATION_SUPPLEMENT']},startedAt:{gte:run.startedAt},NOT:{metadata:{path:'$.phase',equals:'SECURITY_DATA'}}}}),
 ]);
 if(legacyRuns)throw Error('UNEXPECTED_LEGACY_COLLECTION_RUN');
 console.log(json({checkedAt:new Date().toISOString(),cursor,run:{id:run.id,status:run.status,startedAt:run.startedAt,finishedAt:run.finishedAt,counts},receipts,stored}));
 if(run.status==='FAILED')throw Error('NEW_COLLECTION_FAILED');
 if(run.status==='RUNNING')throw Error('NEW_COLLECTION_STILL_RUNNING');
}finally{await db.$disconnect();}
