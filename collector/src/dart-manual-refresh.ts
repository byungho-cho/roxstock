import {collectionIdentity,CollectionExcluded,withCollection} from '@roxstock/shared/collection/collection-policy';
import {withFinancialLease} from '@roxstock/shared/collection/financial-lease';
import {collectionClient} from '@roxstock/shared/lib/collection-client';
import {validateDartFiling,requireDartReportPeriod} from './dart-filing-validation.js';
import {processIndependentRefresh,expireManualRun,type ManualTaskResult} from './manual-refresh-jobs.js';
import {recordDartFailure} from '@roxstock/shared/collection/dart-diagnostics';
import { refreshManualAnnual } from './manual-annual-prototype.js';
import { NaverAnnualProvider } from './naver-annual.js';
import { collectAnnualConsensus, freezePastEstimates } from './annual-consensus.js';
import { supplementSafely } from './valuation-supplement.js';
import { loadPeriodSupplement } from './valuation-supplement.js';
import { randomUUID } from 'node:crypto';
import type { PrismaClient, Prisma } from '@roxstock/shared/prisma';
import { ApiError } from '@roxstock/shared/lib/api-error';
import { getSeoulClock } from '@roxstock/shared/collection/time';
import { PrismaDartRepository } from './dart-repository.js';
import { DartApiError, OpenDartProvider, normalizeDartFinancialRows, type DartPeriodType, type DartReportCode } from './dart-provider.js';
import { getCfsThenOfs, type DartCollectorConfig } from './dart-collector.js';

import {manualReports,type ManualRefreshMetadata} from '@roxstock/shared/collection/manual-requests';
export {manualReports,parseManualRefresh,enqueueManualRefresh,type ManualRefreshMetadata} from '@roxstock/shared/collection/manual-requests';
/** Durable requests are consumed by the existing worker; interrupted runs resume under the shared DB lock. */
export async function processManualRefresh(db: PrismaClient, config: Pick<DartCollectorConfig,'enabled'|'apiKey'|'dailyCallLimit'|'minDelayMs'>) {
  db=collectionClient(db);
  const run = await db.collectorRun.findFirst({ where: { jobType: 'dart-financial-statements', status: 'RUNNING', metadata: { path: '$.phase', equals: 'MANUAL' } }, orderBy: [{ startedAt: 'asc' },{id:'asc'}] });
  if (!run) return false;
  const turn=await db.valuationSupplementScan?.findUnique({where:{id:1},select:{automaticTurnUntil:true,heartbeatAt:true}});
  if((run.metadata as unknown as ManualRefreshMetadata).manualState==='QUEUED'&&turn?.automaticTurnUntil&&turn.automaticTurnUntil>new Date()&&turn.heartbeatAt&&Date.now()-turn.heartbeatAt.getTime()<90_000)return true;
  if((run.metadata as unknown as ManualRefreshMetadata).executionMode==='MANUAL_PROTOTYPE')return processIndependentRefresh(db,config,run);
  const repo = new PrismaDartRepository(db);
  const owner = randomUUID();
  if (!await repo.acquireLock(owner, 900)) return true;
  let fresh;
  try { fresh = await db.collectorRun.findUnique({ where: { id: run.id } }); }
  catch (error) { await repo.releaseLock(owner); throw error; }
  if (fresh?.status !== 'RUNNING') { await repo.releaseLock(owner); return true; }
  const metadata = fresh.metadata as unknown as ManualRefreshMetadata;
  metadata.lockOwner=owner;
  const results: NonNullable<ManualRefreshMetadata['results']> = [];
  const startYear=metadata.startYear??metadata.fiscalYear, endYear=metadata.endYear??metadata.fiscalYear;
  const prototype=metadata.executionMode==='MANUAL_PROTOTYPE';
  const periods = metadata.period === 'ALL' ? (prototype?['ANNUAL','Q1','Q2','Q3']:Object.keys(manualReports)) as DartPeriodType[] : [metadata.period];
  const naver=new NaverAnnualProvider();
  const publish = async (currentYear:number, stage:NonNullable<ManualRefreshMetadata['progress']>['stage'], currentPeriod?:DartPeriodType) => {
    metadata.progress={currentYear,currentPeriod,stage,completed:results.length,total:periods.length*(endYear-startYear+1)};
    await db.collectorRun.update({where:{id:run.id},data:{metadata:{...metadata,manualState:'PROCESSING',results:[...results]} as unknown as Prisma.InputJsonValue}});
  };
  return withFinancialLease(owner,async()=>{try {
    if (!config.enabled || !config.apiKey) throw new DartApiError('API_KEY_MISSING', 'DART 수집 설정을 확인해 주세요.');
    await db.collectorRun.update({ where: { id: run.id }, data: { metadata: { ...metadata, manualState: 'PROCESSING' } as unknown as Prisma.InputJsonValue } });
    const provider = new OpenDartProvider({ apiKey: config.apiKey, dailyCallLimit: config.dailyCallLimit, minDelayMs: config.minDelayMs,
      reserveCall: (limit) => repo.reserveApiCall(limit, new Date(), owner),
      onApiStatus: (code) => repo.recordApiResult(code === '013' ? 'NO_DATA' : 'ERROR') });
    const securityId = BigInt(metadata.securityId);
    const security = await db.security.findUnique({ where: { id: securityId }, include: { dartCorpMapping: true } });
    if (!security?.isActive || security.securityType !== 'STOCK') throw new DartApiError('SECURITY_NOT_FOUND', '수집 대상 종목을 확인해 주세요.');
    await withCollection(db,securityId,'dart-financial-statements',async()=>{
    if(!metadata.symbol&&security.codeRevision>0)throw new CollectionExcluded('요청 시점의 종목코드를 확인할 수 없어 수집에서 제외','IDENTITY');
    metadata.symbol??=security.symbol;metadata.collectionRevision??=security.collectionRevision;
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
        if(prototype&&period==='ANNUAL'&&fiscalYear===Number(getSeoulClock().dateKey.slice(0,4))){
          await publish(fiscalYear,'VALUATION',period);
          results.push(await refreshManualAnnual(db,{...security,dartCorpMapping:mapping},fiscalYear,provider,naver,repo,run.id));continue;
        }
        if(!mapping)throw new DartApiError('DART_CORP_CODE_NOT_MAPPED','DART 기업코드가 연결되지 않은 종목입니다.');
        reports??=await provider.listPeriodicReports(mapping.corpCode,fiscalYear);
        const report = reports.find((r) => r.reportCode === manualReports[period] && !r.withdrawn);
        if (!report) { results.push({ fiscalYear, period, status: 'NO_DATA', code: 'NO_PERIODIC_FILING' }); continue; }
        requireDartReportPeriod(report,mapping.corpCode,fiscalYear);
        const stored=await db.dartFinancialFiling.findUnique({where:{receiptNo:report.receiptNo},select:{securityId:true,fiscalYear:true,periodType:true,isWithdrawn:true,normalizationVersion:true}});
        if(stored&&!stored.isWithdrawn&&stored.normalizationVersion>=3&&stored.securityId===securityId&&stored.fiscalYear===fiscalYear&&stored.periodType===period){await publish(fiscalYear,'VALUATION',period);const metric=await supplementSafely(db,securityId,fiscalYear,period,loadPeriodSupplement(provider,security.symbol,mapping.corpCode,undefined,security.marketType));results.push({fiscalYear,period,status:'SUCCESS',created:false,valuationStatus:metric?.status,valuationErrors:metric&&'supplemental'in metric?(metric.supplemental as {errors?:Record<string,string>}|null)?.errors:undefined,valuationReasons:metric&&'reasons'in metric?metric.reasons as Record<string,string>:undefined});continue;}
        const filing = await getCfsThenOfs(provider, mapping.corpCode, fiscalYear, manualReports[period]);
        if (!filing.rows.length) { results.push({ fiscalYear, period, status: 'NO_DATA', code: 'FINANCIAL_ROWS_NOT_PUBLISHED' }); continue; }
        const source=validateDartFiling({corpCode:mapping.corpCode,taskFiscalYear:fiscalYear,report,rows:filing.rows,fsDivision:filing.division});
        const saved = await repo.saveFiling({ securityId, fiscalYear: fiscalYear, periodType: period, reportCode: manualReports[period], fsDivision: filing.division,
          ...source, collectedAt: new Date(), values: normalizeDartFinancialRows(filing.rows) });
        await publish(fiscalYear,'VALUATION',period);
        const metric=await supplementSafely(db,securityId,fiscalYear,period,loadPeriodSupplement(provider,security.symbol,mapping.corpCode,undefined,security.marketType));
        results.push({ fiscalYear, period, status: 'SUCCESS', created: saved.created,valuationStatus:metric?.status,valuationErrors:metric&&'supplemental'in metric?(metric.supplemental as {errors?:Record<string,string>}|null)?.errors:undefined,valuationReasons:metric&&'reasons'in metric?metric.reasons as Record<string,string>:undefined });
      } catch (error) {
        if(error instanceof CollectionExcluded)throw error;
        results.push({ fiscalYear, period, status: 'FAILED', code: (await recordDartFailure(error,metadata.progress?.stage??'MANUAL_REFRESH',run.id,[])).code });
        if (!prototype && error instanceof DartApiError && (error.quotaExceeded || ['010', '011', '012', 'API_KEY_MISSING'].includes(error.code))) {
          throw error;
        }
      } finally { await publish(fiscalYear,'REPORT_DONE',period); }
    }
    }
    },metadata);
  } catch (error) {
    const code = error instanceof CollectionExcluded?'COLLECTION_EXCLUDED':(await recordDartFailure(error,metadata.progress?.stage??'MANUAL_REFRESH',run.id,[])).code;
    for(let fiscalYear=startYear;fiscalYear<=endYear;fiscalYear++)for(const period of periods)if(!results.some(r=>r.fiscalYear===fiscalYear&&r.period===period))results.push({fiscalYear,period,status:error instanceof CollectionExcluded?'SKIPPED':'FAILED',code});
  } finally {
    try {
      if(metadata.progress)metadata.progress={...metadata.progress,completed:results.length};
      const success = results.filter((r) => r.status === 'SUCCESS').length;
      const failed = results.filter((r) => r.status === 'FAILED').length;
      const valuationIncomplete=results.some(r=>r.status==='SUCCESS'&&r.valuationStatus!=='SUCCESS');
      const skipped = results.filter((r) => r.status === 'NO_DATA'||r.status==='SKIPPED').length;
      for (const result of results) await db.collectorRunItem.create({ data: { runId: run.id, securityId: BigInt(metadata.securityId), symbol: `${metadata.symbol??'CODE_UNKNOWN'}:${result.fiscalYear}:${result.period}`, status: result.status, message: result.code ?? (result.created ? '신규 판본 저장' : '기존 판본 확인') } });
      await repo.finishRun(run.id, failed ? success || skipped ? 'PARTIAL' : 'FAILED' : skipped === periods.length*(endYear-startYear+1) ? 'SKIPPED' : valuationIncomplete || skipped ? 'PARTIAL' : 'SUCCESS', { success, failed, skipped }, failed ? results.find((r) => r.status === 'FAILED')?.code : undefined, { ...metadata, manualState: 'FINISHED', results });
    } catch(error) { await recordDartFailure(error,'RUN_FINISH',run.id,[]); }
    finally { try{await repo.releaseLock(owner);}catch(error){await recordDartFailure(error,'LOCK_RELEASE',run.id,[]);} }
  }
  return true;});
}
