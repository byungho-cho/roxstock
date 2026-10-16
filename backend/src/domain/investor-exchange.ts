import {Prisma} from '@roxstock/shared/prisma';
type Flow=Prisma.InvestorFlowDailyGetPayload<{}>;
const subjects=['INDIVIDUAL','FOREIGN','INSTITUTION'];
const fields=['buyAmount','sellAmount','netAmount','buyQuantity','sellQuantity','netQuantity'] as const;
/** Only add matching source/date/actor/unit; never add an already integrated observation. */
export function combinedStockFlows(rows:Flow[],metric:string){
 const dates=[...new Set(rows.map(row=>row.tradeDate.getTime()))];
 return dates.flatMap(time=>{
  const day=rows.filter(row=>row.tradeDate.getTime()===time&&row.source==='KIS_API');
  return subjects.flatMap(actor=>{
   const krx=day.filter(row=>row.investorCode===actor&&row.exchangeScope==='KRX');
   const nxt=day.filter(row=>row.investorCode===actor&&row.exchangeScope==='NXT');
   const base=krx[0]??nxt[0];if(!base)return [];
   const beforeNxt=base.tradeDate.toISOString().slice(0,10)<'2025-03-04';
   const valid=krx.length===1&&(beforeNxt||nxt.length===1)&&[krx[0],...(beforeNxt?[]:nxt)].every(row=>metric==='amount'?row?.amountUnit==='KRW':row?.quantityUnit==='SHARE');
   const values=Object.fromEntries(fields.map(key=>[key,!valid?null:beforeNxt?krx[0]![key]:krx[0]![key]===null||nxt[0]![key]===null?null:krx[0]![key]!.plus(nxt[0]![key]!) ]));
   return [{...base,...values,exchangeScope:'KRX_NXT',reason:valid?'한국투자증권 KRX+NXT 합계 · 종가 KRX 기준':'KRX 또는 NXT 미수집 · 통합값 미표시',raw:{closingPrice:(krx[0]?.raw as Record<string,unknown>|undefined)?.closingPrice??null,closeChange:(krx[0]?.raw as Record<string,unknown>|undefined)?.closeChange??null}} as Flow];
  });
 });
}
