import type { FastifyInstance } from 'fastify';
import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/api-error.js';
import { id } from '../lib/input.js';
import { fairPrice,weight,valuation,periods } from '../domain/value-analysis.js';
import { storedFinancials,statementPeriods } from '../domain/financial-statements.js';

type Query={year?:string;query?:string;market?:string;sort?:string;direction?:string;mode?:string;startYear?:string;startQuarter?:string};
const currentYear=()=>Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(new Date()));
function integer(value:string|undefined,fallback:number,min:number,max:number){if(value===undefined)return fallback;if(!/^\d+$/.test(value)||Number(value)<min||Number(value)>max)throw new ApiError(400,'INVALID_INPUT','기간을 확인해 주세요.');return Number(value);}
const orderKeys=['name','w','currentPrice','targetPrice','value','eps','epsYield','priceUpdatedAt','issuedShares','roe','capital','netIncome'] as const;
export async function financialStatementRoutes(app:FastifyInstance){
 app.get<{Querystring:Query}>('/financial-statements',async request=>{
  const year=integer(request.query.year,currentYear(),2015,currentYear()),query=request.query.query?.trim()??'',market=request.query.market??'KOSPI',sort=request.query.sort??'w',direction=request.query.direction??'desc';
  if(query.length>100||!['KOSPI','KOSDAQ'].includes(market)||!orderKeys.includes(sort as typeof orderKeys[number])||!['asc','desc'].includes(direction))throw new ApiError(400,'INVALID_INPUT','조회 조건을 확인해 주세요.');
  const securities=await prisma.security.findMany({where:{isActive:true,marketType:market as 'KOSPI'|'KOSDAQ',...(query?{OR:[{name:{contains:query}},{symbol:{contains:query}}]}:{})},include:{marketPrice:true,fundamentals:true,financialStatements:{where:{fiscalYear:year,periodType:'ANNUAL'}},dartFinancialFilings:{where:{fiscalYear:year,periodType:'ANNUAL',isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}]},valuationMetrics:{where:{metricDate:{gte:new Date(Date.UTC(year,0,1)),lt:new Date(Date.UTC(year+1,0,1))}},orderBy:{metricDate:'desc'},take:1}}});
  const rows=securities.map(s=>{
   const metric=valuation(s.valuationMetrics[0]),currentPrice=s.marketPrice?.currentPrice.toString()??null,annual=storedFinancials(s.financialStatements,s.dartFinancialFilings).find(r=>r.periodType==='ANNUAL');
   const eps=metric?.eps??null,epsYield=eps!==null&&currentPrice!==null&&new Prisma.Decimal(currentPrice).gt(0)?new Prisma.Decimal(eps).div(currentPrice).mul(100).toString():null;
   return {id:s.id.toString(),name:s.name,symbol:s.symbol,market:s.marketType,currentPrice,previousClosePrice:s.marketPrice?.previousClosePrice?.toString()??null,priceUpdatedAt:s.marketPrice?.priceUpdatedAt.toISOString()??null,targetPrice:fairPrice(metric,'0.8'),w:weight(metric,currentPrice),value:weight(metric,currentPrice),eps,epsYield,roe:metric?.roe??null,issuedShares:s.fundamentals&&Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'Asia/Seoul'}).format(s.fundamentals.updatedAt))===year?s.fundamentals.issuedShares?.toString()??null:null,capital:annual?.totalEquity??null,netIncome:annual?.netIncome??null,statementBasis:annual?.basis??null,statementYear:annual?.fiscalYear??null,metricDate:metric?.metricDate??null};
  });
  const key=sort as typeof orderKeys[number];rows.sort((a,b)=>{
   const left=a[key],right=b[key];if(left===null&&right!==null)return 1;if(right===null&&left!==null)return -1;
   const compared=left===null||right===null?0:key==='name'||key==='priceUpdatedAt'?String(left).localeCompare(String(right),'ko'):new Prisma.Decimal(left).cmp(right);
   return compared*(direction==='asc'?1:-1)||a.symbol.localeCompare(b.symbol);
  });
  return {data:{year,market,query,sort,direction,rows,total:rows.length,basis:{targetPrice:'RIM_W_0.8',w:'RIM_W_0.8_DIV_CURRENT_PRICE',value:'RIM_W_0.8_DIV_CURRENT_PRICE',epsYield:'STORED_EPS_DIV_CURRENT_PRICE_PERCENT',statementPeriod:'SELECTED_YEAR_ANNUAL',flow:'INDIVIDUAL_QUARTER',source:'STORED_ONLY'}}};
 });
 app.get<{Params:{id:string};Querystring:Query}>('/financial-statements/:id',async request=>{
  const securityId=id(request.params.id,'id'),year=integer(request.query.startYear,currentYear()-3,2015,currentYear()),mode=request.query.mode??'annual';if(!['annual','quarter'].includes(mode))throw new ApiError(400,'INVALID_INPUT','비교 기준을 확인해 주세요.');
  const quarter=mode==='annual'?null:integer(request.query.startQuarter,1,1,4),selected=periods(year,quarter,3),last=selected.at(-1)!.year;
  return prisma.$transaction(async tx=>{
   const security=await tx.security.findUnique({where:{id:securityId}});if(!security?.isActive)throw new ApiError(404,'SECURITY_NOT_FOUND','종목을 찾을 수 없습니다.');
   const range={gte:year-1,lte:last};const [manual,filings]=await Promise.all([tx.financialStatement.findMany({where:{securityId,fiscalYear:range}}),tx.dartFinancialFiling.findMany({where:{securityId,fiscalYear:range,isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}]})]);
   const rows=statementPeriods(selected,storedFinancials(manual,filings));
   return {data:{security:{id:security.id.toString(),name:security.name,symbol:security.symbol},mode,startYear:year,startQuarter:quarter,rows,collectedAt:rows.flatMap(r=>r.collectedAt?[r.collectedAt]:[]).sort().at(-1)??null,basis:{income:mode==='annual'?'FULL_YEAR':'INDIVIDUAL_QUARTER',cashFlow:mode==='annual'?'FULL_YEAR':'INDIVIDUAL_QUARTER',balance:'PERIOD_END',currency:'KRW'},notices:['금액은 저장된 원 단위 원본이며 화면에서 백만원으로 표시합니다.','지배순이익·지배주주자본·투자/재무활동·기말현금의 저장값이 없으면 —로 표시합니다. 전체 업데이트로 제공되는 보고서 항목을 저장합니다.','전년 동일 기간·동일 연결/별도 기준만 비교합니다. 전년 0·미수집은 —입니다.']}};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
 });
}
