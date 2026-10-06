import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '../generated/prisma/index.js';
import { ApiError } from '../lib/api-error.js';
import { getSeoulClock } from './time.js';
import { PrismaDartRepository } from './dart-repository.js';
import { DartApiError, OpenDartProvider, normalizeDartFinancialRows, type DartPeriodType, type DartReportCode } from './dart-provider.js';
import { getCfsThenOfs, parseDartDate, endOfFiscalPeriod, type DartCollectorConfig } from './dart-collector.js';

export const manualReports: Record<DartPeriodType, DartReportCode> = { Q1: '11013', Q2: '11012', Q3: '11014', ANNUAL: '11011' };
export interface ManualRefreshMetadata { phase: 'MANUAL'; securityId: string; fiscalYear: number; period: DartPeriodType | 'ALL'; manualState: 'QUEUED' | 'PROCESSING' | 'FINISHED'; results?: Array<{ period: DartPeriodType; status: 'SUCCESS' | 'NO_DATA' | 'FAILED'; code?: string; created?: boolean }> }
export function parseManualRefresh(body: unknown): { fiscalYear: number; period: DartPeriodType | 'ALL' } {
  const b = body as Record<string, unknown> | null;
  const year = b?.fiscalYear;
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 2015 || year > Number(getSeoulClock(new Date()).dateKey.slice(0, 4))) throw new ApiError(400, 'INVALID_INPUT', 'fiscalYear must be an integer from 2015 through the current year.');
  if (typeof b?.period !== 'string' || !['Q1', 'Q2', 'Q3', 'ANNUAL', 'ALL'].includes(b.period)) throw new ApiError(400, 'INVALID_INPUT', 'period must be Q1, Q2, Q3, ANNUAL or ALL.');
  return { fiscalYear: year, period: b.period as DartPeriodType | 'ALL' };
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
    const metadata: ManualRefreshMetadata = { phase: 'MANUAL', securityId: securityId.toString(), ...input, manualState: 'QUEUED' };
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
  const metadata = run.metadata as unknown as ManualRefreshMetadata;
  const results: NonNullable<ManualRefreshMetadata['results']> = [];
  const periods = metadata.period === 'ALL' ? Object.keys(manualReports) as DartPeriodType[] : [metadata.period];
  try {
    if (!config.enabled || !config.apiKey) throw new DartApiError('API_KEY_MISSING', 'DART 수집 설정을 확인해 주세요.');
    await db.collectorRun.update({ where: { id: run.id }, data: { metadata: { ...metadata, manualState: 'PROCESSING' } as unknown as Prisma.InputJsonValue } });
    const provider = new OpenDartProvider({ apiKey: config.apiKey, dailyCallLimit: config.dailyCallLimit, minDelayMs: config.minDelayMs,
      reserveCall: (limit) => repo.reserveApiCall(limit, new Date(), owner),
      onApiStatus: (code) => repo.recordApiResult(code === '013' ? 'NO_DATA' : 'ERROR') });
    const securityId = BigInt(metadata.securityId);
    const security = await db.security.findUnique({ where: { id: securityId }, include: { dartCorpMapping: true } });
    if (!security?.isActive || security.securityType !== 'STOCK') throw new DartApiError('SECURITY_NOT_FOUND', '수집 대상 종목을 확인해 주세요.');
    let mapping = security.dartCorpMapping;
    if (!mapping) {
      await repo.syncCorporations(await provider.fetchCorporations());
      mapping = await db.dartCorpMapping.findUnique({ where: { securityId } });
    }
    if (!mapping) throw new DartApiError('DART_CORP_CODE_NOT_MAPPED', 'DART 기업코드가 연결되지 않은 종목입니다.');
    const reports = await provider.listPeriodicReports(mapping.corpCode, metadata.fiscalYear);
    for (const period of periods) {
      try {
        const report = reports.find((r) => r.reportCode === manualReports[period] && !r.withdrawn);
        if (!report) { results.push({ period, status: 'NO_DATA', code: 'NO_PERIODIC_FILING' }); continue; }
        const stored=await db.dartFinancialFiling.findUnique({where:{receiptNo:report.receiptNo},select:{securityId:true,fiscalYear:true,periodType:true,isWithdrawn:true,normalizationVersion:true}});
        if(stored&&!stored.isWithdrawn&&stored.normalizationVersion>=2&&stored.securityId===securityId&&stored.fiscalYear===metadata.fiscalYear&&stored.periodType===period){results.push({period,status:'SUCCESS',created:false});continue;}
        const filing = await getCfsThenOfs(provider, mapping.corpCode, metadata.fiscalYear, manualReports[period]);
        if (!filing.rows.length) { results.push({ period, status: 'NO_DATA', code: 'FINANCIAL_ROWS_NOT_PUBLISHED' }); continue; }
        if (filing.rows.some((r) => r.receiptNo !== report.receiptNo)) throw new DartApiError('RECEIPT_MISMATCH', '공시 목록과 재무제표 접수번호가 일치하지 않습니다.');
        const saved = await repo.saveFiling({ securityId, fiscalYear: metadata.fiscalYear, periodType: period, reportCode: manualReports[period], fsDivision: filing.division,
          receiptNo: report.receiptNo, reportName: report.reportName, receiptDate: parseDartDate(report.receiptDate), periodEndDate: endOfFiscalPeriod(metadata.fiscalYear, period), collectedAt: new Date(), values: normalizeDartFinancialRows(filing.rows) });
        results.push({ period, status: 'SUCCESS', created: saved.created });
      } catch (error) {
        results.push({ period, status: 'FAILED', code: error instanceof DartApiError ? error.code : 'COLLECTOR_ERROR' });
        if (error instanceof DartApiError && (error.quotaExceeded || ['010', '011', '012', 'API_KEY_MISSING'].includes(error.code))) {
          for (const remaining of periods.slice(results.length)) results.push({ period: remaining, status: 'FAILED', code: error.code });
          break;
        }
      }
    }
  } catch (error) {
    const code = error instanceof DartApiError ? error.code : 'COLLECTOR_ERROR';
    for (const period of periods.slice(results.length)) results.push({ period, status: 'FAILED', code });
  } finally {
    try {
      const success = results.filter((r) => r.status === 'SUCCESS').length;
      const failed = results.filter((r) => r.status === 'FAILED').length;
      const skipped = results.filter((r) => r.status === 'NO_DATA').length;
      for (const result of results) await db.collectorRunItem.create({ data: { runId: run.id, securityId: BigInt(metadata.securityId), symbol: `${metadata.securityId}:${metadata.fiscalYear}:${result.period}`, status: result.status, message: result.code ?? (result.created ? '신규 판본 저장' : '기존 판본 확인') } });
      await repo.finishRun(run.id, failed ? success || skipped ? 'PARTIAL' : 'FAILED' : skipped === periods.length ? 'SKIPPED' : 'SUCCESS', { success, failed, skipped }, failed ? results.find((r) => r.status === 'FAILED')?.code : undefined, { ...metadata, manualState: 'FINISHED', results });
    } finally { await repo.releaseLock(owner); }
  }
  return true;
}
