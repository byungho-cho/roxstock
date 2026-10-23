// Dates without a time already represent a Seoul trading date. Instants are converted first.
export function seoulTradeDate(value:string|undefined):string|null {
 if(!value)return null;
 if(/^\d{4}-\d{2}-\d{2}$/.test(value)){
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:null;
 }
 // Reject ambiguous local timestamps and calendar overflows rather than inventing a date.
 if(!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!seoulTradeDate(value.slice(0,10)))return null;
 const date=new Date(value);
 return Number.isFinite(date.getTime())?date.toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}):null;
}
export function tradeHoldingDays(boughtAt:string|undefined,soldAt:string|undefined):number|null {
 const buy=seoulTradeDate(boughtAt),sell=seoulTradeDate(soldAt);
 if(!buy||!sell||sell<buy)return null;
 return (Date.parse(sell+'T00:00:00Z')-Date.parse(buy+'T00:00:00Z'))/86400000;
}
