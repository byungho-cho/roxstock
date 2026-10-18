import {createHash} from 'node:crypto';
import {Prisma,type DartFinancialFiling} from '@roxstock/shared/prisma';
import {fiscalDurationMatches,type Supplemental} from '@roxstock/shared/domain/period-valuation';
/** Read adjacent comparative capital from the actual statement, not a calendar-year guess. */
export function reviewPublicOpeningCapital(f:DartFinancialFiling,s:Supplemental,html:string,url:string){
 let source:URL;try{source=new URL(url);}catch{return;}
 if(html.length>2_000_000||source.origin!=='https://dart.fss.or.kr'||source.pathname!=='/report/viewer.do'||source.searchParams.get('rcpNo')!==f.receiptNo)return;
 const plain=(v:string)=>v.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim(),text=plain(html);
 const bs=/재무상태표/.exec(text),flow=/(?:포괄)?손익계산서/.exec(text);if(!bs||!flow||flow.index<=bs.index)return;
 const balance=text.slice(bs.index,flow.index),income=text.slice(flow.index),unit=/단위\s*:\s*(백만원|천원|원)\)/.exec(balance),scale=unit?.[1]==='백만원'?1000000:unit?.[1]==='천원'?1000:unit?.[1]==='원'?1:null;if(!scale)return;
 const dates=[...balance.matchAll(/(\d{4})\.(\d{1,2})\.(\d{1,2})\s*현재/g)].map(m=>`${m[1]}-${m[2]!.padStart(2,'0')}-${m[3]!.padStart(2,'0')}`);
 const end=f.periodEndDate.toISOString().slice(0,10);if(dates[0]!==end||!dates[1])return;
 const range=/(\d{4}\.\d{2}\.\d{2}) 부터 (\d{4}\.\d{2}\.\d{2}) 까지/.exec(income),verified=fiscalDurationMatches(f,s.fiscalDuration);
 const start=verified?s.fiscalDuration!.start:range?.[2]?.replaceAll('.','-')===end?range[1]!.replaceAll('.','-'):undefined;
 if(!start||!verified&&f.periodType!=='ANNUAL')return;
 const openingDate=new Date(Date.parse(start)-86400000).toISOString().slice(0,10);if(dates[1]!==openingDate)return;
 const balanceHtml=html.slice(0,html.indexOf('손익계산서'));
 const balanceRows=[...balanceHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r=>[...r[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>plain(c[1]!)));
 const read=(labels:string[])=>{const rows=balanceRows.filter(r=>labels.includes(r[0]??''));if(rows.length!==1)return;const values=rows[0]!.slice(1,3);if(values.length!==2||values.some(v=>!/^\(?-?[\d,]+\)?$/.test(v)))return;return values.map(v=>new Prisma.Decimal(v.replaceAll(',','').replace(/^\((.*)\)$/,'-$1')).mul(scale));};
 const assets=read(['자산총계']),liabilities=read(['부채총계']),equity=read(['자본총계']),parent=read(['지배기업의 소유주에게 귀속되는 자본','지배기업 소유주지분','지배기업소유주지분','지배기업의 소유주지분','지배기업의 소유지분','지배주주지분']);
 if(!assets||!liabilities||!equity||[0,1].some(i=>!assets[i]!.minus(liabilities[i]!).eq(equity[i]!)))return;
 for(const [stored,observed]of [[f.totalAssets,assets[0]],[f.totalLiabilities,liabilities[0]],[f.totalEquity,equity[0]]] as const)if(stored!=null&&!stored.eq(observed!))return;
 const original=f.accountSources as Record<string,{amount?:string|null}>|null,accounts=s.accounts?.receiptNo===f.receiptNo&&s.accounts.fsDivision===f.fsDivision?s.accounts.sources:{};
 const owner=original?.parentEquity?.amount??accounts.parentEquity?.amount;
 if(f.fsDivision==='CFS'&&(!parent||owner==null||!parent[0]!.eq(owner)))return;
 if(f.fsDivision==='OFS'&&f.totalEquity==null)return;
 return {openingDate,openingTotalEquity:equity[1]!.toString(),...(parent?{openingParentEquity:parent[1]!.toString()}:{}),review:{method:'DART_PUBLIC_ADJACENT_CAPITAL_RECONCILED' as const,receiptNo:f.receiptNo,fsDivision:f.fsDivision,start,end,openingDate,openingTotalEquity:equity[1]!.toString(),closingTotalEquity:equity[0]!.toString(),...(parent?{openingParentEquity:parent[1]!.toString(),closingParentEquity:parent[0]!.toString()}:{}),sourceUrl:url,contentSha256:createHash('sha256').update(html).digest('hex')}};
}
