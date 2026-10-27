import {manualTrace,expireManualRun} from '@roxstock/shared/collection/manual-requests';
import { refreshSummary } from '@roxstock/shared/collection/refresh-summary';
import {Prisma} from '@roxstock/shared/prisma';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../auth/scoped-db.js';
import { ApiError } from '@roxstock/shared/lib/api-error';
import { id } from '../lib/input.js';
import { enqueueManualRefresh, parseManualRefresh, type ManualRefreshMetadata } from '@roxstock/shared/collection/manual-requests';

export async function financialRefreshRoutes(app: FastifyInstance) {
  app.get<{Params:{id:string}}>('/securities/:id/financial-refresh/material-times',async request=>{
    const securityId=id(request.params.id,'id');
    const [filing,supplements]=await Promise.all([
      prisma.dartFinancialFiling.findFirst({where:{securityId,isWithdrawn:false},orderBy:{collectedAt:'desc'},select:{collectedAt:true}}),
      prisma.periodValuation.findMany({where:{securityId,supplemental:{path:'$.verifiedAt',not:Prisma.AnyNull}},select:{supplemental:true}}),
    ]);
    return {data:{financialCollectedAt:filing?.collectedAt.toISOString()??null,supplementUpdatedAt:supplements.flatMap(row=>{const at=(row.supplemental as {verifiedAt?:unknown}|null)?.verifiedAt;return typeof at==='string'&&Number.isFinite(Date.parse(at))?[at]:[];}).sort().at(-1)??null}};
  });
  app.post<{ Params: { id: string }; Body: unknown }>('/securities/:id/financial-refresh', async (request, reply) => {
    throw new ApiError(410,'HISTORICAL_REFRESH_RETIRED','과거 보완 수집은 종료되었습니다. 종목 관리에서 최신 보고자료를 확인하세요.');
  });
  app.get<{ Params: { id: string; requestId: string } }>('/securities/:id/financial-refresh/:requestId', async (request) => {
    const securityId = id(request.params.id, 'id').toString();
    let run = await prisma.collectorRun.findUnique({ where: { id: id(request.params.requestId, 'requestId') } });
    if(run&&(run.metadata as unknown as ManualRefreshMetadata).executionMode==='MANUAL_PROTOTYPE'&&await expireManualRun(prisma,run))run=await prisma.collectorRun.findUnique({where:{id:run.id}});
    const m = run?.metadata as unknown as ManualRefreshMetadata | undefined;
    if (!run || run.jobType !== 'dart-financial-statements' || m?.phase !== 'MANUAL' || m.securityId !== securityId) throw new ApiError(404, 'REFRESH_NOT_FOUND', '업데이트 요청을 찾을 수 없습니다.');
    return { data: { ...await manualTrace(prisma,run,true), requestId: run.id.toString(), state: m.manualState, status: run.status, fiscalYear: m.fiscalYear, startYear:m.startYear??m.fiscalYear,endYear:m.endYear??m.fiscalYear, period: m.period, refreshMode:m.refreshMode??'FULL', terminalCode:m.terminalCode??null, startedAt: run.startedAt.toISOString(), finishedAt: run.finishedAt?.toISOString() ?? null, progress: m.progress ?? null, counts: refreshSummary(m.results??[]), results: m.results ?? [] } };
  });
}
