import type { FastifyInstance } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { id } from '../lib/input.js';
import { ApiError } from '../lib/api-error.js';
import { consensusRatios, type AnnualConsensus } from '../collector/annual-consensus.js';
import { getSeoulClock } from '../collector/time.js';
export async function annualConsensusRoutes(app:FastifyInstance){
 app.get<{Params:{id:string};Querystring:{year?:string}}>('/securities/:id/annual-estimates',async request=>{
  const securityId=id(request.params.id,'id'),year=Number(request.query.year??getSeoulClock().dateKey.slice(0,4));
  if(!Number.isInteger(year)||year<2015||year>Number(getSeoulClock().dateKey.slice(0,4)))throw new ApiError(400,'INVALID_YEAR','예상치 연도를 확인해 주세요.');
  const snapshot=await prisma.annualConsensusSnapshot.findFirst({where:{securityId,fiscalYear:year},orderBy:[{asOf:'desc'},{collectedAt:'desc'}]});
  if(!snapshot)return {data:{fiscalYear:year,kind:'ANNUAL_ESTIMATE',state:'UNAVAILABLE',code:process.env.CONSENSUS_ENABLED==='true'?'CONSENSUS_NOT_COLLECTED':'CONSENSUS_NOT_CONFIGURED'}};
  if(snapshot.source==='NAVER_FNGUIDE_ANNUAL')return {data:{fiscalYear:year,state:'ESTIMATED',isEstimated:true,asOf:snapshot.asOf.toISOString(),collectedAt:snapshot.collectedAt.toISOString(),source:snapshot.source,...(snapshot.data as object)}};
  if(snapshot.state==='FINALIZED')return {data:{fiscalYear:year,kind:'FINAL_ANNUAL',state:'FINALIZED',isEstimated:false,values:snapshot.finalValues,price:snapshot.frozenClose,estimateArchive:{source:snapshot.source,asOf:snapshot.asOf.toISOString(),data:snapshot.data}}};
  const live=year===Number(getSeoulClock().dateKey.slice(0,4))?await prisma.marketPrice.findUnique({where:{securityId}}):null;
  const price=snapshot.frozenClose as {value:string;date:string;source:string}|null??(live?{value:live.currentPrice.toString(),date:getSeoulClock(live.priceUpdatedAt).dateKey,source:'STORED_LATEST_MARKET_PRICE'}:undefined);
  return {data:{fiscalYear:year,state:'ESTIMATED',isEstimated:true,asOf:snapshot.asOf.toISOString(),collectedAt:snapshot.collectedAt.toISOString(),source:snapshot.source,...consensusRatios(snapshot.data as unknown as AnnualConsensus,price)}};
 });
}
