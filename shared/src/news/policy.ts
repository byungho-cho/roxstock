import {createHash} from 'node:crypto';
export const newsTypes=['REPORT','ARTICLE','DISCLOSURE'] as const;
export type NewsType=typeof newsTypes[number];
export type AccessCondition='FREE'|'PAID'|'LOGIN'|'UNKNOWN';
export type NewsTarget={id:bigint;symbol:string;name:string;corpCode?:string|null};
export type NewsCandidate={provider:string;providerId:string;title:string;originalUrl:string;sourceName:string;publishedAt:Date;publishedPrecision:'TIME'|'DATE';materialType:NewsType;accessCondition:AccessCondition;summary:string|null;summaryMethod:string;securityIds:bigint[];priority:number};
export const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export const seoulDay=(d:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(d);
export const kstStart=(day:string)=>new Date(day+'T00:00:00+09:00');
export function canonicalUrl(raw:string){
 if(raw.length>2048)throw Error('INVALID_ORIGINAL_URL');
 const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('INVALID_ORIGINAL_URL');
 if(!['www.hankyung.com','consensus.hankyung.com','dart.fss.or.kr'].includes(u.hostname))throw Error('UNTRUSTED_ORIGINAL_HOST');
 if(u.hostname==='dart.fss.or.kr'){
  const receipt=u.searchParams.get('rcpNo');if(!receipt||!/^\d{14}$/.test(receipt))throw Error('INVALID_RECEIPT_URL');
  return 'https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+receipt;
 }
 u.hash='';for(const key of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid|ref|from|output)$/i.test(key))u.searchParams.delete(key);
 u.searchParams.sort();u.pathname=u.pathname.replace(/\/$/,'')||'/';return u.href;
}
export function plainText(value:string){
 return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_m,n:string)=>{
  if(n.startsWith('#')){const c=n[1]?.toLowerCase()==='x'?parseInt(n.slice(2),16):Number(n.slice(1));return c>0&&c<=0x10ffff?String.fromCodePoint(c):'';}
  return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '} as Record<string,string>)[n.toLowerCase()]??'';
 }).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
}
/** Extract verified sentences only; no generated facts and no cuts inside numeric tokens. */
export function contentSummary(evidence:string|null|undefined,title=''){
 if(!evidence)return null;
 const clean=(s:string)=>plainText(s).normalize('NFKC').replace(/[\p{P}\p{Z}\s]/gu,'').toLowerCase();
 const titles=[title,title.replace(/^.*?\(\d{6}\)\s*/,''),title.replace(/^.*? - /,'')].map(clean).filter(Boolean);
 const text=plainText(evidence.replace(/<(script|style|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' '));
 const sentences=text.split(/(?<=[.!?。])(?:\s+|$)|[\r\n]+/u).map(s=>s.trim()).filter(s=>s.length>=12&&!titles.some(t=>clean(s)===t)&&!/(?:무단\s*(?:전재|복제)|재배포\s*금지|저작권|copyright|all rights reserved|기자\s*[=｜|]|@\w|구독\s*(?:신청|하기)|광고|협찬|투자판단.*책임|면책|디자인.*예시|요약\s*정보\s*없음)/i.test(s));
 let result='';
 for(const sentence of sentences){
  if([...result+(result?' ':'')+sentence].length<=300){result+=(result?' ':'')+sentence;if([...result].length>=180)break;}
  else if(result)break;
  else {const words=sentence.split(/\s+/);for(const word of words){if([...result+(result?' ':'')+word].length>297)break;result+=(result?' ':'')+word;}if(result)result+='…';break;}
 }
 return [...result].length>=12?result:null;
}

const aliases:Record<string,string[]>={'005380':['현대차','현대자동차'],'000270':['기아','기아자동차'],'035420':['NAVER','네이버'],'000660':['SK하이닉스','에스케이하이닉스']};
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function relatedTargets(title:string,targets:NewsTarget[]){
 return targets.filter(t=>new RegExp('\\('+escape(t.symbol)+'\\)').test(title)||[t.name,...aliases[t.symbol]??[]].some(name=>{
  if(name.length<2)return false;
  return new RegExp('(?<![\\p{L}\\p{N}])'+escape(name)+'(?=$|[^\\p{L}\\p{N}]|(?:은|는|이|가|의|와|과|도|에|를|을)(?:\\s|[,.:]))','iu').test(title);
 })).map(t=>t.id);
}
export function importance(title:string,type:NewsType):number{
 if(/급등|급락|주가.*(?:상승|하락)|특징주|상한가|하한가|홍보|이벤트|경품|협찬|광고|수익률.*(?:1위|최고)/.test(title)&&!/(?:실적|전망|계약|수주|인수|합병|증자|배당)/.test(title))return 0;
 if(/잠정.*실적|실적.*(?:상향|하향|발표|변경)|전망.*(?:상향|하향|변경)|공급계약|단일판매|주요사항|합병|인수|유상증자|자사주.*(?:소각|취득)|배당.*(?:결정|변경)|영업.*(?:정지|중단)|회생|감사의견/.test(title))return 2;
 if(type==='REPORT'||/실적|전망|수익성|매출|영업이익|순이익|업황|산업|정책|사업|투자|생산|공장|신규|출시|수주|계약|규제|관세|소유.*변동|대량보유/.test(title))return 1;
 return 0;
}
export function candidateKeys(c:NewsCandidate){return {canonicalHash:hash(canonicalUrl(c.originalUrl)),fingerprint:hash(c.title.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{Z}\s]/gu,'')+'|'+[...c.securityIds].sort((a,b)=>a<b?-1:1).join(',')+'|'+seoulDay(c.publishedAt))};}
export function selectNews(candidates:NewsCandidate[],existing=new Set<string>()){
 const seen=new Set(existing);const rows=candidates.filter(c=>{if(!c.priority||!c.securityIds.length)return false;const k=candidateKeys(c);if(seen.has(k.canonicalHash)||seen.has(k.fingerprint))return false;seen.add(k.canonicalHash);seen.add(k.fingerprint);return true;})
 .sort((a,b)=>b.priority-a.priority||b.publishedAt.getTime()-a.publishedAt.getTime()||a.originalUrl.localeCompare(b.originalUrl));
 const important=rows.filter(r=>r.priority===2).length;
 return rows.slice(0,Math.min(10,Math.max(5,important)));
}
export function newsSchedule(state:{initialDate:string;initialCompletedAt:Date|null;completedDate:string|null;attemptDate:string|null;attempts:number;nextRetryAt:Date|null},now:Date){
 const day=seoulDay(now),hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:'Asia/Seoul'}).format(now));
 if(state.completedDate===day)return null;
 if(state.attemptDate===day&&(state.attempts>=3||state.nextRetryAt&&state.nextRetryAt>now))return null;
 if(!state.initialCompletedAt)return {kind:'INITIAL',day,from:kstStart(state.initialDate)};
 if(day<=state.initialDate||hour<6)return null;
 return {kind:'DAILY',day,from:new Date(kstStart(day).getTime()-3*86400000)};
}
