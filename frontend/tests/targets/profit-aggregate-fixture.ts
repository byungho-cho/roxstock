import {calculateProfit,type Capital} from '../../src/pages/investment-profit/profitData';
import type {TradeDto,CashTransactionDto} from '../../src/data/roxstockApi';
export function profitFixture(accountId:string,trades:unknown[],dividends:unknown[],capital:Capital[]=[],today='2026-10-07',securityId?:string){
 const legacy=calculateProfit(trades as TradeDto[],dividends as CashTransactionDto[],today);
 const decimal=(v:bigint|null)=>v===null?null:`${v<0n?'-':''}${(v<0n?-v:v)/100000000n}.${String((v<0n?-v:v)%100000000n).padStart(8,'0')}`;
 return {data:{accountId,...(securityId?{securityId}:{}),capital:securityId?[]:capital,events:legacy.events.filter(e=>!securityId||e.securityId===securityId).map(e=>({...e,buy:decimal(e.buy),sell:decimal(e.sell),cost:decimal(e.cost),trading:decimal(e.trading),dividend:decimal(e.dividend)}))}};
}

export function profitStatisticsFixture(accountId:string,securityId:string,profit:ReturnType<typeof profitFixture>){
 const rows=profit.data.events.filter(e=>e.securityId===securityId),years=[...new Set(rows.map(e=>Number(e.date.slice(0,4))))].sort((a,b)=>b-a);
 return {data:{accountId,security:{id:securityId,name:rows[0]?.name??'종목'+securityId,symbol:securityId.padStart(6,'0')},years:years.map(year=>{const events=rows.filter(e=>e.date.startsWith(String(year))),sum=(key:'buy'|'sell'|'cost'|'trading'|'dividend')=>String(events.reduce((n,e)=>n+Number(e[key]),0));return {year,totals:{buy:sum('buy'),sell:sum('sell'),cost:sum('cost'),trading:sum('trading'),dividend:sum('dividend'),total:String(Number(sum('trading'))+Number(sum('dividend')))},months:[]};})},meta:{completeHistory:true}};
}
