import {createHash} from 'node:crypto';
import type {DartFinancialFiling} from '@roxstock/shared/prisma';
import type {Supplemental,OrdinaryEpsBasis} from '@roxstock/shared/domain/period-valuation';
import {ordinaryEpsBasisMatches} from '@roxstock/shared/domain/ordinary-eps-basis';
/** Offline review of a receipt's explicit current-period EPS calculation table. */
export function reviewPublicOrdinaryEps(f:DartFinancialFiling,s:Supplemental,html:string,url:string):OrdinaryEpsBasis|undefined {
 if(html.length>2_000_000)return;
 const plain=(v:string)=>v.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
 const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].filter(m=>/가중평균유통보통주식수/.test(plain(m[0]).replace(/\s/g,''))&&/기본주당(?:순)?(?:이익|손익)/.test(plain(m[0])));
 const proofs:OrdinaryEpsBasis[]=[];
 for(const match of tables){
  const table=match[0],text=plain(table);
  const context=plain(html.slice(Math.max(0,match.index!-300),match.index!))+text.slice(0,180),units=[...context.matchAll(/단위\s*:\s*([^)]*)\)/g)].at(-1)?.[1]?.replace(/\s/g,'');
  if(!/당\s*기/.test(context)||/천주|백만주/.test(units??''))continue;
  const wonUnits=units==='원'||units==='원,주';
  const rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>plain(c[1]!)));
  const find=(label:RegExp)=>{const r=rows.filter(row=>label.test((row[0]??'').replace(/\s/g,'')));return r.length===1?r[0]?.[1]:undefined;};
  const owned=/^(?:지배기업소유주지분보통주당기순이익|지배기업소유주지분순이익|지배지분귀속보통주당기순손익|지배주주보통주당기순이익|보통주연결당기순이익|보통주당기순이익|보통주지배기업소유주지분순이익)(?:\(손실\))?$/;
  const weighted=find(/^가중평균유통보통주식수(?:\(주\)|\(\*\))?$/),eps=find(/^(?:보통주)?기본주당(?:순)?(?:이익|손익)(?:\(손실\))?$/),profit=find(owned)??find(/^당기순이익(?:\(손실\))?$/);
  if(!weighted||!eps||!profit||!/^\d[\d,]*주?$/.test(weighted)||!(/^-?\d[\d,]*(?:\.\d+)?(?:원(?:\/주)?)?$/).test(eps)||!(/^-?\d[\d,]*원?$/).test(profit)||!eps.includes('원')&&!wonUnits||!profit.endsWith('원')&&!wonUnits)continue;
  const evidence:OrdinaryEpsBasis={method:'DART_WEIGHTED_ORDINARY_SHARES_EQUAL_PERIOD_END',receiptNo:f.receiptNo,fsDivision:f.fsDivision,periodEnd:f.periodEndDate.toISOString().slice(0,10),weightedShares:weighted.replace(/,|주/g,''),disclosedEps:eps.replace(/,|원(?:\/주)?/g,''),profit:profit.replace(/,|원/g,''),sourceUrl:url,contentSha256:createHash('sha256').update(html).digest('hex')};
  const original=f.accountSources as Record<string,{amount?:string|null}>|null,accounts=s.accounts?.receiptNo===f.receiptNo&&s.accounts.fsDivision===f.fsDivision?s.accounts.sources:{};
  const sources={...accounts};
  if(original?.basicEps?.amount==null&&sources.basicEps?.amount==null)sources.basicEps={amount:evidence.disclosedEps,ordinaryEpsVerified:true};
  // Only explicit owner-profit labels can recover a missing CFS owner figure,
  // and only when the stored total profit independently agrees with that figure.
  if(f.fsDivision==='CFS'&&original?.parentNetIncome?.amount==null&&sources.parentNetIncome?.amount==null&&find(owned)&&f.netIncomeYtd?.toString()===evidence.profit)sources.parentNetIncome={amount:evidence.profit};
  const candidate={...s,accounts:{receiptNo:f.receiptNo,fsDivision:f.fsDivision,collectedAt:s.accounts?.collectedAt??new Date().toISOString(),sources}};
  if(ordinaryEpsBasisMatches(f,candidate,evidence))proofs.push(evidence);
 }
 return proofs.length===1?proofs[0]:undefined;
}
