import {analysisInterestIds} from '../domain/analysis-interest.js';
import {supplementedFilings} from '@roxstock/shared/domain/financial-evidence';
import {currentFundamentalSupplement} from '@roxstock/shared/domain/financial-supplement';
import {publicDartReview} from '@roxstock/shared/domain/dart-review';
import {publicValueRows} from '@roxstock/shared/read-model/value-rows';
import {parseAnalysisSort,sortAnalysisRows} from '@roxstock/shared/domain/analysis-sort';
import {PageCache} from '@roxstock/shared/domain/page-cache';
import {matchesStockSearch} from '@roxstock/shared/domain/stock-search';
import {selectStoredAnalysis,storedAnalysisInclude} from '@roxstock/shared/domain/stored-analysis';
import {displayShares} from '@roxstock/shared/domain/share-counts';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@roxstock/shared/prisma';
import { prisma } from '@roxstock/shared/lib/prisma';
import { ApiError } from '@roxstock/shared/lib/api-error';
import { id } from '../lib/input.js';
import { combinedValuation,fairPrice,weight,valuation,periods,financialRows,mergeStatements } from '@roxstock/shared/domain/value-analysis';
import { storedFinancials,statementPeriods } from '../domain/financial-statements.js';

type Query={scope?:string;accountId?:string;year?:string;query?:string;market?:string;sort?:string;direction?:string;sorts?:string;mode?:string;startYear?:string;endYear?:string;period?:string;startQuarter?:string;offset?:string;limit?:string;compact?:string};
const currentYear=()=>Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()));
function integer(value:string|undefined,fallback:number,min:number,max:number){if(value===undefined)return fallback;if(!/^\d+$/.test(value)||Number(value)<min||Number(value)>max)throw new ApiError(400,'INVALID_INPUT','기간을 확인해 주세요.');return Number(value);}
const orderKeys=['name','w','currentPrice','targetPrice','value','eps','epsYield','priceUpdatedAt','issuedShares','roe','capital','netIncome'] as const;
export async function financialStatementRoutes(app:FastifyInstance){
 app.get<{Querystring:Query}>('/financial-statements',async request=>{
  const year=integer(request.query.year,currentYear(),2015,currentYear()),query=request.query.query?.trim()??'',market=request.query.market??'KOSPI',sort=request.query.sort??'w',direction=request.query.direction??'desc';
  if(query.length>100||!['KOSPI','KOSDAQ'].includes(market)||!orderKeys.includes(sort as typeof orderKeys[number])||!['asc','desc'].includes(direction))throw new ApiError(400,'INVALID_INPUT','조회 조건을 확인해 주세요.');
  let sorts;try{sorts=parseAnalysisSort(request.query.sorts,sort,direction);}catch{throw new ApiError(400,'INVALID_INPUT','정렬 조건을 확인해 주세요.');}
  const limit=request.query.limit===undefined?undefined:integer(request.query.limit,100,1,10000);
  if(request.query.compact!==undefined&&request.query.compact!=='1')throw new ApiError(400,'INVALID_INPUT','compact is invalid.');
  const offset=integer(request.query.offset,0,0,100000);
  const interestIds=await analysisInterestIds(request.query);
    const result=await app.valueReadModel.get(year,{query,market:market as 'KOSPI'|'KOSDAQ'});
  const rows=sortAnalysisRows(publicValueRows(result.rows,request.query.compact==='1').filter(row=>(!interestIds||interestIds.has(row.id))&&row.market===market&&(!query||matchesStockSearch(row.name,query)||matchesStockSearch(row.symbol,query))),sorts);
  return {data:{year,market,query,sort,direction,sorts,rows:limit===undefined?rows:rows.slice(offset,offset+limit),total:rows.length,...(limit===undefined||offset!==0?{}:{navigation:rows.map(({id,name,symbol})=>({id,name,symbol}))}),cache:result.meta,basis:{targetPrice:'RIM_W_0.8',w:'RIM_W_0.8_DIV_CURRENT_PRICE',value:'RIM_W_0.8_DIV_CURRENT_PRICE',epsYield:'STORED_EPS_DIV_CURRENT_PRICE_PERCENT',statementPeriod:'SELECTED_ESTIMATE_OR_PREVIOUS_FINAL_ANNUAL',flow:'ANNUAL',source:'STORED_ONLY'}}};
 });
 const details=new PageCache(24*60*60_000,128);
 app.addHook('onClose',async()=>details.clear());
 app.get<{Params:{id:string};Querystring:Query}>('/financial-statements/:id',async request=>{
  const securityId=id(request.params.id,'id'),mode=request.query.mode??'annual';
  if(!['annual','quarter'].includes(mode))throw new ApiError(400,'INVALID_INPUT','비교 기준을 확인해 주세요.');
  const legacyStart=integer(request.query.startYear,currentYear()-2,2015,currentYear());
  const endYear=Math.max(2018,integer(request.query.endYear,request.query.startYear?Math.min(currentYear(),legacyStart+2):currentYear(),2015,currentYear()));
  const quarter=mode==='annual'?null:integer(request.query.startQuarter,1,1,4);
  const custom=request.query.period;
  if(custom&&!['ALL','ANNUAL','Q1','Q2','Q3'].includes(custom))throw new ApiError(400,'INVALID_INPUT','갱신범위를 확인해 주세요.');
  const customEnd=integer(request.query.endYear,currentYear(),2015,currentYear());
  if(custom&&legacyStart>customEnd)throw new ApiError(400,'INVALID_INPUT','시작연도가 종료연도보다 늦습니다.');
  const year=custom||mode==='quarter'?legacyStart:endYear-2;
  const selected=custom?Array.from({length:customEnd-year+1},(_,i)=>custom==='ALL'?[periods(year+i,null,1)[0]!,...periods(year+i,1,3)]:periods(year+i,custom==='ANNUAL'?null:Number(custom.slice(1)),1)).flat():periods(year,quarter,3);
  const last=selected.at(-1)!.year;
  const revision=(await prisma.analysisRevision.findUnique({where:{key:'security:'+securityId}}))?.revision.toString()??'0';
  const cached=await details.get(JSON.stringify([String(securityId),revision,year,last,mode,quarter,custom]),()=>prisma.$transaction(async tx=>{
   const security=await tx.security.findUnique({where:{id:securityId}});if(!security?.isActive)throw new ApiError(404,'SECURITY_NOT_FOUND','종목을 찾을 수 없습니다.');
   const range={gte:year-1,lte:last};const [manual,rawFilings,calculated,metrics]=await Promise.all([tx.financialStatement.findMany({where:{securityId,fiscalYear:range}}),tx.dartFinancialFiling.findMany({where:{securityId,fiscalYear:range,isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}]}),tx.periodValuation.findMany({where:{securityId,fiscalYear:range}}),tx.valuationMetric.findMany({where:{securityId,metricDate:{gte:new Date(Date.UTC(year,0,1)),lt:new Date(Date.UTC(last+1,0,1))}},orderBy:{metricDate:'desc'}})]);
   const reviewTasks=await tx.dartBackfillTask.findMany({where:{securityId,fiscalYear:range,errorCode:{in:['REVIEW_REQUIRED','DART_SOURCE_REVIEW']}},select:{fiscalYear:true,periodType:true,diagnostics:true}});
   const sourceReviews=reviewTasks.map(t=>({...publicDartReview(t.diagnostics),fiscalYear:t.fiscalYear,periodType:t.periodType}));
   const filings=supplementedFilings(rawFilings,calculated);
   const stored=storedFinancials(manual,filings),chartRows=financialRows(selected,mergeStatements(manual,filings),metrics,calculated),rows=statementPeriods(selected,stored).map(row=>{const chart=chartRows.find(c=>c.key===row.key)!;if(!chart.isEstimated)return {...row,collectionState:chart.collectionState,isEstimated:false};const estimate=calculated.find(c=>c.fiscalYear===row.year&&c.periodType==='ESTIMATE');const values=(estimate?.supplemental as {estimateFinancials?:Record<string,string|null>}|null)?.estimateFinancials??{};return {...row,label:chart.label,isEstimated:true,collectionState:chart.collectionState,basis:chart.source,currency:'KRW',amountMultiplier:'1',collectedAt:chart.collectedAt,isDerived:false,values:Object.fromEntries(Object.keys(row.values).map(key=>[key,values[key]??null])),growth:Object.fromEntries(Object.keys(row.growth).map(key=>[key,null]))};});
   const currentSupplement=currentFundamentalSupplement(await tx.fundamentalSnapshot.findFirst({where:{securityId,collectionSymbol:security.symbol},orderBy:{collectedAt:'desc'}}));
   return {data:{currentSupplement,security:{id:security.id.toString(),name:security.name,symbol:security.symbol,securityType:security.securityType},mode,startYear:year,endYear:custom?customEnd:mode==='annual'?endYear:last,startQuarter:quarter,rows,chartRows,collectedAt:rows.flatMap(r=>r.collectedAt?[r.collectedAt]:[]).sort().at(-1)??null,basis:{income:rows.some(r=>r.periodReview)?'REPORTED_FISCAL_PERIOD':mode==='annual'?'FULL_YEAR':'INDIVIDUAL_QUARTER',cashFlow:rows.some(r=>r.periodReview)?'REPORTED_FISCAL_PERIOD':mode==='annual'?'FULL_YEAR':'INDIVIDUAL_QUARTER',balance:'PERIOD_END',currencies:[...new Set(rows.map(r=>r.currency))]},sourceReviews,notices:[...sourceReviews.map(r=>`${r.fiscalYear} ${r.periodType} · ${r.message}${r.candidatePeriod?' · 검토 후보 '+r.candidatePeriod+' (대상 확정 아님)':''}`),...(rows.some(r=>r.periodReview)?['비정형 결산 공시 종료일: '+rows.filter(r=>r.periodReview).map(r=>r.periodEndDate).join(', ')+'. 해당 보고기간 원본이며 일반 연간·분기 기간으로 환산하지 않습니다.']:[]),'금액은 공시 원문 통화 그대로 저장합니다. 각 기간의 통화·표시 배율을 확인하세요. 외화 가치지표는 통화 환산 필요 시 미표시합니다.','지배순이익·지배주주자본·투자/재무활동·기말현금의 저장값이 없으면 —로 표시합니다. 전체 업데이트로 제공되는 보고서 항목을 저장합니다.','전년 동일 기간·동일 연결/별도 기준만 비교합니다. 전년 0·미수집은 —입니다.']}};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead}));
  return {...cached.value,cache:{status:cached.status,financialRevision:revision}};
 });
}
