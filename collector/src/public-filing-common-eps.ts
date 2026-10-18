import {createHash} from 'node:crypto';
import {Prisma,type DartFinancialFiling} from '@roxstock/shared/prisma';
import type {Supplemental,CommonEpsReview} from '@roxstock/shared/domain/period-valuation';
import {commonEpsReviewMatches} from '@roxstock/shared/domain/common-eps-review';
type Selector={labels:string[];after?:string;before?:string};
export type CommonEpsLayout={parent:Selector|Selector[];common:Selector|Selector[];weighted:Selector;eps?:Selector;money:'원'|'천원'|'백만원';shares:'주'|'천주';allowOneWonRounding?:boolean};
/** Explicitly reviewed row layout; no company-specific figures or network fetches. */
export function reviewPublicCommonEps(f:DartFinancialFiling,s:Supplemental,html:string,url:string,layout:CommonEpsLayout){
 if(html.length>2_000_000||f.periodType!=='ANNUAL'||f.periodEndDate.toISOString().slice(0,10)!==`${f.fiscalYear}-12-31`)return;
 const source=f.accountSources as Record<string,{amount?:string|null}>|null,a=s.accounts?.receiptNo===f.receiptNo&&s.accounts.fsDivision===f.fsDivision?s.accounts.sources:{};
 const parent=f.fsDivision==='CFS'?source?.parentNetIncome?.amount??a.parentNetIncome?.amount:f.netIncomeYtd?.toString();if(parent==null)return;
 const plain=(v:string)=>v.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
 const key=(v:string)=>v.replace(/\s/g,'').replace(/[<>÷]/g,'').replace(/\([^)]*\)/g,'');
 const result=new Map<string,{review:CommonEpsReview;accounts:NonNullable<Supplemental['accounts']>}>();
 const moneyScale=layout.money==='백만원'?1000000:layout.money==='천원'?1000:1,shareScale=layout.shares==='천주'?1000:1;
 for(const match of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)){
  if(match[0].length>100000)continue;
  const text=plain(match[0]),context=plain(html.slice(Math.max(0,match.index!-500),match.index!))+text.slice(0,200);
  if(!/주당|보통주/.test(context)||!/가중평균/.test(text))continue;
  const prefix=plain(html.slice(Math.max(0,match.index!-500),match.index!));
  const units=(/단위\s*:\s*([^)]*)\)/.exec(text.slice(0,80))?.[1]??[...prefix.matchAll(/단위\s*:\s*([^)]*)\)/g)].at(-1)?.[1])?.replace(/\s/g,'').split(',')??[];
  const rows=[...match[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r=>[...r[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>plain(c[1]!)));
  const read=(selector:Selector,unit:string,scale:number)=>{
   const start=selector.after?rows.findIndex(r=>key(r[0]??'')===key(selector.after!))+1:0;if(selector.after&&start===0)return;
   const stop=selector.before?rows.findIndex((r,i)=>i>=start&&key(r[0]??'')===key(selector.before!)):rows.length;if(stop<start)return;
   const candidates=rows.slice(start,stop).filter(r=>selector.labels.some(label=>key(label)===key(r[0]??''))).map(r=>({label:r[0]!,value:r[1]})).filter(r=>r.value!=null&&r.value!=='');
   const values=new Map<string,Prisma.Decimal>();
   for(const row of candidates){
    const literal=row.value!.replace(/\s|,/g,''),suffix=/백만원|천원|천주|원|주/.exec(literal)?.[0];
    if(suffix?suffix!==unit:!units.includes(unit)&&!row.label.includes(unit))continue;
    const numeric=literal.replace(/백만원|천원|천주|원(?:\/주)?|주/g,'').replace(/^\((.*)\)$/,'-$1');
    if(!/^-?\d+(\.\d+)?$/.test(numeric))continue;
    const value=new Prisma.Decimal(numeric).mul(scale);values.set(value.toString(),value);
   }
   return values.size===1?[...values.values()][0]:undefined;
  };
  const sum=(selectors:Selector|Selector[])=>{let total=new Prisma.Decimal(0);for(const selector of Array.isArray(selectors)?selectors:[selectors]){const v=read(selector,layout.money,moneyScale);if(v==null)return;total=total.plus(v);}return total;};
  const reported=sum(layout.parent),common=sum(layout.common),weighted=read(layout.weighted,layout.shares,shareScale),stated=layout.eps?read(layout.eps,'원',1):undefined;
  if(!reported||!common||!weighted||weighted.lte(0)||!weighted.isInteger()||layout.eps&&stated==null)continue;
  if(s.shares?.preferred&&JSON.stringify(layout.parent)===JSON.stringify(layout.common))continue;
  const parentRows=Array.isArray(layout.parent)?layout.parent.length:1;if(parentRows>2)continue;
  const tolerance=new Prisma.Decimal(moneyScale).mul(parentRows).div(2);if(new Prisma.Decimal(parent).minus(reported).abs().gt(tolerance))continue;
  const commonProfit=!s.shares?.preferred&&common.eq(reported)?new Prisma.Decimal(parent):common,eps=stated??commonProfit.div(weighted).toDecimalPlaces(4);
  const review:CommonEpsReview={method:'DART_PUBLIC_COMMON_EPS_RECONCILED',receiptNo:f.receiptNo,fsDivision:f.fsDivision,fiscalYear:f.fiscalYear,periodEnd:f.periodEndDate.toISOString().slice(0,10),parentProfit:parent,reportedParentProfit:reported.toString(),parentTolerance:tolerance.toString(),commonProfit:commonProfit.toString(),weightedShares:weighted.toString(),eps:eps.toString(),calculated:stated==null,sourceUrl:url,contentSha256:createHash('sha256').update(html).digest('hex')};
  if(layout.allowOneWonRounding&&stated?.isInteger()){review.disclosedRoundingTolerance='1';review.arithmeticDifference=commonProfit.div(weighted).minus(stated).abs().toString();}
  const accounts={receiptNo:f.receiptNo,fsDivision:f.fsDivision,collectedAt:new Date().toISOString(),sources:{...a,basicEps:{amount:review.eps,ytdAmount:review.eps,ordinaryEpsVerified:true,calculatedFromWeightedShares:review.calculated}}};
  if(commonEpsReviewMatches(f,{...s,accounts,commonEpsReview:review}))result.set([review.eps,review.commonProfit,review.weightedShares].join(':'),{review,accounts});
 }
 return result.size===1?[...result.values()][0]:undefined;
}
