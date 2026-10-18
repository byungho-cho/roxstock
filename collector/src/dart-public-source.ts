import {createHash} from 'node:crypto';
import {Prisma} from '@roxstock/shared/prisma';
import type {FiscalDuration} from '@roxstock/shared/domain/period-valuation';
import {DartApiError,type DartReport,type DartFinancialRow} from './dart-provider.js';
import {validateDartFiling} from './dart-filing-validation.js';

const plain=(s:string)=>s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const compact=(s:string)=>plain(s).replace(/\s/g,'');
const reject=(stage="UNVERIFIED"):never=>{throw new DartApiError('DART_SOURCE_REVIEW','Public filing requires source review.',false,false,{validationResult:'PUBLIC_DOCUMENT_'+stage});};
export function publicAnnualTarget(report:DartReport,corpCode:string,year:number):DartReport|undefined {
 const s=report.selection;if(report.periodType!=='ANNUAL'||!s||s.taskFiscalYear!==year)return;
 if(s.periodError!=='MULTIPLE_ANNUAL_PERIODS'&&!s.candidates.some(c=>c.correctionType==='CONTENT'))return;
 const own=s.candidates.filter(c=>c.reportPeriod.startsWith(year+'-'));
 if(!own.length||own.some(c=>c.corpCode!==corpCode||['WITHDRAWAL','UNKNOWN'].includes(c.correctionType)))return;
 // One annual slot represents the last closing within the requested calendar year.
 // Earlier transition reports stay in disclosure history; never concatenate their flows.
 const period=own.map(c=>c.reportPeriod).sort().at(-1)!;
 const candidates=own.filter(c=>c.reportPeriod===period).sort((a,b)=>b.receiptDate.localeCompare(a.receiptDate)||b.receiptNo.localeCompare(a.receiptNo));
 if(candidates.filter(c=>c.correctionType==='ORIGINAL').length!==1)return;
 const chosen=candidates[0]!;
 const {periodError,...rest}=s;
 const [y,m]=period.split('-').map(Number);
 return {...report,receiptNo:chosen.receiptNo,receiptDate:chosen.receiptDate,reportName:chosen.reportName,selection:{...rest,candidates,periodEndDate:new Date(Date.UTC(y!,m!,0)).toISOString().slice(0,10),periodResolution:{method:'PUBLIC_DOCUMENT_LAST_CALENDAR_CLOSING',originalReason:periodError??'CONTENT_CORRECTION_REQUIRES_ORIGINAL_VALIDATION',returnedReceiptNo:chosen.receiptNo}}};
}

export interface PublicSection {title:string;url:string;html:string}
/** Read only static, numeric viewer coordinates; never execute the disclosure's JavaScript. */
export function publicSectionUrls(main:string,receipt:string){
 if(main.length>2_000_000||!/^\d{14}$/.test(receipt))return [];
 return [...main.matchAll(/node\d+\['text'\]\s*=\s*"([^"]+)";([\s\S]*?)\['dtd'\]\s*=\s*"([^"]+)";/g)].flatMap(m=>{
  const title=m[1]!;if(!/사\s*업\s*보\s*고\s*서|^\d+\.\s*(연결)?재무제표$/.test(title))return [];
  const params:Record<string,string>={dtd:m[3]!};
  for(const k of ['rcpNo','dcmNo','eleId','offset','length']){const v=m[2]!.match(new RegExp("\\['"+k+"'\\]\\s*=\\s*\"([^\"]+)\""))?.[1];if(!v||!/^\d+$/.test(v))return [];params[k]=v;}
  if(params.rcpNo!==receipt||!['dart3.xsd','dart4.xsd'].includes(params.dtd!)||Number(params.length)>2_000_000)return [];
  return [{title,url:'https://dart.fss.or.kr/report/viewer.do?'+new URLSearchParams(params)}];
 });
}

/** Fail closed on unsupported layouts, ambiguous rows/units, missing periods or balance mismatch. */
export function parsePublicAnnual(report:DartReport,corpCode:string,year:number,sections:PublicSection[]){
 const cover=sections.find(s=>/사\s*업\s*보\s*고\s*서/.test(s.title));if(!cover)reject();
 for(const section of sections){const u=new URL(section.url);if(u.origin!=='https://dart.fss.or.kr'||u.pathname!=='/report/viewer.do'||u.searchParams.get('rcpNo')!==report.receiptNo||section.html.length>2_000_000)reject();}
 const date='(\\d{4})(?:년|\\.)\\s*(\\d{1,2})(?:월|\\.)\\s*(\\d{1,2})(?:일)?';
 const range=compact(cover!.html).match(new RegExp('사업연도'+date+'부터'+date+'까지'));if(!range)reject('COVER_RANGE');
 const start=[range![1],range![2]!.padStart(2,'0'),range![3]!.padStart(2,'0')].join('-'),end=[range![4],range![5]!.padStart(2,'0'),range![6]!.padStart(2,'0')].join('-');
 if(end!==report.selection?.periodEndDate||Number(end.slice(0,4))!==year||![start,end].every(d=>Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d))reject();
 const days=(Date.parse(end)-Date.parse(start))/86400000+1;if(days<1||days>366)reject();
 // A missing CFS section may fall back to explicitly labelled OFS, never a malformed CFS.
 const cfs=sections.find(s=>/^\d+\.\s*연결재무제표$/.test(s.title));
 const absentCfs=cfs&&/^\d+\.연결재무제표해당사항(?:이)?없(?:습니다\.?|슴|음\.?)$/.test(compact(cfs.html));
 const hasCfs=cfs&&!absentCfs;
 if(!cfs)reject('CFS_DISCLOSURE');
 const section=hasCfs?cfs:sections.find(s=>/^\d+\.\s*재무제표$/.test(s.title));if(!section)reject();
 const division=hasCfs?'CFS' as const:'OFS' as const,html=section!.html,text=compact(html);
 const rangeInStatement=new RegExp(date+'부터'+date+'까지').exec(text);
 if(!rangeInStatement||[rangeInStatement[1],rangeInStatement[2]!.padStart(2,'0'),rangeInStatement[3]!.padStart(2,'0')].join('-')!==start||[rangeInStatement[4],rangeInStatement[5]!.padStart(2,'0'),rangeInStatement[6]!.padStart(2,'0')].join('-')!==end)reject('STATEMENT_RANGE');
 const units=new Map<string[][],string|undefined>();
 const label=(v:string)=>v.replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVX]+[.．]?/,'').replace(/\(주석[^)]*\)|\(주\d[^)]*\)/g,'');
 const tableMatches=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
 if(tableMatches.length>64)reject('LAYOUT_LIMIT');
 const tables=tableMatches.map(t=>{const rows=[...t[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1]!.matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].flatMap(c=>Array(Math.min(30,Number(c[1]!.match(/colspan=["']?(\d+)/i)?.[1]??1))).fill(compact(c[2]!)) as string[]));const unit=[...compact(html.slice(0,t.index)).matchAll(/단위[:：]([^()（）]{1,24})[)）]/g)].at(-1)?.[1];units.set(rows,unit);return rows;});
 const number=(v:string|undefined)=>{if(!v||!/^\(?-?[\d,]+(?:\.\d+)?\)?$/.test(v))return null;return v.replaceAll(',','').replace(/^\((.*)\)$/,'-$1');};
 if(tables.some(t=>t.length>512||t.some(r=>r.length>128)))reject('LAYOUT_LIMIT');
 const bs=tables.filter(t=>t.some(r=>label(r[0]??'')==='자산총계')&&t.some(r=>label(r[0]??'')==='부채총계')).slice(0,1);
 const income=tables.filter((t,i)=>i>tables.indexOf(bs[0]!)&&t.some(r=>['매출액','매출','수익(매출액)','영업수익'].includes(label(r[0]??'')))&&t.some(r=>label(r[0]??'').startsWith('영업이익'))).slice(0,1);
 if(bs.length!==1||income.length!==1)reject('STATEMENT_TABLE');if([...bs,...income].some(t=>units.get(t)!=='원'))reject('UNIT');
 const term=compact(cover!.html).match(/제(\d+)기/)?.[1];if(!term)reject('COVER_TERM');
 const read=(tables:string[][][],names:string[],column=0)=>{const found:string[]=[];for(const table of tables){const head=table.find(r=>r.some(c=>/^제\d+/.test(c)));if(!head)reject('COLUMN');let first=head!.findIndex(c=>/^제\d+/.test(c));if(head![first]?.match(/^제(\d+)/)?.[1]!==term)reject('COLUMN_TERM');for(let i=0;i<column;i++){const value=head![first];while(first<head!.length&&head![first]===value)first++;}let next=first+1;while(next<head!.length&&head![next]===head![first])next++;for(const row of table.filter(r=>names.includes(label(r[0]??'')))){const current=[...new Set(row.slice(first,next).filter(v=>v!==''))];if(current.length!==1)reject('COLUMN');const n=number(current[0]);if(n!==null)found.push(n);}}const values=[...new Set(found)];if(values.length>1)reject('DUPLICATE_VALUE');return values[0]??null;};
 const assets=read(bs,['자산총계','자산총액']),liabilities=read(bs,['부채총계','부채총액']),equity=read(bs,['자본총계','자본총액']);
 const revenue=read(income,['매출액','매출','수익(매출액)','영업수익']),operating=read(income,['영업이익','영업이익(손실)','영업이익(영업손실)']),profit=read(income,['당기순이익','당기순이익(손실)','당기순이익(당기순손실)','당기순손익','당기순손실']);
 if([assets,liabilities,equity,revenue,operating,profit].some(v=>v===null)||!new Prisma.Decimal(assets!).eq(new Prisma.Decimal(liabilities!).plus(equity!)))reject('ACCOUNTS');
 const rows:DartFinancialRow[]=[];
 for(const [statementDivision,accountId,accountName,value] of [['BS','ifrs-full_Assets','자산총계',assets],['BS','ifrs-full_Liabilities','부채총계',liabilities],['BS','ifrs-full_Equity','자본총계',equity],['IS','ifrs-full_Revenue','매출액',revenue],['IS','dart_OperatingIncomeLoss','영업이익',operating],['IS','ifrs-full_ProfitLoss','당기순이익',profit]] as const)rows.push({receiptNo:report.receiptNo,corpCode,fiscalYear:year,reportCode:report.reportCode,statementDivision,statementName:statementDivision,accountId,accountName,currentAmount:value,currentYtdAmount:value,currency:'KRW'});
 const optional:Array<[string,string,string,string|null]>=[
 ['BS','ifrs-full_EquityAttributableToOwnersOfParent','지배주주지분',read(bs,['지배기업의소유주에게귀속되는자본','지배기업소유주지분','지배기업의소유주지분','지배주주지분'])],
 ['IS','ifrs-full_ProfitLossAttributableToOwnersOfParent','지배기업 소유주지분 순이익',read(income,['지배기업의소유주에게귀속되는당기순이익','지배기업의소유주에게귀속되는당기순이익(손실)','지배기업소유주지분순이익'])],
 ['IS','ifrs-full_BasicEarningsLossPerShare','기본주당이익',income.some(t=>t.some(r=>r.some(c=>c.includes('우선'))))?null:read(income,['기본주당이익','기본주당순이익','기본주당이익(손실)','기본주당순이익(손실)','보통주기본주당이익'])]];
 for(const [statementDivision,accountId,accountName,value] of optional)if(value!==null)rows.push({receiptNo:report.receiptNo,corpCode,fiscalYear:year,reportCode:report.reportCode,statementDivision,statementName:statementDivision,accountId,accountName,currentAmount:value,currentYtdAmount:value,currency:'KRW'});
 const source=validateDartFiling({corpCode,taskFiscalYear:year,report,rows,fsDivision:division});
 const sha=createHash('sha256').update(html).digest('hex'),months=(new Date(end).getUTCFullYear()-new Date(start).getUTCFullYear())*12+new Date(end).getUTCMonth()-new Date(start).getUTCMonth()+1;
 const balanceDates=[...text.matchAll(new RegExp(date+'현재','g'))].map(m=>[m[1],m[2]!.padStart(2,'0'),m[3]!.padStart(2,'0')].join('-'));
 if(balanceDates[0]!==end)reject('BALANCE_DATE');
 const openingDate=new Date(Date.parse(start)-86400000).toISOString().slice(0,10),openingEquity=balanceDates[1]===openingDate?read(bs,['자본총계','자본총액'],1):null;
 const fiscalDuration:FiscalDuration={method:'DART_PUBLIC_FILING_ACCOUNTS_MATCH',receiptNo:report.receiptNo,fsDivision:division,start,end,months,sourceUrl:section!.url,contentSha256:sha,verifiedAt:new Date().toISOString(),...(openingEquity!==null?{openingDate,openingEquity}:{}),...(!start.endsWith('-01')?{annualization:'ACT_365',days}:{})};
 return {division,rows,source:{...source,sourceValidation:{...source.sourceValidation,publicDocument:{method:'DART_PUBLIC_STATEMENT_BALANCE_RECONCILED',sourceUrl:section!.url,contentSha256:sha,coverSha256:createHash('sha256').update(cover!.html).digest('hex'),fiscalDuration}}}};
}
