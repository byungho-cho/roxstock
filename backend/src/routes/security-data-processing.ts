import {prisma} from '../auth/scoped-db.js';
import {processingView} from '@roxstock/shared/domain/security-data-aggregation';
export async function securityProcessingStatus(){
 const [cursor,run,lastStored]=await Promise.all([prisma.securityDataCursor.findUnique({where:{id:1}}),prisma.collectorRun.findFirst({where:{jobType:'dart-financial-statements',metadata:{path:'$.phase',equals:'SECURITY_DATA'}},orderBy:{id:'desc'}}),prisma.dartFinancialFiling.findFirst({orderBy:{collectedAt:'desc'},select:{collectedAt:true}})]);
 return {enabled:process.env.SECURITY_DATA_COLLECTION_ENABLED==='true',cursor,run:run?{id:String(run.id),status:run.status,startedAt:run.startedAt.toISOString(),finishedAt:run.finishedAt?.toISOString()??null,...(run.metadata&&typeof run.metadata==='object'?run.metadata:{})}:null,aggregation:processingView(run,cursor,lastStored?.collectedAt.toISOString()??null)};
}
