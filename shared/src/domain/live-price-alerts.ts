import type {LiveQuote} from './live-quotes.js';
export type PriceDirection='BELOW'|'ABOVE';
export const pauseChoices=['30m','1h','2h','3h','day'] as const;
export type PauseChoice=typeof pauseChoices[number];
export function priceAmount(value:unknown):number{
 if(typeof value!=='string'||!/^\d{1,12}$/.test(value)||!Number.isSafeInteger(Number(value))||Number(value)<=0)throw Error('양수인 원 단위 금액을 입력해 주세요.');
 return Number(value);
}
export function pauseEnd(choice:unknown,now=new Date()):Date{
 if(!pauseChoices.includes(choice as PauseChoice))throw Error('일시 중지 기간을 확인해 주세요.');
 const minutes:Record<string,number>={'30m':30,'1h':60,'2h':120,'3h':180};
 if(choice!=='day')return new Date(+now+minutes[String(choice)]!*60000);
 const day=new Date(+now+9*3600000).toISOString().slice(0,10);
 return new Date(+new Date(day+'T00:00:00+09:00')+86400000);
}
export function matchesPrice(price:number,target:number,direction:PriceDirection){return direction==='BELOW'?price<=target:price>=target;}
/** Only an actual, timely new KIS trade can activate a condition, never REST/cache restoration. */
export function freshAlertTrade(q:LiveQuote,eligibleAfter:Date,now=new Date()):boolean{
 const observed=Date.parse(q.observedAt);
 return (q.sequence===undefined||/^\d{1,32}$/.test(q.sequence))&&Number.isFinite(q.change)&&q.source==='KIS'&&!q.halted&&Number.isFinite(q.price)&&q.price>0&&Number.isFinite(q.rate)&&Number.isFinite(observed)&&observed>+eligibleAfter&&q.receivedAt>+eligibleAfter&&observed<=+now+1000&&q.receivedAt<=+now+1000&&+now-observed<3000&&+now-q.receivedAt<3000;
}
