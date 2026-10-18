import {createHash} from 'node:crypto';
import {Prisma,type DartFinancialFiling} from '@roxstock/shared/prisma';
import type {Supplemental,FiscalDuration} from '@roxstock/shared/domain/period-valuation';
/** Manually retrieved official receipt section; no script execution or inferred dates. */
export function reviewPublicFilingPeriod(f:DartFinancialFiling,html:string,url:string):Supplemental|undefined {
 const source=new URL(url);if(!['ANNUAL','Q1'].includes(f.periodType)||!['CFS','OFS'].includes(f.fsDivision)||source.origin!=='https://dart.fss.or.kr'||source.pathname!=='/report/viewer.do'||source.searchParams.get('rcpNo')!==f.receiptNo||html.length>2_000_000)return;
 const plain=html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ');
 const prefix=f.fsDivision==='CFS'?'연결 ':'';
 const incomeAt=plain.indexOf(prefix+'포괄손익계산서'),balanceAt=plain.indexOf(prefix+'재무상태표'),endAt=plain.indexOf(prefix+'자본변동표',incomeAt);
 if(balanceAt<0||incomeAt<=balanceAt||endAt<=incomeAt)return;
 const balance=plain.slice(balanceAt,incomeAt),income=plain.slice(incomeAt,endAt);
 if(!/단위\s*:\s*원/.test(balance)||!/단위\s*:\s*원/.test(income))return;
 const range=/제\s*\d+\s*기\s*(?:1분기\s*)?(\d{4}\.\d{2}\.\d{2})\s*부터\s*(\d{4}\.\d{2}\.\d{2})\s*까지/.exec(income);
 if(!range)return;const start=range[1]!.replaceAll('.','-'),end=range[2]!.replaceAll('.','-');
 if(end!==f.periodEndDate.toISOString().slice(0,10)||!Number.isFinite(Date.parse(start))||new Date(start).toISOString().slice(0,10)!==start||start>end)return;
 const dates=[...balance.matchAll(/제\s*\d+\s*기\s*(?:1분기말|말)?\s*(\d{4}\.\d{2}\.\d{2})\s*현재/g)].map(m=>m[1]!.replaceAll('.','-'));if(dates[0]!==end)return;
 const read=(section:string,label:string)=>{const m=new RegExp('(?:^| )'+label+'\\s+(\\(?-?[\\d,]+(?:\\.\\d+)?\\)?)\\s+(\\(?-?[\\d,]+(?:\\.\\d+)?\\)?)').exec(section.replace(/\(단위\s*:\s*원\)/g,' '));return m?.slice(1).map(v=>v.replaceAll(',','').replace(/^\((.*)\)$/,'-$1'));};
 const equity=read(balance,'자본총계'),revenue=read(income,'(?:영업수익|매출액)'),operating=read(income,'영업이익(?:\\(손실\\))?'),profit=read(income,'당기순이익(?:\\(손실\\))?');
 if(!equity||!revenue||!operating||!profit||f.totalEquity==null||equity[0]!==f.totalEquity.toString())return;
 // Q1 has identical three-month and YTD columns. Other quarters need a separate selector.
 if(f.periodType==='Q1'&&(!/3개월 누적 3개월 누적/.test(income)||[revenue,operating,profit].some(v=>v[0]!==v[1])))return;
 let matchedFlows=0;
 for(const [stored,parsed] of [[f.revenueYtd,revenue[0]],[f.operatingProfitYtd,operating[0]],[f.netIncomeYtd,profit[0]]] as const){if(stored!=null){if(parsed!==stored.toString())return;matchedFlows++;}}
 if(matchedFlows<2){
  const assets=read(balance,'자산총계'),liabilities=read(balance,'부채총계');
  if(f.totalAssets==null||f.totalLiabilities==null||assets?.[0]!==f.totalAssets.toString()||liabilities?.[0]!==f.totalLiabilities.toString()||!new Prisma.Decimal(assets[0]!).eq(new Prisma.Decimal(equity[0]!).plus(liabilities[0]!)))return;
 }
 const openingDate=new Date(Date.parse(start)-86400000).toISOString().slice(0,10),adjacent=dates[1]===openingDate;
 const parent=read(balance,'지배기업 소유주지분'),parentProfit=read(income,'지배기업 소유주지분');
 const months=(new Date(end).getUTCFullYear()-new Date(start).getUTCFullYear())*12+new Date(end).getUTCMonth()-new Date(start).getUTCMonth()+1,days=(Date.parse(end)-Date.parse(start))/86400000+1;
 if(months<1||months>12||days>366)return;
 if(f.periodType==='Q1'&&months!==3)return;
 const fiscalDuration:FiscalDuration={method:'DART_PUBLIC_FILING_ACCOUNTS_MATCH',receiptNo:f.receiptNo,fsDivision:f.fsDivision,start,end,months,sourceUrl:url,contentSha256:createHash('sha256').update(html).digest('hex'),verifiedAt:new Date().toISOString(),...(!start.endsWith('-01')?{annualization:'ACT_365',days}:{}),...(adjacent?{openingDate,openingEquity:equity[1],...(parent?{openingParentEquity:parent[1]}:{})}:{})};
 const sources:NonNullable<Supplemental['accounts']>['sources']={revenue:{amount:revenue[0],ytdAmount:revenue[0]},operatingProfit:{amount:operating[0],ytdAmount:operating[0]},netIncome:{amount:profit[0],ytdAmount:profit[0]}};
 if(parent)sources.parentEquity={amount:parent[0]};if(parentProfit)sources.parentNetIncome={amount:parentProfit[0],ytdAmount:parentProfit[0]};
 const eps=/(?:^| )기본주당이익(?:\(손실\))?\s+(-?[\d,]+)/.exec(income.replace(/\(단위\s*:\s*원\)/g,' '));if(eps&&!income.includes('우선'))sources.basicEps={amount:eps[1]!.replaceAll(',',''),ytdAmount:eps[1]!.replaceAll(',',''),ordinaryEpsVerified:true};
 return {fiscalDuration,accounts:{receiptNo:f.receiptNo,fsDivision:f.fsDivision,collectedAt:new Date().toISOString(),sources}};
}
