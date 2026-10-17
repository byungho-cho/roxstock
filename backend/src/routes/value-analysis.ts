import {supplementedFilings} from '@roxstock/shared/domain/financial-evidence';
import {publicValueRows} from '@roxstock/shared/read-model/value-rows';
import {parseAnalysisSort,sortAnalysisRows} from '@roxstock/shared/domain/analysis-sort';
import {selectValueListAnalysis,orderValueGroups,shareholderTotals} from '@roxstock/shared/domain/value-list-analysis';
import {securityCacheRevision} from '../domain/security-cache-revision.js';
import {selectStoredAnalysis,storedAnalysisInclude} from '@roxstock/shared/domain/stored-analysis';
import { hasInitialQuery, matchesStockSearch } from '@roxstock/shared/domain/stock-search';
import {latestStoredDisplayShares} from '@roxstock/shared/domain/share-counts';
import {currentFundamentalSupplement} from '@roxstock/shared/domain/financial-supplement';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@roxstock/shared/prisma';
import { prisma } from '@roxstock/shared/lib/prisma';
import { ApiError } from '@roxstock/shared/lib/api-error';
import { id } from '../lib/input.js';
import { combinedValuation, fairPrice, weight, valuation, orderByWeight, mergeStatements, periods, financialRows } from '@roxstock/shared/domain/value-analysis';

type Query = { year?: string; query?: string; market?:string; mode?: string; startYear?: string; startQuarter?: string; count?: string; shareClass?: string; sorts?:string; compact?:string; offset?:string;limit?:string };
const currentYear = (now=new Date()) => Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now).slice(0, 4));
function integer(value: string | undefined, fallback: number, min: number, max: number, name: string) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) throw new ApiError(400, 'INVALID_INPUT', name + ' is invalid.');
  return Number(value);
}
function yearRange(year: number) { return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }; }
export async function valueAnalysisRoutes(app: FastifyInstance) {
  app.get<{ Querystring: Query }>('/value-analysis', async request => {
    const year = integer(request.query.year, currentYear(), 2015, currentYear(), 'year');
    const query = request.query.query?.trim() ?? '';
    const market=request.query.market;
    if(market!==undefined&&!['KOSPI','KOSDAQ'].includes(market))throw new ApiError(400,'INVALID_INPUT','시장을 확인해 주세요.');
    if (query.length > 100) throw new ApiError(400, 'INVALID_INPUT', 'query is too long.');
    let sorts;try{sorts=parseAnalysisSort(request.query.sorts);}catch{throw new ApiError(400,'INVALID_INPUT','정렬 조건을 확인해 주세요.');}
    const limit=request.query.limit===undefined?undefined:integer(request.query.limit,20,1,10000,'limit');
    const offset=integer(request.query.offset,0,0,100000,'offset');
    const result=await app.valueReadModel.get(year,{query,...(market?{market:market as 'KOSPI'|'KOSDAQ'}:{})});
    if(request.query.compact!==undefined&&request.query.compact!=='1')throw new ApiError(400,'INVALID_INPUT','compact is invalid.');
    const rows=sortAnalysisRows(publicValueRows(result.rows,request.query.compact==='1').filter(row=>(!market||row.market===market)&&(!query||matchesStockSearch(row.name,query)||matchesStockSearch(row.symbol,query))),sorts);
    return {data:{rows:limit===undefined?rows:rows.slice(offset,offset+limit),total:rows.length,...(limit===undefined||offset!==0?{}:{navigation:rows.map(({id,name,symbol})=>({id,name,symbol}))}),year,query,...(market?{market}:{}),sorts,cache:result.meta,timezone:'Asia/Seoul',metricBasis:'SELECTED_ESTIMATE_OR_PREVIOUS_FINAL_ANNUAL'}};
  });
  app.get<{ Params: { id: string }; Querystring: Query }>('/value-analysis/:id', async request => {
    const securityId = id(request.params.id, 'id'), year = integer(request.query.year, currentYear(), 2015, currentYear(), 'year');
    const mode = request.query.mode ?? 'annual';
    if (mode !== 'annual' && mode !== 'quarter') throw new ApiError(400, 'INVALID_INPUT', 'mode is invalid.');
    const shareClass=request.query.shareClass??'COMMON';
    if(!['COMMON','PREFERRED','TOTAL'].includes(shareClass))throw new ApiError(400,'INVALID_INPUT','shareClass is invalid.');
    const startYear = integer(request.query.startYear, Math.max(2015, year - 2), 2015, currentYear(), 'startYear');
    const quarter = mode === 'annual' ? null : integer(request.query.startQuarter, 1, 1, 4, 'startQuarter');
    const count = integer(request.query.count, 3, 1, 10, 'count'), selected = periods(startYear, quarter, count);
    const last = selected[selected.length - 1]!.year;
    let cachedRow=await app.valueReadModel.snapshotRow(year,String(securityId));
    return prisma.$transaction(async tx => {
      const security = await tx.security.findUnique({ where: { id: securityId }, include: { marketPrice: true, fundamentals: true } });
      if (!security?.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
      if(cachedRow&&(cachedRow.symbol!==security.symbol||cachedRow.codeRevision!==security.codeRevision))cachedRow=undefined;
      const fromYear = Math.min(startYear - 1, year - 1), toYear = Math.max(last, year);
      const [manual, rawFilings, metrics] = await Promise.all([
        tx.financialStatement.findMany({ where: { securityId, fiscalYear: { gte: fromYear, lte: toYear } }, orderBy: [{ fiscalYear: 'desc' }, { periodType: 'desc' }] }),
        tx.dartFinancialFiling.findMany({ where: { securityId, isWithdrawn: false, fiscalYear: { gte: fromYear, lte: toYear } }, orderBy: [{ fiscalYear: 'desc' }, { periodType: 'desc' }, { receiptDate: 'desc' }, { collectedAt: 'desc' }, { receiptNo: 'desc' }] }),
        tx.valuationMetric.findMany({ where: { securityId, metricDate: { gte: new Date(Date.UTC(fromYear, 0, 1)), lt: new Date(Date.UTC(toYear + 1, 0, 1)) } }, orderBy: { metricDate: 'desc' } }),
      ]);
      const calculated=await tx.periodValuation.findMany({where:{securityId,fiscalYear:{gte:fromYear,lte:toYear}}});
      const filings=supplementedFilings(rawFilings,calculated);
      const shareRows=await tx.dartShareSnapshot.findMany({where:{securityId,fiscalYear:{lte:year},shareClass,OR:[{issuedShares:{not:null}},{treasuryShares:{not:null}},{outstandingShares:{not:null}}]},orderBy:[{periodEndDate:'desc'},{receiptNo:'desc'}],take:2});
      const tasks=await tx.dartBackfillTask.findMany({where:{securityId,fiscalYear:{gte:fromYear,lte:toYear}},select:{fiscalYear:true,periodType:true,status:true,errorCode:true}});
      const statements = mergeStatements(manual, filings), annual = statements.filter(row => row.periodType === 'ANNUAL' && row.fiscalYear <= year).sort((a, b) => b.fiscalYear - a.fiscalYear)[0];
      const price=cachedRow?cachedRow.currentPrice:security.marketPrice?.currentPrice.toString()??null;
      const analysis=selectValueListAnalysis({year,price,metrics,periods:calculated,manual,filings});
      const metric=cachedRow?cachedRow.valuation:analysis.metric,rimRow=calculated.find(row=>row.fiscalYear===analysis.metricBasis.year&&row.periodType===(analysis.dataPriority===1?'ESTIMATE':'ANNUAL'));
      const rim=cachedRow?{excessEarnings:cachedRow.excessEarnings,shareholderValue:cachedRow.shareholderValue,rimReason:cachedRow.rimReason,rimBasis:cachedRow.rimBasis,rimComparison:cachedRow.rimComparison}:shareholderTotals(metric,rimRow,filings),shareYear=cachedRow?.metricBasis.year??analysis.metricBasis.year??year;
      const displayedShares=latestStoredDisplayShares(shareRows,filings,year,shareClass);
      const currentSupplement=currentFundamentalSupplement(await tx.fundamentalSnapshot.findFirst({where:{securityId,collectionSymbol:security.symbol},orderBy:{collectedAt:'desc'}}));
      return { data: {
        security: { id: security.id.toString(), symbol: security.symbol, name: security.name, marketType: security.marketType, currentPrice: price, previousClosePrice: cachedRow?cachedRow.previousClosePrice:security.marketPrice?.previousClosePrice?.toString() ?? null, priceUpdatedAt: cachedRow?cachedRow.priceUpdatedAt:security.marketPrice?.priceUpdatedAt.toISOString() ?? null },
        ...displayedShares,
        currentSupplement,
        ...rim,shareMissingReason:displayedShares.issuedShares===null?'해당 연도·보고기간·주식 종류의 동일 공시 주식수 저장값이 없습니다.':null,
        year, metricBasis:cachedRow?.metricBasis??analysis.metricBasis, valuation: metric, w: cachedRow?cachedRow.w:weight(metric, price), fairPrices: cachedRow?cachedRow.fairPrices:['0.7', '0.8', '0.9', '1.0'].map(persistence => ({ persistence, price: fairPrice(metric, persistence) })),
        requiredReturn: '8.0', equity: annual?.totalEquity ?? null,equityBasis:annual?{year:annual.fiscalYear,source:annual.basis,attribution:'TOTAL_EQUITY',collectedAt:annual.collectedAt}:null, closingDate: annual?.periodEndDate ?? null,
        rows: financialRows(selected, statements, metrics,calculated).map(row=>{const task=tasks.find(t=>t.fiscalYear===row.year&&t.periodType===(row.quarter===null?'ANNUAL':'Q'+row.quarter));return {...row,availability:security.listingYear&&row.year<security.listingYear?'PRE_LISTING':row.source?'STORED':task?.status==='NO_FILING'?'NO_FILING':task?.status==='FAILED'?'FAILED':'NOT_COLLECTED'};}), mode, startYear, startQuarter: quarter, count,
        notices: [...(rim.rimComparison?.reason?[rim.rimComparison.reason]:[]),rim.rimReason??'RIM 총액은 동일 공시의 검증된 자본·ROE·주식수 기준입니다.', '가치지표는 기존 저장값을 우선합니다. 보완 지표는 재무기간별 저장값이며 분기 누적 실적을 연환산합니다(TTM 아님). 과거 종가는 기간 말 기준이며 이후 공시로 계산한 사후 지표입니다.', '성장률은 동일 결산 구분의 전년 동기 대비이며 비교 기준이 없거나 0 이하면 계산하지 않습니다.'],
      } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  });
}
