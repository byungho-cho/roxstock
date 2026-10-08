import { refreshManualAnnual } from './manual-annual-prototype.js';
import { NaverAnnualProvider } from './naver-annual.js';
import { collectAnnualConsensus, freezePastEstimates } from './annual-consensus.js';
import { supplementSafely } from './valuation-supplement.js';
import { loadPeriodSupplement } from './valuation-supplement.js';
import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '../generated/prisma/index.js';
import { ApiError } from '../lib/api-error.js';
import { getSeoulClock } from './time.js';
import { PrismaDartRepository } from './dart-repository.js';
import { DartApiError, OpenDartProvider, normalizeDartFinancialRows, type DartPeriodType, type DartReportCode } from './dart-provider.js';
import { getCfsThenOfs, parseDartDate, endOfFiscalPeriod, type DartCollectorConfig } from './dart-collector.js';

export const manualReports: Record<DartPeriodType, DartReportCode> = { Q1: '11013', Q2: '11012', Q3: '11014', ANNUAL: '11011' };
export interface ManualRefreshMetadata { phase: 'MANUAL'; executionMode?: 'MANUAL_PROTOTYPE'; securityId: string; fiscalYear: number; startYear?: number; endYear?: number; period: DartPeriodType | 'ALL'; manualState: 'QUEUED' | 'PROCESSING' | 'FINISHED'; progress?: { currentYear: number; currentPeriod?: DartPeriodType; stage: 'DISCLOSURE' | 'FINANCIALS' | 'VALUATION' | 'REPORT_DONE'; completed: number; total: number }; results?: Array<{ fiscalYear?: number; kind?:string; collectionState?:string; financialComplete?:boolean; disclosureChecked?:boolean; valuationStatus?: string; valuationReasons?: Record<string,string>; valuationErrors?: Record<string,string>; period: DartPeriodType; status: 'SUCCESS' | 'NO_DATA' | 'FAILED'; code?: string; created?: boolean }> }
export function parseManualRefresh(body: unknown): { fiscalYear: number; startYear: number; endYear: number; period: DartPeriodType | 'ALL' } {
  const b = body as Record<string, unknown> | null;
  const startYear = b?.startYear ?? b?.fiscalYear, endYear = b?.endYear ?? b?.fiscalYear;
  const currentYear = Number(getSeoulClock(new Date()).dateKey.slice(0,4));
  if ([startYear,endYear].some(y=>typeof y !== 'number' || !Number.isInteger(y) || y < 2015 || y > currentYear) || Number(startYear)>Number(endYear))
    throw new ApiError(400,'INVALID_INPUT','시작연도·종료연도는 2015년부터 현재 연도까지이며 시작연도가 종료연도보다 늦을 수 없습니다.');
  if (typeof b?.period !== 'string' || !['Q1','Q2','Q3','ANNUAL','ALL'].includes(b.period)) throw new ApiError(400,'INVALID_INPUT','갱신범위를 확인해 주세요.');
  return {fiscalYear:Number(startYear),startYear:Number(startYear),endYear:Number(endYear),period:b.period as DartPeriodType|'ALL'};
}
export async function enqueueManualRefresh(db: PrismaClient, securityId: bigint, input: ReturnType<typeof parseManualRefresh>) {
  if (!process.env.DART_API_KEY?.trim() || process.env.DART_COLLECTOR_ENABLED === 'false') throw new ApiError(503, 'DART_NOT_CONFIGURED', 'DART 수집 설정을 확인해 주세요.');
  const security = await db.security.findUnique({ where: { id: securityId }, select: { id: true, isActive: true, securityType: true } });
  if (!security?.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
  if (security.securityType !== 'STOCK') throw new ApiError(422, 'DART_NOT_APPLICABLE', '재무제표 수집 대상 주식이 아닙니다.');
  const repo = new PrismaDartRepository(db);
  const owner = randomUUID();
  const lock = 'dart-manual-enqueue';
  if (!await repo.acquireLock(owner, 30, lock)) throw new ApiError(409, 'DART_REFRESH_BUSY', '요청 접수 중입니다. 잠시 후 다시 시도해 주세요.');
  try {
    const existing = await db.collectorRun.findFirst({ where: { jobType: 'dart-financial-statements', status: 'RUNNING', AND: [{ metadata: { path: '$.phase', equals: 'MANUAL' } }, { metadata: { path: '$.securityId', equals: securityId.toString() } }] }, orderBy: { startedAt: 'desc' } });
    if (existing) throw new ApiError(409, 'DART_REFRESH_IN_PROGRESS', '이 종목의 업데이트가 이미 진행 중입니다.');
    const pending = await db.collectorRun.count({ where: { jobType: 'dart-financial-statements', status: 'RUNNING', metadata: { path: '$.phase', equals: 'MANUAL' } } });
    if (pending >= 20) throw new ApiError(429, 'DART_REFRESH_QUEUE_FULL', '업데이트 요청이 많습니다. 잠시 후 다시 시도해 주세요.');
    const metadata: ManualRefreshMetadata = { phase: 'MANUAL', executionMode:'MANUAL_PROTOTYPE', securityId: securityId.toString(), ...input, manualState: 'QUEUED' };
    return db.collectorRun.create({ data: { jobType: 'dart-financial-statements', provider: 'OPEN_DART', status: 'RUNNING', metadata: metadata as unknown as Prisma.InputJsonValue } });
  } finally { await repo.releaseLock(owner, lock); }
}

/** Durable requests are consumed by the existing worker; interrupted runs resume under the shared DB lock. */
export async function processManualRefresh(db: PrismaClient, config: DartCollectorConfig) {
  const run = await db.collectorRun.findFirst({ where: { jobType: 'dart-financial-statements', status: 'RUNNING', metadata: { path: '$.phase', equals: 'MANUAL' } }, orderBy: { startedAt: 'asc' } });
  if (!run) return false;
  const repo = new PrismaDartRepository(db);
  const owner = randomUUID();
  if (!await repo.acquireLock(owner, 900)) return true;
  let fresh;
  try { fresh = await db.collectorRun.findUnique({ where: { id: run.id } }); }
  catch (error) { await repo.releaseLock(owner); throw error; }
  if (fresh?.status !== 'RUNNING') { await repo.releaseLock(owner); return true; }
  const metadata = fresh.metadata as unknown as ManualRefreshMetadata;
  const results: NonNullable<ManualRefreshMetadata['results']> = [];
  const startYear=metadata.startYear??metadata.fiscalYear, endYear=metadata.endYear??metadata.fiscalYear;
  const prototype=metadata.executionMode==='MANUAL_PROTOTYPE';
  const periods = metadata.period === 'ALL' ? (prototype?['ANNUAL','Q1','Q2','Q3']:Object.keys(manualReports)) as DartPeriodType[] : [metadata.period];
  const naver=new NaverAnnualProvider();
  const publish = async (currentYear:number, stage:NonNullable<ManualRefreshMetadata['progress']>['stage'], currentPeriod?:DartPeriodType) => {
    metadata.progress={currentYear,currentPeriod,stage,completed:results.length,total:periods.length*(endYear-startYear+1)};
    await db.collectorRun.update({where:{id:run.id},data:{metadata:{...metadata,manualState:'PROCESSING',results:[...results]} as unknown as Prisma.InputJsonValue}});
  };
  try {
    if (!config.enabled || !config.apiKey) throw new DartApiError('API_KEY_MISSING', 'DART 수집 설정을 확인해 주세요.');
    await db.collectorRun.update({ where: { id: run.id }, data: { metadata: { ...metadata, manualState: 'PROCESSING' } as unknown as Prisma.InputJsonValue } });
    const provider = new OpenDartProvider({ apiKey: config.apiKey, dailyCallLimit: config.dailyCallLimit, minDelayMs: config.minDelayMs,
      reserveCall: (limit) => repo.reserveApiCall(limit, new Date(), owner),
      onApiStatus: (code) => repo.recordApiResult(code === '013' ? 'NO_DATA' : 'ERROR') });
    const securityId = BigInt(metadata.securityId);
    const security = await db.security.findUnique({ where: { id: securityId }, include: { dartCorpMapping: true } });
    if (!security?.isActive || security.securityType !== 'STOCK') throw new DartApiError('SECURITY_NOT_FOUND', '수집 대상 종목을 확인해 주세요.');
    if(!prototype&&process.env.CONSENSUS_ENABLED==='true'){try{await freezePastEstimates(db,securityId,security.symbol,security.marketType);await collectAnnualConsensus(db,securityId,security.symbol);}catch{console.warn(JSON.stringify({event:'consensus_collection_failed',securityId:String(securityId)}));}}
    let mapping = security.dartCorpMapping;
    if (!mapping && !prototype) {
      await repo.syncCorporations(await provider.fetchCorporations());
      mapping = await db.dartCorpMapping.findUnique({ where: { securityId } });
    }
    if (!mapping && !prototype) throw new DartApiError('DART_CORP_CODE_NOT_MAPPED', 'DART 기업코드가 연결되지 않은 종목입니다.');
    for(let fiscalYear=startYear;fiscalYear<=endYear;fiscalYear++){
    await publish(fiscalYear,'DISCLOSURE');
    let reports:Awaited<ReturnType<typeof provider.listPeriodicReports>>|undefined;
    for (const period of periods) {
      try {
        await publish(fiscalYear,'FINANCIALS',period);
        if(prototype&&period==='ANNUAL'&&fiscalYear>=2023){
          await publish(fiscalYear,'VALUATION',period);
          results.push(await refreshManualAnnual(db,{...security,dartCorpMapping:mapping},fiscalYear,provider,naver,repo,run.id));continue;
        }
        if(!mapping)throw new DartApiError('DART_CORP_CODE_NOT_MAPPED','DART 기업코드가 연결되지 않은 종목입니다.');
        reports??=await provider.listPeriodicReports(mapping.corpCode,fiscalYear);
        const report = reports.find((r) => r.reportCode === manualReports[period] && !r.withdrawn);
        if (!report) { results.push({ fiscalYear, period, status: 'NO_DATA', code: 'NO_PERIODIC_FILING' }); continue; }
        const stored=await db.dartFinancialFiling.findUnique({where:{receiptNo:report.receiptNo},select:{securityId:true,fiscalYear:true,periodType:true,isWithdrawn:true,normalizationVersion:true}});
        if(stored&&!stored.isWithdrawn&&stored.normalizationVersion>=3&&stored.securityId===securityId&&stored.fiscalYear===fiscalYear&&stored.periodType===period){await publish(fiscalYear,'VALUATION',period);const metric=await supplementSafely(db,securityId,fiscalYear,period,loadPeriodSupplement(provider,security.symbol,mapping.corpCode,undefined,security.marketType));results.push({fiscalYear,period,status:'SUCCESS',created:false,valuationStatus:metric?.status,valuationErrors:metric&&'supplemental'in metric?(metric.supplemental as {errors?:Record<string,string>}|null)?.errors:undefined,valuationReasons:metric&&'reasons'in metric?metric.reasons as Record<string,string>:undefined});continue;}
        const filing = await getCfsThenOfs(provider, mapping.corpCode, fiscalYear, manualReports[period]);
        if (!filing.rows.length) { results.push({ fiscalYear, period, status: 'NO_DATA', code: 'FINANCIAL_ROWS_NOT_PUBLISHED' }); continue; }
        if (filing.rows.some((r) => r.receiptNo !== report.receiptNo)) throw new DartApiError('RECEIPT_MISMATCH', '공시 목록과 재무제표 접수번호가 일치하지 않습니다.');
        const saved = await repo.saveFiling({ securityId, fiscalYear: fiscalYear, periodType: period, reportCode: manualReports[period], fsDivision: filing.division,
          receiptNo: report.receiptNo, reportName: report.reportName, receiptDate: parseDartDate(report.receiptDate), periodEndDate: endOfFiscalPeriod(fiscalYear, period), collectedAt: new Date(), values: normalizeDartFinancialRows(filing.rows) });
        await publish(fiscalYear,'VALUATION',period);
        const metric=await supplementSafely(db,securityId,fiscalYear,period,loadPeriodSupplement(provider,security.symbol,mapping.corpCode,undefined,security.marketType));
        results.push({ fiscalYear, period, status: 'SUCCESS', created: saved.created,valuationStatus:metric?.status,valuationErrors:metric&&'supplemental'in metric?(metric.supplemental as {errors?:Record<string,string>}|null)?.errors:undefined,valuationReasons:metric&&'reasons'in metric?metric.reasons as Record<string,string>:undefined });
      } catch (error) {
        results.push({ fiscalYear, period, status: 'FAILED', code: error instanceof DartApiError ? error.code : 'COLLECTOR_ERROR' });
        if (!prototype && error instanceof DartApiError && (error.quotaExceeded || ['010', '011', '012', 'API_KEY_MISSING'].includes(error.code))) {
          throw error;
        }
      } finally { await publish(fiscalYear,'REPORT_DONE',period); }
    }
    }
  } catch (error) {
    const code = error instanceof DartApiError ? error.code : 'COLLECTOR_ERROR';
    for(let fiscalYear=startYear;fiscalYear<=endYear;fiscalYear++)for(const period of periods)if(!results.some(r=>r.fiscalYear===fiscalYear&&r.period===period))results.push({fiscalYear,period,status:'FAILED',code});
  } finally {
    try {
      if(metadata.progress)metadata.progress={...metadata.progress,completed:results.length};
      const success = results.filter((r) => r.status === 'SUCCESS').length;
      const failed = results.filter((r) => r.status === 'FAILED').length;
      const valuationIncomplete=results.some(r=>r.status==='SUCCESS'&&r.valuationStatus!=='SUCCESS');
      const skipped = results.filter((r) => r.status === 'NO_DATA').length;
      for (const result of results) await db.collectorRunItem.create({ data: { runId: run.id, securityId: BigInt(metadata.securityId), symbol: `${metadata.securityId}:${result.fiscalYear}:${result.period}`, status: result.status, message: result.code ?? (result.created ? '신규 판본 저장' : '기존 판본 확인') } });
      await repo.finishRun(run.id, failed ? success || skipped ? 'PARTIAL' : 'FAILED' : skipped === periods.length*(endYear-startYear+1) ? 'SKIPPED' : valuationIncomplete || skipped ? 'PARTIAL' : 'SUCCESS', { success, failed, skipped }, failed ? results.find((r) => r.status === 'FAILED')?.code : undefined, { ...metadata, manualState: 'FINISHED', results });
    } finally { await repo.releaseLock(owner); }
  }
  return true;
}
