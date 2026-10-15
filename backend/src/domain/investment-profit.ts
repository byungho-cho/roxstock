import {Prisma} from '@roxstock/shared/prisma';
import {annualInvestmentCapital} from './investment-capital.js';
import {ApiError} from '@roxstock/shared/lib/api-error';
export const PROFIT_VERSION=1;
export type ProfitEvent={date:string;securityId:string;name:string;kind:'BUY'|'SELL'|'DIVIDEND';buy:string|null;sell:string|null;cost:string|null;trading:string|null;dividend:string|null};
export type ProfitYear={year:number;events:ProfitEvent[];capital:ReturnType<typeof annualInvestmentCapital>[number];totals:Record<'buy'|'sell'|'cost'|'trading'|'dividend'|'total',string|null>};
const scale=100000000n;
const dateFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'});
function scaled(value:string|null):bigint|null{if(value===null||!/^[-]?\d+(\.\d{1,8})?$/.test(value))return null;const [whole,fraction='']=value.replace(/^-/,'').split('.');const result=BigInt(whole!)*scale+BigInt(fraction.padEnd(8,'0'));return value.startsWith('-')?-result:result;}
export function exactAdd(a:string|null,b:string|null):string|null{const x=scaled(a),y=scaled(b);if(x===null||y===null)return null;const n=x+y,v=n<0n?-n:n;return `${n<0n?'-':''}${v/scale}.${String(v%scale).padStart(8,'0')}`;}
export function profitTotals(events:ProfitEvent[]){
 const sum=(key:'buy'|'sell'|'cost'|'trading'|'dividend')=>events.reduce<string|null>((value,event)=>exactAdd(value,event[key]),'0');
 const trading=sum('trading'),dividend=sum('dividend');
 return {buy:sum('buy'),sell:sum('sell'),cost:sum('cost'),trading,dividend,total:exactAdd(trading,dividend)};
}
export async function calculateProfitYear(tx:Prisma.TransactionClient,accountId:bigint,year:number,today:string):Promise<ProfitYear>{
 const from=new Date(Date.UTC(year,0,1)-9*3600000),endDate=year===Number(today.slice(0,4))?today:`${year}-12-31`;
 const to=new Date(Date.parse(endDate+'T00:00:00Z')+15*3600000);
 // Use the original Prisma Decimal products before exact scaled-integer summation.
 const [buys,sells,dividends]=await Promise.all([
  tx.buyTrade.findMany({where:{accountId,boughtAt:{gte:from,lt:to}},select:{boughtAt:true,quantity:true,unitPrice:true,security:{select:{id:true,name:true}}}}),
  tx.sellTrade.findMany({where:{buyTrade:{accountId},soldAt:{gte:from,lt:to}},select:{soldAt:true,quantity:true,unitPrice:true,buyTrade:{select:{unitPrice:true,security:{select:{id:true,name:true}}}}}}),
  tx.cashTransaction.findMany({where:{accountId,transactionType:'DIVIDEND',transactionDate:{gte:from,lt:to}},select:{transactionDate:true,dividend:{select:{netAmount:true,security:{select:{id:true,name:true}}}}}}),
 ]);
 const date=(value:Date)=>dateFormatter.format(value);
 const raw:ProfitEvent[]=[];
 for(const row of buys)raw.push({date:date(row.boughtAt),securityId:String(row.security.id),name:row.security.name,kind:'BUY',buy:row.quantity.mul(row.unitPrice).toString(),sell:'0',cost:'0',trading:'0',dividend:'0'});
 for(const row of sells){const sell=row.quantity.mul(row.unitPrice),trading=row.quantity.mul(row.unitPrice.minus(row.buyTrade.unitPrice));raw.push({date:date(row.soldAt),securityId:String(row.buyTrade.security.id),name:row.buyTrade.security.name,kind:'SELL',buy:'0',sell:sell.toString(),cost:exactAdd(sell.toString(),trading.negated().toString()),trading:trading.toString(),dividend:'0'});}
 for(const row of dividends){if(!row.dividend)throw new ApiError(409,'DIVIDEND_LINK_MISSING','배당의 종목 연결 정보를 확인할 수 없습니다.');raw.push({date:date(row.transactionDate),securityId:String(row.dividend.security.id),name:row.dividend.security.name,kind:'DIVIDEND',buy:'0',sell:'0',cost:'0',trading:'0',dividend:row.dividend.netAmount.toString()});}
 const compact=new Map<string,ProfitEvent>();
 for(const row of raw){const key=`${row.date}:${row.securityId}:${row.kind}`,previous=compact.get(key);if(!previous)compact.set(key,row);else for(const field of ['buy','sell','cost','trading','dividend'] as const)previous[field]=exactAdd(previous[field],row[field]);}
 const events=[...compact.values()].sort((a,b)=>b.date.localeCompare(a.date));
 const snapshots=await tx.dailyAccountSnapshot.findMany({where:{accountId,snapshotDate:{gte:new Date(`${year}-01-01T00:00:00Z`),lte:new Date(`${endDate}T00:00:00Z`)}},select:{snapshotDate:true,investmentAmount:true},orderBy:[{snapshotDate:'desc'},{id:'desc'}]});
 const capital=annualInvestmentCapital(snapshots,today).find(row=>row.year===year)??{year,date:null,investmentAmount:null,status:'YEAR_END_MISSING'};
 return {year,events,capital,totals:profitTotals(events)};
}
