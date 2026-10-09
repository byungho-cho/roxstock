import {displayShares} from '../domain/share-counts.js';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/api-error.js';
import { id } from '../lib/input.js';
import { combinedValuation,fairPrice,weight,valuation,periods,financialRows,mergeStatements } from '../domain/value-analysis.js';
import { storedFinancials,statementPeriods } from '../domain/financial-statements.js';

type Query={year?:string;query?:string;market?:string;sort?:string;direction?:string;mode?:string;startYear?:string;endYear?:string;period?:string;startQuarter?:string};
const currentYear=()=>Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()));
function integer(value:string|undefined,fallback:number,min:number,max:number){if(value===undefined)return fallback;if(!/^\d+$/.test(value)||Number(value)<min||Number(value)>max)throw new ApiError(400,'INVALID_INPUT','기간을 확인해 주세요.');return Number(value);}
const orderKeys=['name','w','currentPrice','targetPrice','value','eps','epsYield','priceUpdatedAt','issuedShares','roe','capital','netIncome'] as const;
export async function financialStatementRoutes(app:FastifyInstance){
 app.get<{Querystring:Query}>('/financial-statements',async request=>{
  const year=integer(request.query.year,currentYear(),2015,currentYear()),query=request.query.query?.trim()??'',market=request.query.market??'KOSPI',sort=request.query.sort??'w',direction=request.query.direction??'desc';
  if(query.length>100||!['KOSPI','KOSDAQ'].includes(market)||!orderKeys.includes(sort as typeof orderKeys[number])||!['asc','desc'].includes(direction))throw new ApiError(400,'INVALID_INPUT','조회 조건을 확인해 주세요.');
  const securities=await prisma.security.findMany({where:{isActive:true,marketType:market as 'KOSPI'|'KOSDAQ',...(query?{OR:[{name:{contains:query}},{symbol:{contains:query}}]}:{})},include:{marketPrice:true,fundamentals:true,dartShareSnapshots:{where:{fiscalYear:year}},periodValuations:{where:{fiscalYear:year,periodType:'ANNUAL'}},financialStatements:{where:{fiscalYear:year,periodType:'ANNUAL'}},dartFinancialFilings:{where:{fiscalYear:year,isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}]},valuationMetrics:{where:{metricDate:{gte:new Date(Date.UTC(year,0,1)),lt:new Date(Date.UTC(year+1,0,1))}},orderBy:{metricDate:'desc'},take:1}}});
  const rows=securities.map(s=>{
   const metric=combinedValuation(valuation(s.valuationMetrics[0]),s.periodValuations??[]),currentPrice=s.marketPrice?.currentPrice.toString()??null,annual=storedFinancials(s.financialStatements,s.dartFinancialFilings).find(r=>r.periodType==='ANNUAL');
   const eps=metric?.eps??null,epsYield=eps!==null&&currentPrice!==null&&new Prisma.Decimal(currentPrice).gt(0)?new Prisma.Decimal(eps).div(currentPrice).mul(100).toString():null;
   return {id:s.id.toString(),name:s.name,symbol:s.symbol,market:s.marketType,currentPrice,previousClosePrice:s.marketPrice?.previousClosePrice?.toString()??null,priceUpdatedAt:s.marketPrice?.priceUpdatedAt.toISOString()??null,targetPrice:fairPrice(metric,'0.8'),w:weight(metric,currentPrice),value:weight(metric,currentPrice),eps,epsYield,roe:metric?.roe??null,...displayShares(s.dartShareSnapshots??[],s.dartFinancialFilings??[],year),capital:annual?.totalEquity??null,netIncome:annual?.netIncome??null,statementBasis:annual?.basis??null,statementYear:annual?.fiscalYear??null,metricDate:metric?.metricDate??null};
  });
  const key=sort as typeof orderKeys[number];rows.sort((a,b)=>{
   const left=a[key],right=b[key];if(left===null&&right!==null)return 1;if(right===null&&left!==null)return -1;
   const compared=left===null||right===null?0:key==='name'||key==='priceUpdatedAt'?String(left).localeCompare(String(right),'ko'):new Prisma.Decimal(left).cmp(right);
   return compared*(direction==='asc'?1:-1)||a.symbol.localeCompare(b.symbol);
  });
  return {data:{year,market,query,sort,direction,rows,total:rows.length,basis:{targetPrice:'RIM_W_0.8',w:'RIM_W_0.8_DIV_CURRENT_PRICE',value:'RIM_W_0.8_DIV_CURRENT_PRICE',epsYield:'STORED_EPS_DIV_CURRENT_PRICE_PERCENT',statementPeriod:'SELECTED_YEAR_ANNUAL',flow:'INDIVIDUAL_QUARTER',source:'STORED_ONLY'}}};
 });
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
  return prisma.$transaction(async tx=>{
   const security=await tx.security.findUnique({where:{id:securityId}});if(!security?.isActive)throw new ApiError(404,'SECURITY_NOT_FOUND','종목을 찾을 수 없습니다.');
   const range={gte:year-1,lte:last};const [manual,filings,calculated,metrics]=await Promise.all([tx.financialStatement.findMany({where:{securityId,fiscalYear:range}}),tx.dartFinancialFiling.findMany({where:{securityId,fiscalYear:range,isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}]}),tx.periodValuation.findMany({where:{securityId,fiscalYear:range}}),tx.valuationMetric.findMany({where:{securityId,metricDate:{gte:new Date(Date.UTC(year,0,1)),lt:new Date(Date.UTC(last+1,0,1))}},orderBy:{metricDate:'desc'}})]);
   const stored=storedFinancials(manual,filings),chartRows=financialRows(selected,mergeStatements(manual,filings),metrics,calculated),rows=statementPeriods(selected,stored).map(row=>{const chart=chartRows.find(c=>c.key===row.key)!;if(!chart.isEstimated)return {...row,collectionState:chart.collectionState,isEstimated:false};const estimate=calculated.find(c=>c.fiscalYear===row.year&&c.periodType==='ESTIMATE');const values=(estimate?.supplemental as {estimateFinancials?:Record<string,string|null>}|null)?.estimateFinancials??{};return {...row,label:chart.label,isEstimated:true,collectionState:chart.collectionState,basis:chart.source,collectedAt:chart.collectedAt,isDerived:false,values:Object.fromEntries(Object.keys(row.values).map(key=>[key,values[key]??null])),growth:Object.fromEntries(Object.keys(row.growth).map(key=>[key,null]))};});
   return {data:{security:{id:security.id.toString(),name:security.name,symbol:security.symbol},mode,startYear:year,endYear:custom?customEnd:mode==='annual'?endYear:last,startQuarter:quarter,rows,chartRows,collectedAt:rows.flatMap(r=>r.collectedAt?[r.collectedAt]:[]).sort().at(-1)??null,basis:{income:mode==='annual'?'FULL_YEAR':'INDIVIDUAL_QUARTER',cashFlow:mode==='annual'?'FULL_YEAR':'INDIVIDUAL_QUARTER',balance:'PERIOD_END',currency:'KRW'},notices:['금액은 저장된 원 단위 원본이며 화면에서 백만원으로 표시합니다.','지배순이익·지배주주자본·투자/재무활동·기말현금의 저장값이 없으면 —로 표시합니다. 전체 업데이트로 제공되는 보고서 항목을 저장합니다.','전년 동일 기간·동일 연결/별도 기준만 비교합니다. 전년 0·미수집은 —입니다.']}};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 });
}
