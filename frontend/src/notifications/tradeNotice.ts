import {seoulTradeDate} from '../utils/tradeDates';
export type TradeNotice={id:string;kind:'BUY'|'SELL'|'DIVIDEND';name:string;symbol?:string;identityIssue?:'INVALID_CODE'|'CONFLICTING_CODES';account:string;date:string;quantity:string;price:string;gross:string;net:string;receivedAt:number};
const field=(raw:string,label:string)=>raw.match(new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*[:：]\\s*([^\\n]+)`))?.[1].trim()??'';
const numeric=(value:string)=>/^\d[\d,]*(?:\.\d+)?(?:\s*(?:주|원))?$/.test(value)?value.replace(/[,주원\s]/g,''):'';
export function normalizeBrokerStockCode(value:string):string|undefined {
 return /^(?:A)?(\d{6})$/i.exec(value.trim())?.[1];
}
function stockIdentity(raw:string){
 const originalName=field(raw,'종목명|종목');
 const suffix=/^(.+?)\s*[(（]([^()（）]+)[)）]$/.exec(originalName);
 const embedded=suffix?normalizeBrokerStockCode(suffix[2]):undefined;
 const explicit=field(raw,'종목코드');
 const code=explicit?normalizeBrokerStockCode(explicit):undefined;
 const identityIssue=explicit&&!code?'INVALID_CODE' as const:code&&embedded&&code!==embedded?'CONFLICTING_CODES' as const:undefined;
 return {name:embedded?suffix![1].trim():originalName,symbol:code??embedded,identityIssue};
}
export function matchingNoticeStocks<T extends {name:string;symbol:string}>(stocks:T[],notice:Pick<TradeNotice,'name'|'symbol'|'identityIssue'>):T[]{
 if(notice.identityIssue)return [];
 return stocks.filter(stock=>notice.symbol?stock.symbol===notice.symbol:!!notice.name&&stock.name===notice.name);
}
export function formatNoticeNumber(value:string,unknown='?'):string {
 return /^\d+(?:\.\d+)?$/.test(value)?value.replace(/^\d+/,integer=>integer.replace(/\B(?=(\d{3})+(?!\d))/g,',')):unknown;
}
export function parseTradeNotice(row:{id:string;raw:string;receivedAt:number}):TradeNotice|null{
 const raw=row.raw;if(!raw.includes('[미래에셋증권]'))return null;
 const side=field(raw,'매매구분');const kind=raw.match(/\[미래에셋증권\]\s*전량체결/)&&['매수','매도'].includes(side)?side==='매수'?'BUY':'SELL':raw.includes('권리 입금 안내')&&/배당금\s*입금/.test(raw)?'DIVIDEND':null;
 if(!kind)return null;
 const sourceDate=field(raw,'체결일자|거래일자|입금일자');
 const date=sourceDate?sourceDate.replace(/[./]/g,'-'):Number.isFinite(row.receivedAt)?new Date(row.receivedAt).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}):'';
 const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date?date:'';
 const identity=stockIdentity(raw);
 return {id:row.id,kind,...identity,account:field(raw,'계좌번호|계좌'),date:validDate,quantity:numeric(field(raw,'체결수량|거래수량')),price:numeric(field(raw,'체결단가|체결가격|거래단가')),gross:numeric(field(raw,'세전배당금|세전 배당금')),net:numeric(field(raw,'세후배당금|세후 배당금|입금액')),receivedAt:row.receivedAt};
}
export function accountMatches(pattern:string,number:string){const p=pattern.replace(/[\s-]/g,'');const n=number.replace(/[\s-]/g,'');return p.length>=6&&/^[\d*]+$/.test(p)&&p.length===n.length&&[...p].every((c,i)=>c==='*'||c===n[i]);}
export function sellCandidates<T extends {boughtAt:string;remainingQuantity:string}>(lots:T[],notice:TradeNotice){
 const quantity=decimalUnits(notice.quantity),date=seoulTradeDate(notice.date);
 return date&&quantity!==null&&quantity>0n?lots.filter(l=>{const remaining=decimalUnits(l.remainingQuantity),bought=seoulTradeDate(l.boughtAt);return remaining!==null&&remaining>=quantity&&bought!==null&&bought<=date;}):[];
}
// API trade quantities/prices use at most six decimal places (prices use four); comparisons stay exact.
const scale=1000000n;
function decimalUnits(value:string):bigint|null {
 if(!/^\d+(?:\.\d{1,6})?$/.test(value))return null;
 const [whole,fraction='']=value.split('.');return BigInt(whole)*scale+BigInt(fraction.padEnd(6,'0'));
}
function decimalText(value:bigint,places:number){
 const sign=value<0n?'-':'',digits=(value<0n?-value:value).toString().padStart(places+1,'0');
 return sign+(digits.slice(0,-places)+'.'+digits.slice(-places)).replace(/\.?0+$/,'');
}
export function candidateAmounts(lot:{unitPrice:string;remainingQuantity:string},notice:TradeNotice){
 const buy=decimalUnits(lot.unitPrice),sell=decimalUnits(notice.price),quantity=decimalUnits(notice.quantity),remaining=decimalUnits(lot.remainingQuantity);
 if(buy===null||buy<=0n||sell===null||sell<=0n||quantity===null||quantity<=0n||remaining===null)return null;
 const profit=(sell-buy)*quantity;
 return {profit:decimalText(profit,12),total:decimalText(buy*remaining,12),sign:profit>0n?1:profit<0n?-1:0};
}
export function sortedSellCandidates<T extends {id:string;boughtAt:string;unitPrice:string;remainingQuantity:string}>(lots:T[],notice:TradeNotice){
 return sellCandidates(lots,notice).filter(l=>candidateAmounts(l,notice)!==null).sort((a,b)=>{
  const buyA=decimalUnits(a.unitPrice)!,buyB=decimalUnits(b.unitPrice)!,sell=decimalUnits(notice.price)!;
  // (sell-buy)/buy, compared before any display rounding.
  const difference=(sell-buyA)*buyB-(sell-buyB)*buyA;
  if(difference!==0n)return difference>0n?-1:1;
  const dateA=seoulTradeDate(a.boughtAt)!,dateB=seoulTradeDate(b.boughtAt)!;
  return dateA<dateB?-1:dateA>dateB?1:a.id<b.id?-1:a.id>b.id?1:0;
 });
}
export function formatCandidateAmount(value:string,signed=false){return (signed&&!value.startsWith('-')&&value!=='0'?'+':'')+value.replace(/^-?\d+/,whole=>whole.replace(/\B(?=(\d{3})+(?!\d))/g,','))+'원';}
