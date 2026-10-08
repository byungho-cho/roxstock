import { refreshSummary } from '../collector/refresh-summary.js';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/api-error.js';
import { id } from '../lib/input.js';
import { enqueueManualRefresh, parseManualRefresh, type ManualRefreshMetadata } from '../collector/dart-manual-refresh.js';

export async function financialRefreshRoutes(app: FastifyInstance) {
  app.get<{Params:{id:string}}>('/securities/:id/financial-refresh/active',async request=>{
    const securityId=id(request.params.id,'id').toString();
    const run=await prisma.collectorRun.findFirst({where:{jobType:'dart-financial-statements',status:'RUNNING',AND:[{metadata:{path:'$.phase',equals:'MANUAL'}},{metadata:{path:'$.securityId',equals:securityId}}]},orderBy:{startedAt:'desc'}});
    const metadata=run?.metadata as unknown as ManualRefreshMetadata|undefined;
    return {data:run&&metadata?{requestId:String(run.id),state:metadata.manualState,status:run.status,progress:metadata.progress??null,counts:refreshSummary(metadata.results??[])}:null};
  });
  app.post<{ Params: { id: string }; Body: unknown }>('/securities/:id/financial-refresh', async (request, reply) => {
    const securityId = id(request.params.id, 'id');
    const input = parseManualRefresh(request.body);
    const run = await enqueueManualRefresh(prisma, securityId, input);
    return reply.code(202).send({ data: { requestId: run.id.toString(), state: 'QUEUED' } });
  });
  app.get<{ Params: { id: string; requestId: string } }>('/securities/:id/financial-refresh/:requestId', async (request) => {
    const securityId = id(request.params.id, 'id').toString();
    const run = await prisma.collectorRun.findUnique({ where: { id: id(request.params.requestId, 'requestId') } });
    const m = run?.metadata as unknown as ManualRefreshMetadata | undefined;
    if (!run || run.jobType !== 'dart-financial-statements' || m?.phase !== 'MANUAL' || m.securityId !== securityId) throw new ApiError(404, 'REFRESH_NOT_FOUND', '업데이트 요청을 찾을 수 없습니다.');
    return { data: { requestId: run.id.toString(), state: m.manualState, status: run.status, fiscalYear: m.fiscalYear, startYear:m.startYear??m.fiscalYear,endYear:m.endYear??m.fiscalYear, period: m.period, startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null, progress: m.progress ?? null, counts: refreshSummary(m.results??[]), results: m.results ?? [] } };
  });
}
