import {createHash} from 'node:crypto';
import {Prisma,type DartFinancialFiling} from '@roxstock/shared/prisma';
import {fiscalDurationMatches,type Supplemental,type FiscalEpsReview} from '@roxstock/shared/domain/period-valuation';
import {fiscalEpsReviewMatches} from '@roxstock/shared/domain/fiscal-eps-review';

/** Review a bounded exact-receipt EPS note. Current YTD is selected by stored profit,
 * never by assuming the first numeric column represents the full reporting period. */
export function reviewPublicFiscalEps(f:DartFinancialFiling,s:Supplemental,html:string,url:string){
 if(html.length>2_000_000||!fiscalDurationMatches(f,s.fiscalDuration)||s.shares?.preferred)return;
 const accounts=s.accounts?.receiptNo===f.receiptNo&&s.accounts.fsDivision===f.fsDivision?s.accounts.sources:{},original=f.accountSources as Record<string,{amount?:string|null;ytdAmount?:string|null}>|null;
 const annual=f.periodType==='ANNUAL',profit=f.fsDivision==='CFS'?(annual?original?.parentNetIncome?.amount??accounts.parentNetIncome?.amount:original?.parentNetIncome?.ytdAmount??accounts.parentNetIncome?.ytdAmount):f.netIncomeYtd?.toString();
 if(profit==null)return;
 const plain=(v:string)=>v.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
 const label=(v:string)=>v.replace(/\s/g,'').replace(/^[가-힣]\.\s*/,'');
 const numeric=(v:string|undefined)=>{if(v==null)return null;let n=v.replace(/\s|,/g,'').replace(/원(?:\/주)?$|주$/,'');if(/^\(-\)\d/.test(n))n='-'+n.slice(3);if(/^\(\d+(?:\.\d+)?\)$/.test(n))n='-'+n.slice(1,-1);return /^-?\d+(?:\.\d+)?$/.test(n)?n:null;};
 const profits=/^(?:(?:지배회사지분|지배기업지분)(?:당기|반기)순이익(?:\(손실\))?(?:중보통주해당분)?|지배기업소유주지분순(?:이익|손익)(?:\(손실\))?|지배기업의소유주에게귀속되는당기순이익(?:\(손실\))?|지배기업의보통주에귀속되는당기순이익(?:\(손실\))?|(?:당기|분기)순이익(?:\(손실\))?|보통주보고기간순손실)$/;
 const weighted=/^(?:가중평균유통보통주식수(?:\(주\d?\)|\(\*\))?|기본주당이익계산에사용되는가중평균보통주식수)$/;
 const basic=/^(?:보통주)?기본주당(?:순)?(?:이익|손익|손실)(?:\(손실\))?$|^지배(?:회사|기업)지분기본주당이익\(다÷라\)$/;
 const found=new Map<string,{evidence:FiscalEpsReview;accounts:NonNullable<Supplemental['accounts']>}>();
 for(const m of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)){
  const text=plain(m[0]),context=plain(html.slice(Math.max(0,m.index!-500),m.index!))+text.slice(0,180);
  if(!/기본주당|기본 주당/.test(text)||!/가중평균/.test(text))continue;
  const units=[...context.matchAll(/단위\s*:\s*([^)]*)\)/g)].at(-1)?.[1]?.replace(/\s/g,'');
  if(!units||units.split(',').some(u=>!['원','주'].includes(u)))continue;
  const rows=[...m[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r=>[...r[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>plain(c[1]!)));
  for(let i=0;i<rows.length;i++){
   const row=rows[i]!;if(!profits.test(label(row[0]??'')))continue;
   const current=rows.slice(i+1),wIndex=current.findIndex(r=>weighted.test(label(r[0]??'')));if(wIndex<0)continue;
   const w=current[wIndex]!,eps=current.slice(wIndex+1).find(r=>basic.test(label(r[0]??'')));if(!eps)continue;
   // Two/four-column comparative tables put the current period first. A four-
   // value table may contain both current three-month and current YTD amounts.
   const slots=row.length===5?[1,2]:[1];
   for(const col of slots){
    const numerator=numeric(row[col]),shares=numeric(w[col]);if(numerator==null||shares==null||numerator!==profit||!/^\d+$/.test(shares)||BigInt(shares)<=0n)continue;
    const stated=numeric(eps[col]);
    // A blank explicit total formula may be calculated from its common profit.
    // Do not sum independently rounded continuing/discontinued EPS components.
    if(stated==null&&!/\(다÷라\)/.test(label(eps[0]??'')))continue;
    const value=stated??new Prisma.Decimal(numerator).div(shares).toDecimalPlaces(4).toString();
    const evidence:FiscalEpsReview={method:'DART_PUBLIC_FISCAL_EPS_RECONCILED',receiptNo:f.receiptNo,fsDivision:f.fsDivision,start:s.fiscalDuration.start,end:s.fiscalDuration.end,profit:numerator,weightedShares:shares,eps:value,calculated:stated==null,sourceUrl:url,contentSha256:createHash('sha256').update(html).digest('hex')};
    const existing=annual?original?.basicEps?.amount??accounts.basicEps?.amount:original?.basicEps?.ytdAmount??accounts.basicEps?.ytdAmount;
    if(existing!=null&&!new Prisma.Decimal(existing).eq(value))continue;
    const proposed={receiptNo:f.receiptNo,fsDivision:f.fsDivision,collectedAt:new Date().toISOString(),sources:{...accounts,basicEps:{...accounts.basicEps,...(annual?{amount:value}:{}),ytdAmount:value,ordinaryEpsVerified:true,calculatedFromWeightedShares:evidence.calculated}}};
    if(fiscalEpsReviewMatches(f,{...s,accounts:proposed},evidence))found.set([value,shares,numerator].join(':'),{evidence,accounts:proposed});
   }
  }
 }
 return found.size===1?[...found.values()][0]:undefined;
}
