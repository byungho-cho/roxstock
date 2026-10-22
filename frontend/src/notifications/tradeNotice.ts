export type TradeNotice={id:string;kind:'BUY'|'SELL'|'DIVIDEND';name:string;symbol?:string;account:string;date:string;quantity:string;price:string;gross:string;net:string;receivedAt:number};
const field=(raw:string,label:string)=>raw.match(new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*[:：]\\s*([^\\n]+)`))?.[1].trim()??'';
const numeric=(value:string)=>/^\d[\d,]*(?:\.\d+)?(?:\s*(?:주|원))?$/.test(value)?value.replace(/[,주원\s]/g,''):'';
export function parseTradeNotice(row:{id:string;raw:string;receivedAt:number}):TradeNotice|null{
 const raw=row.raw;if(!raw.includes('[미래에셋증권]'))return null;
 const side=field(raw,'매매구분');const kind=raw.match(/\[미래에셋증권\]\s*전량체결/)&&['매수','매도'].includes(side)?side==='매수'?'BUY':'SELL':raw.includes('권리 입금 안내')&&/배당금\s*입금/.test(raw)?'DIVIDEND':null;
 if(!kind)return null;
 const date=field(raw,'체결일자|거래일자|입금일자').replace(/[./]/g,'-');
 const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))?date:'';
 const symbol=field(raw,'종목코드');
 return {id:row.id,kind,name:field(raw,'종목명|종목'),symbol:/^\d{6}$/.test(symbol)?symbol:undefined,account:field(raw,'계좌번호|계좌'),date:validDate,quantity:numeric(field(raw,'체결수량|거래수량')),price:numeric(field(raw,'체결단가|체결가격|거래단가')),gross:numeric(field(raw,'세전배당금|세전 배당금')),net:numeric(field(raw,'세후배당금|세후 배당금|입금액')),receivedAt:row.receivedAt};
}
export function accountMatches(pattern:string,number:string){const p=pattern.replace(/[\s-]/g,'');const n=number.replace(/[\s-]/g,'');return p.length>=6&&/^[\d*]+$/.test(p)&&p.length===n.length&&[...p].every((c,i)=>c==='*'||c===n[i]);}
export function sellCandidates<T extends {boughtAt:string;remainingQuantity:string}>(lots:T[],notice:TradeNotice){return notice.date&&Number(notice.quantity)>0?lots.filter(l=>Number(l.remainingQuantity)>=Number(notice.quantity)&&new Date(l.boughtAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})<=notice.date):[];}
