import {dartProgress,missingDartReport} from '@roxstock/shared/collection/dart-task-status';
import {dartTaskScope,dartAutomaticWork} from '@roxstock/shared/collection/dart-backfill';
import {financialCurrency} from '@roxstock/shared/domain/financial-currency';
import {publicAnnualTarget} from './dart-public-source.js';
import {CollectionJobRepository} from '@roxstock/shared/collection/job-repository';
import {eligibleWhere,withoutCollection} from '@roxstock/shared/collection/collection-policy';
import { normalizeProviderSymbol, isSecuritySymbol } from '@roxstock/shared/domain/security-symbol';
import type {DartSourceValidation} from './dart-filing-validation.js';
import {storedDartCode} from '@roxstock/shared/collection/dart-diagnostics';
import {upgradeCachedPeriod, DartApiError, validateDartCorporations} from './dart-provider.js';
import { Prisma, PrismaClient } from '@roxstock/shared/prisma';
import { getSeoulClock, toDatabaseDate } from '@roxstock/shared/collection/time';
import type { DartCorporation, DartFinancialValues, DartPeriodType, DartReport, DartReportCode } from './dart-provider.js';

const REPORTS: Array<{ reportCode: DartReportCode; periodType: DartPeriodType }> = [
  { reportCode: '11013', periodType: 'Q1' },
  { reportCode: '11012', periodType: 'Q2' },
  { reportCode: '11014', periodType: 'Q3' },
  { reportCode: '11011', periodType: 'ANNUAL' },
];

export interface DartBackfillTaskRecord {
  diagnostics?:Prisma.JsonValue;
  errorCode?:string|null;
  id: bigint;
  securityId: bigint;
  fiscalYear: number;
  reportCode: DartReportCode;
  periodType: DartPeriodType;
  attempts: number;
}

export interface DartSecurityRecord { id: bigint; symbol: string; securityType: string; marketType?: string; collectionRevision?:number; corpCode: string | null; }

export class PrismaDartRepository extends CollectionJobRepository {





  async getState() {
    return this.prisma.dartCollectorState.findUnique({ where: { id: 1 } });
  }

  async setState(update: { phase?: string; backfillStartYear?: number; backfillEndYear?: number | null; backfillInitializedAt?: Date | null; corpCodeSyncedAt?: Date | null; backfillCompletedAt?: Date | null; phase2StartedAt?: Date | null; lastRunAt?: Date | null; lastError?: string | null }) {
    return this.prisma.dartCollectorState.upsert({
      where: { id: 1 },
      create: { id: 1, phase: update.phase ?? 'BACKFILL', backfillStartYear: update.backfillStartYear ?? 2015, ...update },
      update,
    });
  }

  async corpCodeMappingsSyncedAt(): Promise<Date | null> {
    // An empty mapping table is never a usable fresh cache, even if an old sync timestamp remains.
    if (await this.prisma.dartCorpMapping.count() === 0) return null;
    const state = await this.prisma.dartCollectorState.findUnique({ where: { id: 1 }, select: { corpCodeSyncedAt: true } });
    if (state?.corpCodeSyncedAt) return state.corpCodeSyncedAt;
    const latest = await this.prisma.dartCorpMapping.findFirst({ orderBy: { syncedAt: 'desc' }, select: { syncedAt: true } });
    return latest?.syncedAt ?? null;
  }

  async syncCorporations(corporations: DartCorporation[], syncedAt = new Date()): Promise<{ matched: number; unmatched: number; ambiguous: number }> {
    validateDartCorporations(corporations);
    const securities = await this.prisma.security.findMany({
      where: { ...eligibleWhere('dart-financial-statements'),securityType:'STOCK' }, select: { id: true, symbol: true },
    });
    const bySymbol = new Map(securities.map((item) => [normalizeProviderSymbol(item.symbol), item.id]));
    const corpBySymbol = new Map<string, DartCorporation[]>();
    for (const corp of corporations) {
      if (!isSecuritySymbol(corp.stockCode)) continue;
      corpBySymbol.set(corp.stockCode, [...(corpBySymbol.get(corp.stockCode) ?? []), corp]);
    }
    const candidates = [...corpBySymbol.entries()].filter(([, entries]) => entries.length === 1);
    const ambiguous = [...corpBySymbol.values()].filter((entries) => entries.length > 1).length;
    const mapped = candidates.flatMap(([symbol, entries]) => {
      const corp = entries[0]!;
      const securityId = bySymbol.get(symbol);
      return securityId === undefined ? [] : [{ securityId, collectionSymbol:symbol, corpCode: corp.corpCode, stockCode: symbol, corpName: corp.corpName, sourceModifiedAt: corp.modifiedDate || null, syncedAt }];
    });
    if (!mapped.length || ambiguous) throw new DartApiError(ambiguous?'CORP_MAPPING_AMBIGUOUS':'CORP_MAPPING_EMPTY','Corporate mapping validation failed.');
    await withoutCollection(()=>this.prisma.$transaction(async tx=>{
      // Lock current master identities; a late universe response cannot attach an old code mapping.
      const current=await tx.$queryRaw<Array<{id:bigint;symbol:string;collection_excluded:number;excluded_features:string|null}>>`SELECT id,symbol,collection_excluded,excluded_features FROM securities WHERE id IN (${Prisma.join(mapped.map(m=>m.securityId))}) FOR UPDATE`;
      const byId=new Map(current.map(s=>[String(s.id),s]));
      const accepted=mapped.filter(m=>{const s=byId.get(String(m.securityId));const features=typeof s?.excluded_features==='string'?JSON.parse(s.excluded_features):s?.excluded_features;return s?.symbol===m.stockCode&&!s.collection_excluded&&!s.symbol.toUpperCase().startsWith('Z99')&&!(Array.isArray(features)&&features.includes('dart-financial-statements'));});
      for(const mapping of accepted)await tx.dartCorpMapping.upsert({where:{securityId:mapping.securityId},create:mapping,update:mapping});
      await tx.dartCollectorState.upsert({where:{id:1},create:{id:1,phase:'BACKFILL',backfillStartYear:2015,corpCodeSyncedAt:syncedAt},update:{corpCodeSyncedAt:syncedAt}});
    },{timeout:60000}));
    return { matched: mapped.length, unmatched: securities.length - mapped.length, ambiguous };
  }

  async ensureBackfillPlan(startYear: number, endYear: number, initializedAt = new Date()): Promise<void> {
    startYear=Math.max(2015,startYear);
    const existing = await this.getState();
    const extendsPlan=!!existing?.backfillInitializedAt && (existing.backfillEndYear??endYear)<endYear;
    const historicalPlanActive = !existing?.backfillCompletedAt || extendsPlan;
    if (!existing?.backfillInitializedAt) await this.setState({ phase: 'BACKFILL', backfillStartYear: startYear, backfillEndYear: endYear });
    const priorityIds=await this.prioritySecurityIds();
    const securities = await this.prisma.security.findMany({ where: {...eligibleWhere('dart-financial-statements'),OR:[{isActive:true},{id:{in:priorityIds}}]}, select: { id: true } });
    const known = await this.prisma.dartSecurityState.findMany({ select: { securityId: true } });
    const knownIds = new Set(known.map((item) => item.securityId.toString()));
    const missingSecurities = securities.filter(({ id }) => !knownIds.has(id.toString()));
    for (let i = 0; i < missingSecurities.length; i += 500) {
      const slice = missingSecurities.slice(i, i + 500);
      await this.prisma.dartSecurityState.createMany({ data: slice.map(({ id }) => ({ securityId: id })), skipDuplicates: true });
      const tasks = historicalPlanActive ? slice.flatMap(({ id }) => {
        const result: Array<{ securityId: bigint; fiscalYear: number; reportCode: DartReportCode; periodType: DartPeriodType }> = [];
        for (let year = existing?.backfillEndYear ?? endYear; year >= Math.max(2015,existing?.backfillStartYear ?? startYear); year -= 1) {
          for (const report of REPORTS.filter(report=>year>=2020||report.periodType==='ANNUAL')) result.push({ securityId: id, fiscalYear: year, ...report });
        }
        return result;
      }) : [];
      for (let j = 0; j < tasks.length; j += 1000) {
        await this.prisma.dartBackfillTask.createMany({ data: tasks.slice(j, j + 1000), skipDuplicates: true });
      }
    }
    if(extendsPlan){
      // Idempotent extension: never reset completed historical report tasks.
      for(let i=0;i<securities.length;i+=200){const slice=securities.slice(i,i+200);const tasks=slice.flatMap(({id})=>Array.from({length:endYear-existing!.backfillEndYear!},(_,j)=>existing!.backfillEndYear!+1+j).flatMap(fiscalYear=>REPORTS.filter(report=>fiscalYear>=2020||report.periodType==='ANNUAL').map(report=>({securityId:id,fiscalYear,...report}))));
        await this.prisma.dartBackfillTask.createMany({data:tasks,skipDuplicates:true});
        await this.prisma.dartSecurityState.updateMany({where:{securityId:{in:slice.map(s=>s.id)}},data:{backfillCompletedAt:null}});
      }
      await this.setState({phase:'BACKFILL',backfillEndYear:endYear,backfillCompletedAt:null});
    }
    if (!existing?.backfillInitializedAt) await this.setState({ phase: 'BACKFILL', backfillStartYear: startYear, backfillEndYear: endYear, backfillInitializedAt: initializedAt, lastError: null });
    if (historicalPlanActive) await this.prisma.dartBackfillTask.updateMany({ where: { status: 'PENDING', securityId:{notIn:priorityIds}, security: { isActive: false } }, data: { status: 'NOT_APPLICABLE', processedAt: initializedAt, errorCode: 'SECURITY_INACTIVE', errorMessage: 'Security became inactive before its backfill was started.' } });
  }

  async missingReportDecision(securityId:bigint,year:number,period:DartPeriodType,reports:DartReport[],now=new Date()) {
    const months=[...new Set(reports.filter(r=>r.selection?.version===2&&!r.selection.periodError).map(r=>r.selection?.fiscalYearEndMonth).filter((m):m is number=>!!m))];
    let month=months.length===1?months[0]!:null;
    let evidence='validated disclosure selection';
    if(!month){
      const annuals=await this.prisma.dartFinancialFiling.findMany({where:{securityId,periodType:'ANNUAL',isWithdrawn:false,normalizationVersion:{gte:3},sourceValidation:{path:'$.version',equals:2},fiscalYear:{lte:year}},select:{periodEndDate:true},orderBy:{periodEndDate:'desc'},take:2});
      const stored=[...new Set(annuals.map(r=>r.periodEndDate.getUTCMonth()+1))];
      if(annuals.length&&stored.length===1){month=stored[0]!;evidence='stored validated annual period ends';}
    }
    return missingDartReport({now,year,period,closingMonth:month,monthEvidence:evidence});
  }

  /** Indexed, bounded page. Global financial lease serializes this with collection/manual work. */
  async reactivateDueTasks(now=new Date(),limit=100) {
    const tasks=await this.prisma.dartBackfillTask.findMany({where:{...dartTaskScope(now),OR:[{status:{in:['NOT_DUE','NO_FILING']}},{status:'FAILED',errorCode:'REVIEW_REQUIRED',diagnostics:{path:'$.reason',equals:'SUBMISSION_DEADLINE_UNVERIFIED'}}],nextAttemptAt:{lte:now}},orderBy:[{nextAttemptAt:'asc'},{id:'asc'}],take:limit});
    let changed=0;
    for(const task of tasks){
      const count=await this.prisma.$transaction(async tx=>{
        const result=await tx.dartBackfillTask.updateMany({where:{id:task.id,status:task.status,updatedAt:task.updatedAt,nextAttemptAt:{lte:now}},data:{status:'PENDING',processedAt:null}});
        if(result.count){await tx.dartTaskDecision.create({data:{taskId:task.id,reason:'SCHEDULED_RECHECK',previous:taskSnapshot(task),next:{status:'PENDING',checkedAt:now.toISOString()}}});
          await tx.dartSecurityState.updateMany({where:{securityId:task.securityId},data:{backfillCompletedAt:null}});}
        return result.count;
      });changed+=count;
    }
    if(changed)await this.setState({phase:'BACKFILL',backfillCompletedAt:null});
    return changed;
  }

  async recoverMappedTasks(now=new Date(),limit=100) {
    const tasks=await this.prisma.dartBackfillTask.findMany({where:{status:'NOT_APPLICABLE',errorCode:'DART_CORP_CODE_NOT_MAPPED',security:{...eligibleWhere('dart-financial-statements'),securityType:'STOCK',dartCorpMapping:{isNot:null}}},orderBy:{id:'asc'},take:limit,include:{security:{include:{dartCorpMapping:true}}}});
    let changed=0;
    for(const task of tasks){
      const security=task.security,mapping=security.dartCorpMapping;
      if(!mapping||!/^\d{8}$/.test(mapping.corpCode)||mapping.stockCode!==security.symbol||mapping.collectionSymbol!==security.symbol)continue;
      const count=await this.prisma.$transaction(async tx=>{
        const result=await tx.dartBackfillTask.updateMany({where:{id:task.id,status:'NOT_APPLICABLE',errorCode:'DART_CORP_CODE_NOT_MAPPED',updatedAt:task.updatedAt,security:{...eligibleWhere('dart-financial-statements'),securityType:'STOCK',symbol:mapping.stockCode,dartCorpMapping:{is:{corpCode:mapping.corpCode,stockCode:mapping.stockCode,collectionSymbol:mapping.stockCode}}}},data:{status:'PENDING',processedAt:null,nextAttemptAt:now}});
        if(result.count){await tx.dartTaskDecision.create({data:{taskId:task.id,reason:'EXACT_MAPPING_RECOVERED',previous:taskSnapshot(task),next:{status:'PENDING',corpCode:mapping.corpCode,stockCode:mapping.stockCode,checkedAt:now.toISOString()}}});
          await tx.dartSecurityState.updateMany({where:{securityId:task.securityId},data:{backfillCompletedAt:null}});}
        return result.count;
      });changed+=count;
    }
    if(changed)await this.setState({phase:'BACKFILL',backfillCompletedAt:null});
    return changed;
  }

  async resetInterruptedTasks(): Promise<number> {
    const result = await this.prisma.dartBackfillTask.updateMany({ where: { status: 'PROCESSING' }, data: { status: 'PENDING', errorCode: 'PROCESS_RESTARTED', errorMessage: 'The previous collector process stopped before completing this report.' } });
    return result.count;
  }



  async cachedReports(corpCode: string, fiscalYear: number, load: () => Promise<DartReport[]>, force = false): Promise<DartReport[]> {
    const now = new Date();
    const cached = await this.prisma.dartReportCache.findUnique({where:{corpCode_fiscalYear:{corpCode,fiscalYear}}});
    if (!force && cached && cached.expiresAt > now && Array.isArray(cached.reports) && cached.reports.every(r=>r && typeof r==='object' && !Array.isArray(r) && (r.selection as {version?:number;yearMapping?:string}|undefined)?.version===2 && (r.selection as {yearMapping?:string}|undefined)?.yearMapping==='CALENDAR_REPORT_YEAR')) return (cached.reports as unknown as DartReport[]).map(upgradeCachedPeriod);
    const reports = await load();
    await this.prisma.dartReportCache.upsert({where:{corpCode_fiscalYear:{corpCode,fiscalYear}},create:{corpCode,fiscalYear,reports:reports as unknown as Prisma.InputJsonValue,expiresAt:new Date(now.getTime()+86400000)},update:{reports:reports as unknown as Prisma.InputJsonValue,expiresAt:new Date(now.getTime()+86400000)}});
    return reports;
  }

  async startUpToDailyCompanyLimit(limit: number, now = new Date(), priorityOnly = false): Promise<void> {
    const day = new Date(`${getSeoulClock(now).dateKey}T00:00:00+09:00`);
    const alreadyStartedToday = await this.prisma.dartSecurityState.count({ where: { backfillStartedAt: { gte: day, lt: new Date(day.getTime() + 86_400_000) } } });
    const slots = Math.max(0, limit - alreadyStartedToday);
    const candidates = await this.prisma.dartSecurityState.findMany({
      where: { backfillStartedAt: null, backfillCompletedAt: null, security: { ...eligibleWhere('dart-financial-statements'), isActive: true, securityType: 'STOCK', dartCorpMapping: { isNot: null } } },
      select: { securityId: true }, orderBy: { securityId: 'asc' },
    });
    const priority = await this.prioritySecurityIds();
    const rank = new Map(priority.map((id,index)=>[id,index]));
    const urgent = candidates.filter(item => rank.has(item.securityId)).sort((a,b)=>rank.get(a.securityId)!-rank.get(b.securityId)!);
    const regular = priorityOnly ? [] : candidates.filter(item => !rank.has(item.securityId)).slice(0,Math.max(0,slots-urgent.length));
    const chosen = [...urgent,...regular];
    if (!chosen.length) return;
    await this.prisma.dartSecurityState.updateMany({ where: { securityId: { in: chosen.map((x) => x.securityId) }, backfillStartedAt: null }, data: { backfillStartedAt: now, lastError: null } });
  }

  async listStartedBackfillSecurities(now = new Date()): Promise<DartSecurityRecord[]> {
    const states = await this.prisma.dartSecurityState.findMany({
      where: { backfillStartedAt: { not: null }, backfillCompletedAt: null,
        security: { ...eligibleWhere('dart-financial-statements'), isActive: true, dartBackfillTasks: { some: { AND:[dartAutomaticWork(now),{OR:[{status:{in:['PENDING','PROCESSING']}},{nextAttemptAt:null},{nextAttemptAt:{lte:now}}]}] } } } },
      select: { securityId: true, security: { select: { collectionRevision:true,symbol: true, marketType: true, securityType: true, dartCorpMapping: { select: { corpCode: true } } } } },
      orderBy: { backfillStartedAt: 'asc' },
    });
    return states.map((item) => ({ id: item.securityId, symbol: item.security.symbol,collectionRevision:item.security.collectionRevision, marketType: item.security.marketType, securityType: item.security.securityType, corpCode: item.security.dartCorpMapping?.corpCode ?? null }));
  }

  async listTasksForSecurity(securityId: bigint, now = new Date()): Promise<DartBackfillTaskRecord[]> {
    const tasks = await this.prisma.dartBackfillTask.findMany({
      where: { securityId, fiscalYear:{gte:2015,lte:Number(getSeoulClock(now).dateKey.slice(0,4))}, AND:[{OR:[{periodType:'ANNUAL'},{fiscalYear:{gte:2020}}]}], OR: [{status:{in:['NOT_DUE','NO_FILING']},nextAttemptAt:{lte:now}},{ status: 'PENDING' }, { status: 'PROCESSING' }, { status: 'FAILED', AND: [{ OR: [{errorCode:null},{errorCode:{not:'REVIEW_REQUIRED'}},{diagnostics:{path:'$.validationResult',equals:'CLOSING_MONTH_CHANGED'}},{diagnostics:{path:'$.validationResult',equals:'NON_KRW_STORAGE_UNSUPPORTED'}}] }], OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }] },
      select: { id: true, securityId: true, fiscalYear: true, reportCode: true, periodType: true, attempts: true, errorCode:true,diagnostics:true },
      take:100,
      orderBy: [{ fiscalYear: 'desc' }, { reportCode: 'asc' }],
    });
    const eligible:DartBackfillTaskRecord[]=[];
    for(const task of tasks){if(task.errorCode!=='REVIEW_REQUIRED'||(task.diagnostics as {validationResult?:string}|null)?.validationResult==='NON_KRW_STORAGE_UNSUPPORTED')eligible.push(task as DartBackfillTaskRecord);else{const reviewed=await this.reviewCalendarTask(task as DartBackfillTaskRecord,now);if(reviewed)eligible.push(reviewed);}}
    return eligible;
  }

  async calendarReviewPage(securityId?:bigint){
    return this.prisma.dartBackfillTask.findMany({where:{...(securityId?{securityId}:{}),status:'FAILED',errorCode:'REVIEW_REQUIRED',security:{...eligibleWhere('dart-financial-statements'),isActive:true},AND:[{OR:['CLOSING_MONTH_CHANGED','MULTIPLE_ANNUAL_PERIODS','CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION'].map(reason=>({diagnostics:{path:'$.validationResult',equals:reason}}))},{OR:[{diagnostics:{path:'$.periodSelectionPolicy',equals:Prisma.AnyNull}},{NOT:{diagnostics:{path:'$.periodSelectionPolicy',equals:'year-history-v1'}}}]}]},select:{id:true,securityId:true,fiscalYear:true,reportCode:true,periodType:true,attempts:true,errorCode:true,diagnostics:true},orderBy:{id:'asc'},take:10}) as Promise<DartBackfillTaskRecord[]>;
  }

  async reviewCalendarTask(task:DartBackfillTaskRecord,now=new Date()):Promise<DartBackfillTaskRecord|undefined>{
      const d=task.diagnostics as {validationResult?:string}|null;
      if(!d?.validationResult||!['CLOSING_MONTH_CHANGED','MULTIPLE_ANNUAL_PERIODS','CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION'].includes(d.validationResult))return undefined;
      const mapping=await this.prisma.dartCorpMapping.findUnique({where:{securityId:task.securityId}});
      const cache=mapping?await this.prisma.dartReportCache.findUnique({where:{corpCode_fiscalYear:{corpCode:mapping.corpCode,fiscalYear:task.fiscalYear}}}):null;
      const reports=Array.isArray(cache?.reports)?cache.reports as unknown as DartReport[]:[];
      const prior=reports.find(r=>r.reportCode===task.reportCode),revised=prior?(publicAnnualTarget(prior,mapping!.corpCode,task.fiscalYear)??upgradeCachedPeriod(prior)):undefined;
      if(!revised||revised===prior||revised.selection?.periodError){await this.prisma.dartBackfillTask.updateMany({where:{id:task.id,status:'FAILED',errorCode:'REVIEW_REQUIRED',attempts:task.attempts},data:{diagnostics:{...d,periodSelectionPolicy:'year-history-v1'}}});return undefined;}
      const stored=await this.prisma.dartFinancialFiling.findFirst({where:{securityId:task.securityId,fiscalYear:task.fiscalYear,periodType:task.periodType,isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}]});
      const proof=stored?.sourceValidation as Record<string,unknown>|null;
      const reused=!!stored&&stored.source==='OPEN_DART'&&stored.normalizationVersion>=3&&proof?.version===2&&proof?.taskFiscalYear===task.fiscalYear&&proof?.apiFiscalYear===task.fiscalYear&&proof?.reportCode===task.reportCode&&proof?.fsDivision===stored.fsDivision&&proof?.returnedReceiptNo===stored.receiptNo&&stored.receiptNo===revised.receiptNo&&stored.periodEndDate.toISOString().slice(0,10)===revised.selection?.periodEndDate&&proof?.corpCode===mapping?.corpCode&&proof?.currency==='KRW'&&proof?.relationship==='EXACT'&&proof?.selectedReceiptNo===stored.receiptNo;
      const changed=await this.prisma.dartBackfillTask.updateMany({where:{id:task.id,status:'FAILED',errorCode:'REVIEW_REQUIRED',attempts:task.attempts},data:{status:reused?'SUCCESS':'PENDING',...(reused?{processedAt:now,selectedReceiptNo:stored!.receiptNo}:{}),errorCode:null,errorMessage:null,nextAttemptAt:null,diagnostics:{...d,previousValidationResult:d.validationResult!,periodSelectionPolicy:'year-history-v1',requeuedAt:now.toISOString(),existingVerifiedSourceReused:reused}}});
      if(changed.count&&!reused){await this.prisma.dartSecurityState.updateMany({where:{securityId:task.securityId},data:{backfillCompletedAt:null}});await this.prisma.dartCollectorState.updateMany({where:{id:1},data:{phase:'BACKFILL',backfillCompletedAt:null}});return {...task,errorCode:null} as DartBackfillTaskRecord;}return undefined;
  }

  async markCompanyChecked(securityId: bigint, phase: string, now = new Date()): Promise<void> {
    const usageDate = toDatabaseDate(getSeoulClock(now).dateKey);
    const result = await this.prisma.dartDailyCompanyCheck.createMany({ data: [{ usageDate, securityId, phase, checkedAt: now }], skipDuplicates: true });
    if (result.count) {
      await this.prisma.dartApiDailyUsage.upsert({ where: { usageDate }, create: { usageDate, companyCheckCount: 1 }, update: { companyCheckCount: { increment: 1 } } });
    }
  }

  async reserveApiCall(limit: number, now = new Date(), owner?: string): Promise<boolean> {
    if (owner) await this.renewFinancialLease(owner);
    const usageDate = toDatabaseDate(getSeoulClock(now).dateKey);
    await this.prisma.$executeRaw`INSERT IGNORE INTO dart_api_daily_usage (usage_date,api_call_count,company_check_count,error_count,no_data_count,updated_at) VALUES (${usageDate},0,0,0,0,UTC_TIMESTAMP(3))`;
    // A no-op upsert can return a positive matched-row count with CLIENT_FOUND_ROWS.
    // Put the budget condition in WHERE so an exhausted day cannot reserve a call.
    const changed=await this.prisma.$executeRaw`UPDATE dart_api_daily_usage SET api_call_count=api_call_count+1,updated_at=UTC_TIMESTAMP(3) WHERE usage_date=${usageDate} AND api_call_count<${limit}`;
    if(changed>0)await this.prisma.$executeRaw`INSERT INTO dart_collector_state (id,phase,backfill_start_year,last_run_at,last_error,updated_at) VALUES (1,'BACKFILL',2015,${now},NULL,UTC_TIMESTAMP(3)) ON DUPLICATE KEY UPDATE last_run_at=VALUES(last_run_at),last_error=NULL,updated_at=UTC_TIMESTAMP(3)`;
    return changed > 0;
  }

  async recordApiResult(status: 'ERROR' | 'NO_DATA', now = new Date()): Promise<void> {
    const usageDate = toDatabaseDate(getSeoulClock(now).dateKey);
    const column = status === 'ERROR' ? 'errorCount' : 'noDataCount';
    await this.prisma.dartApiDailyUsage.upsert({ where: { usageDate }, create: { usageDate, [column]: 1 }, update: { [column]: { increment: 1 } } });
  }

  async getDailyUsage(now = new Date()) {
    return this.prisma.dartApiDailyUsage.findUnique({ where: { usageDate: toDatabaseDate(getSeoulClock(now).dateKey) } });
  }

  async updateTask(taskId: bigint, update: { status: 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'NO_FILING' | 'NOT_APPLICABLE' | 'FAILED' | 'NOT_DUE' | 'DATA_UNAVAILABLE' | 'EXCLUDED'; attempts?: number; selectedReceiptNo?: string | null; lastAttemptAt?: Date; nextAttemptAt?: Date | null; processedAt?: Date | null; errorCode?: string | null; errorMessage?: string | null; diagnostics?: Prisma.InputJsonValue }) {
    return this.prisma.$transaction(async tx=>{
      const previous=await tx.dartBackfillTask.findUniqueOrThrow({where:{id:taskId}});
      const next=await tx.dartBackfillTask.update({where:{id:taskId},data:{...update,...(update.errorCode?{errorCode:storedDartCode(update.errorCode)}:{})}});
      await tx.dartTaskDecision.create({data:{taskId,reason:update.errorCode??update.status,previous:taskSnapshot(previous),next:taskSnapshot(next)}});
      return next;
    });
  }

  async markTasks(securityId: bigint, fiscalYear: number, reportCode: string, status: 'NO_FILING' | 'NOT_APPLICABLE' | 'FAILED', now: Date, errorCode?: string, errorMessage?: string) {
    await this.prisma.dartBackfillTask.updateMany({
      where: { securityId, fiscalYear, reportCode, status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
      data: { status, attempts: { increment: status === 'FAILED' ? 1 : 0 }, processedAt: status === 'FAILED' ? null : now,
        lastAttemptAt: now, nextAttemptAt: status === 'FAILED' ? new Date(now.getTime() + 24 * 60 * 60_000) : null,
        errorCode: errorCode ? storedDartCode(errorCode) : null, errorMessage: errorMessage?.slice(0, 1000) ?? null },
    });
  }

  async saveFiling(input: {
    securityId: bigint; fiscalYear: number; periodType: DartPeriodType; reportCode: DartReportCode; fsDivision: 'CFS' | 'OFS';
    receiptNo: string; reportName: string; receiptDate: Date; periodEndDate: Date; collectedAt: Date; values: DartFinancialValues; sourceValidation: DartSourceValidation;
  }): Promise<{ created: boolean; supersedesReceiptNo: string | null }> {
    if(!/^[A-Z]{3}$/.test(input.sourceValidation.currency)||input.sourceValidation.returnedReceiptNo!==input.receiptNo||input.sourceValidation.fsDivision!==input.fsDivision)throw new DartApiError('DART_SOURCE_REVIEW','Invalid source identity.',false,false,{validationResult:'STORAGE_SOURCE_CONFLICT'});
    for(const [key,value]of Object.entries(input.values)){if(key==='accountSources'||value==null)continue;const [integer,fraction='']=String(value).replace(/^-/, '').split('.');if(!/^\d+(\.\d+)?$/.test(String(value).replace(/^-/,''))||integer!.replace(/^0+/,'').length>35||fraction.length>30)throw new DartApiError('DART_SOURCE_REVIEW','Amount cannot be stored exactly.',false,false,{validationResult:'AMOUNT_PRECISION_UNSUPPORTED'});}
    const current = await this.prisma.dartFinancialFiling.findUnique({ where: { receiptNo: input.receiptNo }, select: { id: true, securityId:true,fsDivision:true,fiscalYear:true,reportCode:true,periodType:true,periodEndDate:true,accountSources:true,sourceValidation:true,revenueQuarter:true,revenueYtd:true,operatingProfitQuarter:true,operatingProfitYtd:true,netIncomeQuarter:true,netIncomeYtd:true,totalAssets:true,totalLiabilities:true,totalEquity:true,operatingCashFlowQuarter:true,operatingCashFlowYtd:true,capitalExpenditureQuarter:true,capitalExpenditureYtd:true } });
    if (current) {
      if(financialCurrency(current)!==input.sourceValidation.currency)throw new DartApiError('DART_SOURCE_REVIEW','Existing currency is preserved.',false,false,{validationResult:'STORED_CURRENCY_CONFLICT'});
      if(current.securityId!==input.securityId||current.fsDivision!==input.fsDivision||current.fiscalYear!==input.fiscalYear||current.reportCode!==input.reportCode||current.periodType!==input.periodType||current.periodEndDate.toISOString().slice(0,10)!==input.periodEndDate.toISOString().slice(0,10))
        throw new DartApiError('STORED_FILING_CONFLICT','Existing filing identity/period is preserved for review.',false,false,{...input.sourceValidation,validationResult:'STORED_FILING_CONFLICT'});
      const existing=current.accountSources&&typeof current.accountSources==='object'&&!Array.isArray(current.accountSources)?current.accountSources:{};
      const additions=Object.fromEntries(Object.entries(input.values.accountSources).map(([key,incoming])=>{
        const old=existing[key] as Record<string,unknown>|undefined;
        if(!old)return [key,incoming];
        return [key,{...incoming,...old,amount:old.amount??incoming.amount,ytdAmount:old.ytdAmount??incoming.ytdAmount}];
      }));
      await this.prisma.dartFinancialFiling.update({where:{id:current.id},data:{...Object.fromEntries(Object.entries(input.values).filter(([key,value])=>key!=='accountSources'&&value!=null&&(current as Record<string,unknown>)[key]==null).map(([key,value])=>[key,new Prisma.Decimal(String(value))])),sourceValidation:{...input.sourceValidation,priorSelectedReceiptNos:[...new Set([...((current.sourceValidation as {priorSelectedReceiptNos?:string[]}|null)?.priorSelectedReceiptNos??[]),...(current.sourceValidation && (current.sourceValidation as {selectedReceiptNo?:string}).selectedReceiptNo!==input.sourceValidation.selectedReceiptNo?[(current.sourceValidation as {selectedReceiptNo:string}).selectedReceiptNo]:[])])].filter(n=>/^\d{14}$/.test(n))} as unknown as Prisma.InputJsonValue,normalizationVersion:3,accountSources:{...existing,...additions} as Prisma.InputJsonValue,collectedAt:input.collectedAt}});
      return { created: false, supersedesReceiptNo: null };
    }
    const previous = await this.prisma.dartFinancialFiling.findFirst({
      where: { securityId: input.securityId, fiscalYear: input.fiscalYear, reportCode: input.reportCode, fsDivision: input.fsDivision },
      orderBy: [{ receiptDate: 'desc' }, { collectedAt: 'desc' }], select: { receiptNo: true },
    });
    const values = input.values;
    try {
      await this.prisma.dartFinancialFiling.create({ data: {
        securityId: input.securityId, fiscalYear: input.fiscalYear, periodType: input.periodType, reportCode: input.reportCode,
        fsDivision: input.fsDivision, receiptNo: input.receiptNo, supersedesReceiptNo: previous?.receiptNo ?? null,
        reportName: input.reportName.slice(0, 300), receiptDate: input.receiptDate, periodEndDate: input.periodEndDate,
        sourceValidation:input.sourceValidation as unknown as Prisma.InputJsonValue,collectedAt: input.collectedAt, source: 'OPEN_DART', isWithdrawn: false, normalizationVersion:3,
        revenueQuarter: values.revenueQuarter === null ? null : new Prisma.Decimal(values.revenueQuarter),
        revenueYtd: values.revenueYtd === null ? null : new Prisma.Decimal(values.revenueYtd),
        operatingProfitQuarter: values.operatingProfitQuarter === null ? null : new Prisma.Decimal(values.operatingProfitQuarter),
        operatingProfitYtd: values.operatingProfitYtd === null ? null : new Prisma.Decimal(values.operatingProfitYtd),
        netIncomeQuarter: values.netIncomeQuarter === null ? null : new Prisma.Decimal(values.netIncomeQuarter),
        netIncomeYtd: values.netIncomeYtd === null ? null : new Prisma.Decimal(values.netIncomeYtd),
        totalAssets: values.totalAssets === null ? null : new Prisma.Decimal(values.totalAssets),
        totalLiabilities: values.totalLiabilities === null ? null : new Prisma.Decimal(values.totalLiabilities),
        totalEquity: values.totalEquity === null ? null : new Prisma.Decimal(values.totalEquity),
        operatingCashFlowQuarter: values.operatingCashFlowQuarter === null ? null : new Prisma.Decimal(values.operatingCashFlowQuarter),
        operatingCashFlowYtd: values.operatingCashFlowYtd === null ? null : new Prisma.Decimal(values.operatingCashFlowYtd),
        capitalExpenditureQuarter: values.capitalExpenditureQuarter === null ? null : new Prisma.Decimal(values.capitalExpenditureQuarter),
        capitalExpenditureYtd: values.capitalExpenditureYtd === null ? null : new Prisma.Decimal(values.capitalExpenditureYtd),
        accountSources: values.accountSources as Prisma.InputJsonValue,
      } });
    return { created: true, supersedesReceiptNo: previous?.receiptNo ?? null };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Resolve the winning row through the same identity guard, never report a foreign receipt as success.
        if(await this.prisma.dartFinancialFiling.findUnique({where:{receiptNo:input.receiptNo}}))return this.saveFiling(input);
      }
      throw error;
    }
  }

  async completeSecurityIfDone(securityId: bigint, now = new Date()): Promise<boolean> {
    const pending = await this.prisma.dartBackfillTask.count({ where: { ...dartAutomaticWork(now),securityId } });
    if (pending) return false;
    await this.prisma.dartSecurityState.update({ where: { securityId }, data: { backfillCompletedAt: now } });
    return true;
  }

  async isReviewHeld(securityId:bigint,fiscalYear:number,reportCode:string):Promise<boolean> {
    const task=await this.prisma.dartBackfillTask.findUnique({where:{securityId_fiscalYear_reportCode:{securityId,fiscalYear,reportCode}},select:{status:true,errorCode:true}});
    return task?.status==='FAILED'&&task.errorCode==='REVIEW_REQUIRED';
  }

  async markSecurityError(securityId: bigint, message: string): Promise<void> {
    await this.prisma.$transaction(tx=>tx.dartSecurityState.update({ where: { securityId }, data: { lastError: message.slice(0, 1000) } }));
  }

  async backfillProgress(now=new Date()) {
    const [total, rows, completeSecurities, activeSecurities] = await Promise.all([
      this.prisma.dartBackfillTask.count({where:dartTaskScope(now)}),
      this.prisma.dartBackfillTask.groupBy({ by: ['status','errorCode'],where:dartTaskScope(now), _count: { _all: true } }),
      this.prisma.dartSecurityState.count({ where: { backfillCompletedAt: { not: null } } }),
      this.prisma.security.count({ where: { isActive: true } }),
    ]);
    const progress=dartProgress(rows),counts=progress.byStatus;
    return { ...progress,totalReports: progress.currentTarget, processedReports: progress.completed, success: counts.SUCCESS ?? 0, noFiling: counts.NO_FILING ?? 0, notApplicable: counts.NOT_APPLICABLE ?? 0, failed: counts.FAILED ?? 0, pending: counts.PENDING ?? 0, processing: counts.PROCESSING ?? 0, completedSecurities: completeSecurities, activeSecurities };
  }

  async markBackfillCompleteIfReady(now = new Date()): Promise<boolean> {
    const remaining = await this.prisma.dartBackfillTask.count({ where: {...dartAutomaticWork(now),security:eligibleWhere('dart-financial-statements')} });
    if (remaining) return false;
    if(!(await this.getState())?.backfillCompletedAt)await this.setState({ phase: 'CURRENT', backfillCompletedAt: now, phase2StartedAt: now });
    return true;
  }

  async cleanupRealtimeRetention(now = new Date()): Promise<void> {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
    await this.prisma.$transaction(async tx => {
      await tx.realtimeCycleAggregate.deleteMany({ where: { minuteStartedAt: { lt: sevenDaysAgo } } });
      await tx.realtimeCollectorIssue.deleteMany({ where: { occurredAt: { lt: thirtyDaysAgo } } });
      await tx.realtimeCollectorIssue.deleteMany({ where: { id: { notIn: (await tx.realtimeCollectorIssue.findMany({ orderBy: { occurredAt: 'desc' }, take: 1000, select: { id: true } })).map((x) => x.id) } } });
      await tx.dartDailyCompanyCheck.deleteMany({ where: { usageDate: { lt: toDatabaseDate(getSeoulClock(new Date(now.getTime() - 90 * 24 * 60 * 60_000)).dateKey) } } });
      await tx.dartApiDailyUsage.deleteMany({ where: { usageDate: { lt: toDatabaseDate(getSeoulClock(new Date(now.getTime() - 90 * 24 * 60 * 60_000)).dateKey) } } });
    });
  }

  async countRunsForDate(jobType: string, dateKey: string) {
    const rows = await this.prisma.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*) AS count FROM collector_runs WHERE job_type=${jobType} AND DATE(CONVERT_TZ(started_at,'+00:00','+09:00'))=${dateKey}`;
    return Number(rows[0]?.count ?? 0);
  }

  async createRun(jobType: string, provider: string, metadata: Record<string, unknown>) {
    // The caller holds the shared DART lock: these runs belong to interrupted workers.
    await this.prisma.collectorRun.updateMany({where:{jobType,status:'RUNNING'},data:{status:'FAILED',finishedAt:new Date(),failureReason:'PROCESS_RESTARTED: previous collector stopped; unfinished tasks are resumed.'}});
    return this.prisma.collectorRun.create({ data: { jobType, provider, status: 'RUNNING', metadata: metadata as Prisma.InputJsonValue }, select: { id: true } });
  }

  async finishRun(runId: bigint, status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED', counts: { success: number; failed: number; skipped: number }, failureReason?: string, metadata?: Record<string, unknown>) {
    await this.prisma.collectorRun.update({ where: { id: runId }, data: { status, finishedAt: new Date(), successCount: counts.success, failureCount: counts.failed, skippedCount: counts.skipped, failureReason, ...(metadata && { metadata: metadata as Prisma.InputJsonValue }) } });
  }

  async addRunItem(runId: bigint, security: DartSecurityRecord, task: DartBackfillTaskRecord, status: 'SUCCESS' | 'FAILED' | 'NO_DATA' | 'NOT_APPLICABLE' | 'SKIPPED', message?: string, diagnostics?: Prisma.InputJsonValue) {
    await this.prisma.collectorRunItem.create({ data: { runId, securityId: security.id, symbol: `${security.symbol}:${task.fiscalYear}:${task.reportCode}`, status, diagnostics, message: message?.slice(0, 1000) } });
  }

  async addPhase2RunItem(runId: bigint, security: DartSecurityRecord, status: 'SUCCESS' | 'FAILED' | 'NOT_APPLICABLE' | 'SKIPPED', message?: string, diagnostics?: Prisma.InputJsonValue) {
    await this.prisma.collectorRunItem.create({ data: { runId, securityId: security.id, symbol: security.symbol, status, diagnostics, message: message?.slice(0, 1000) } });
  }

  async markUniverseNoMapping(now = new Date()): Promise<number> {
    const noMap = await this.prisma.security.findMany({ where: { isActive: true, securityType: { not: 'STOCK' }, dartCorpMapping: null }, select: { id: true } });
    if (!noMap.length) return 0;
    const result = await this.prisma.dartBackfillTask.updateMany({ where: { securityId: { in: noMap.map((x) => x.id) }, status: { in: ['PENDING', 'FAILED'] } }, data: { status: 'NOT_APPLICABLE', processedAt: now, errorCode: 'SECURITY_TYPE_NOT_APPLICABLE', errorMessage: 'DART periodic financial filings are not collected for this security type.' } });
    return result.count;
  }

  async markUnmappedTasksNotApplicable(now = new Date()): Promise<number> {
    // A missing identity never proves a policy exclusion. The normal task path records a retry.
    return 0;
  }

  async markAllSecurityTasksNotApplicable(securityId: bigint, code: string, message: string): Promise<number> {
    return (await this.prisma.dartBackfillTask.updateMany({where:{securityId,status:'PENDING'},data:{status:'FAILED',processedAt:null,nextAttemptAt:new Date(Date.now()+86400000),errorCode:storedDartCode(code),errorMessage:message.slice(0,1000)}})).count;
  }

  async settleInterruptedTasks(runId: bigint, security: DartSecurityRecord, status: 'PENDING' | 'FAILED', code: string, message: string, now = new Date()): Promise<number> {
    const securityId = security.id;
    const processing = await this.prisma.dartBackfillTask.findMany({ where: { securityId, status: 'PROCESSING' }, select: { id: true, fiscalYear: true, reportCode: true } });
    if (!processing.length) return 0;
    await this.prisma.dartBackfillTask.updateMany({ where: { id: { in: processing.map((task) => task.id) } }, data: {
      status, errorCode: storedDartCode(code), errorMessage: message.slice(0, 1000), processedAt: null,
      nextAttemptAt: status === 'FAILED' ? new Date(now.getTime() + 6 * 60 * 60_000) : null,
    } });
    await this.prisma.collectorRunItem.createMany({ data: processing.map((task) => ({
      runId, securityId, symbol: `${security.symbol}:${task.fiscalYear}:${task.reportCode}`,
      status: status === 'FAILED' ? 'FAILED' as const : 'SKIPPED' as const, message: `${code}: ${message}`.slice(0, 1000),
    })) });
    return processing.length;
  }

  async hasStoredReceipt(receiptNo: string): Promise<boolean> {
    return (await this.prisma.dartFinancialFiling.count({where:{isWithdrawn:false,OR:[{receiptNo},{AND:[{sourceValidation:{path:'$.version',equals:2}},{sourceValidation:{path:'$.selectedReceiptNo',equals:receiptNo}}]}]}}))>0;
  }

  async setPhase2Check(securityId: bigint, phase: 'PRIORITY' | 'UNIVERSE', now = new Date(), error?: string): Promise<void> {
    await this.prisma.dartSecurityState.update({ where: { securityId }, data: {
      ...(phase === 'PRIORITY' ? { priorityCheckedAt: now } : { universeCheckedAt: now }),
      lastReceiptCheckedAt: now,
      lastError: error?.slice(0, 1000) ?? null,
    } });
  }

  async listPhase2Securities(phase: 'PRIORITY' | 'UNIVERSE', limit: number, now = new Date(), ignoreChecked = false): Promise<DartSecurityRecord[]> {
    const today = toDatabaseDate(getSeoulClock(now).dateKey);
    const priorityIds = phase === 'PRIORITY' ? await this.prioritySecurityIds() : [];
    const priorities = new Map(priorityIds.map((id,index)=>[id,priorityIds.length-index]));
    if (phase === 'PRIORITY' && !priorityIds.length) return [];
    const filterTime = phase === 'PRIORITY'
      ? { OR: [{ priorityCheckedAt: null }, { priorityCheckedAt: { lt: today } }] }
      : { OR: [{ universeCheckedAt: null }, { universeCheckedAt: { lt: today } }] };
    const items = await this.prisma.security.findMany({
      where: { ...eligibleWhere('dart-financial-statements'), ...(phase==='UNIVERSE'?{isActive:true}:{}), securityType: 'STOCK', dartCorpMapping: { isNot: null },
        ...(phase === 'PRIORITY' ? { id: { in: priorityIds } } : {}),
        ...(phase === 'UNIVERSE' ? { dartDailyCompanyChecks: { none: { usageDate: today } } } : {}),
        ...(ignoreChecked?{}:{dartSecurityState: { is: filterTime }}) },
      select: { id: true, collectionRevision:true, symbol: true, marketType: true, securityType: true, dartCorpMapping: { select: { corpCode: true } } },
      orderBy: [{ id: 'asc' }],
      ...(phase === 'UNIVERSE' ? { take: limit } : {}),
    });
    if (phase === 'PRIORITY') items.sort((a, b) => (priorities.get(b.id) ?? 0) - (priorities.get(a.id) ?? 0) || (a.id < b.id ? -1 : 1));
    return (phase === 'PRIORITY' ? items : items.slice(0, limit)).map((item) => ({ id: item.id, symbol: item.symbol, collectionRevision:item.collectionRevision, marketType: item.marketType, securityType: item.securityType, corpCode: item.dartCorpMapping?.corpCode ?? null }));
  }

  async updateStateError(error: string | null): Promise<void> {
    await this.setState({ lastError: error?.slice(0, 1000) ?? null, lastRunAt: new Date() });
  }
}


export function taskSnapshot(task:{status:string;errorCode:string|null;errorMessage:string|null;attempts:number;selectedReceiptNo:string|null;diagnostics:Prisma.JsonValue;nextAttemptAt:Date|null;lastAttemptAt:Date|null;processedAt:Date|null}) {
 return {status:task.status,errorCode:task.errorCode,errorMessage:task.errorMessage,attempts:task.attempts,selectedReceiptNo:task.selectedReceiptNo,diagnostics:task.diagnostics,nextAttemptAt:task.nextAttemptAt?.toISOString()??null,lastAttemptAt:task.lastAttemptAt?.toISOString()??null,processedAt:task.processedAt?.toISOString()??null};
}
