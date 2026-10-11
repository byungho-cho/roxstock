import {calculateProfit,type Capital} from '../../src/pages/investment-profit/profitData';
import type {TradeDto,CashTransactionDto} from '../../src/data/roxstockApi';
export function profitFixture(accountId:string,trades:unknown[],dividends:unknown[],capital:Capital[]=[],today='2026-10-07'){
 const legacy=calculateProfit(trades as TradeDto[],dividends as CashTransactionDto[],today);
 const decimal=(v:bigint|null)=>v===null?null:`${v<0n?'-':''}${(v<0n?-v:v)/100000000n}.${String((v<0n?-v:v)%100000000n).padStart(8,'0')}`;
 return {data:{accountId,capital,events:legacy.events.map(e=>({...e,buy:decimal(e.buy),sell:decimal(e.sell),cost:decimal(e.cost),trading:decimal(e.trading),dividend:decimal(e.dividend)}))}};
}
