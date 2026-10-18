import {createHash} from 'node:crypto';
import type {PeriodShares} from '@roxstock/shared/domain/share-counts';

/** Explicit common/preferred/total columns, reconciled within one dated disclosure. */
export function reviewPublicShareTotals(f:{receiptNo:string;periodEndDate:Date},html:string,url:string):PeriodShares|undefined {
 let source:URL;try{source=new URL(url);}catch{return;}
 if(source.origin!=='https://dart.fss.or.kr'||source.pathname!=='/report/viewer.do'||source.searchParams.get('rcpNo')!==f.receiptNo||html.length>2_000_000)return;
 const plain=(s:string)=>s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
 const text=plain(html),date=/기준일\s*:\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/.exec(text.slice(0,500)),end=f.periodEndDate.toISOString().slice(0,10);
 const units=/단위\s*:\s*([^)]*)\)/.exec(text.slice(0,500));
 if(!date||`${date[1]}-${date[2]!.padStart(2,'0')}-${date[3]!.padStart(2,'0')}`!==end||!text.slice(0,500).includes('주식의 총수')||!units||!/^주(?:,\s*%)?$/.test(units[1]!.trim()))return;
 const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(m=>m[0]).filter(t=>/유통주식수/.test(t)&&/발행주식의 총수/.test(t));
 if(tables.length!==1)return;
 const preferredColumn=/보통주 우선주 합계/.test(plain(tables[0]!)),emptyColumn=/보통주 - 합계/.test(plain(tables[0]!));
 if(!preferredColumn&&!emptyColumn)return;
 const rows=[...tables[0]!.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>plain(c[1]!)));
 const read=(label:RegExp)=>{const found=rows.filter(r=>label.test(r[0]??''));if(found.length!==1)return;const cells=found[0]!.slice(1,4);if(cells.length!==3||cells.some(v=>!/^\d[\d,]*$|^-$/.test(v)))return;return cells.map(v=>BigInt(v==='-'?'0':v.replaceAll(',','')));};
 const issued=read(/^Ⅳ\.\s*발행주식의 총수/),treasury=read(/^Ⅴ\.\s*자기주식수/),outstanding=read(/^Ⅵ\.\s*유통주식수/);
 if(!issued||!treasury||!outstanding||outstanding[0]!<=0n||outstanding[2]!<=0n)return;
 // An unnamed class is accepted only when every quantity is explicitly zero.
 if(emptyColumn&&[issued,treasury,outstanding].some(r=>r[1]!==0n))return;
 for(let i=0;i<3;i++)if((issued[i]! - treasury[i]!)!==outstanding[i])return;
 for(const r of [issued,treasury,outstanding])if((r[0]!+r[1]!)!==r[2])return;
 return {receiptNo:f.receiptNo,collectedAt:new Date().toISOString(),outstanding:outstanding[0]!.toString(),issuedShares:issued[0]!.toString(),treasuryShares:treasury[0]!.toString(),preferred:outstanding[1]!>0n,
  notesEvidence:{method:'DART_PUBLIC_SHARE_TABLE_RECONCILED',sourceUrl:url,contentSha256:createHash('sha256').update(html).digest('hex'),periodEnd:end},
  rows:['보통주',preferredColumn?'우선주':'-','합계'].map((stockKind,i)=>({stockKind,shareClass:['COMMON',preferredColumn?'PREFERRED':'OTHER','TOTAL'][i]!,issuedShares:issued[i]!.toString(),treasuryShares:treasury[i]!.toString(),outstandingShares:outstanding[i]!.toString(),periodEndDate:end}))};
}

/** Parse an explicitly reviewed, exact-receipt notes section, without fetching it. */
export function reviewPublicFilingShares(f:{receiptNo:string;periodEndDate:Date;fsDivision:string},html:string,url:string):PeriodShares|undefined {
 let source:URL;try{source=new URL(url);}catch{return;}
 if(source.origin!=='https://dart.fss.or.kr'||source.pathname!=='/report/viewer.do'||source.searchParams.get('rcpNo')!==f.receiptNo||html.length>2_000_000)return;
 const plain=(s:string)=>s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ').trim();
 const text=plain(html),title=f.fsDivision==='CFS'?'연결재무제표 주석':'재무제표 주석';
 if(!text.slice(0,100).includes(title))return;
 const date=/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*현재/.exec(text.slice(0,250));
 const end=f.periodEndDate.toISOString().slice(0,10);
 if(!date||`${date[1]}-${date[2]!.padStart(2,'0')}-${date[3]!.padStart(2,'0')}`!==end)return;
 const marker=/지배기업의\s*유통주식수는 다음과 같습니다\./.exec(text);
 if(!marker)return;
 const capital=text.slice(Math.max(0,marker.index-3000),marker.index);
 if(!/보통주\s*발행주식수/.test(capital)||/우선주/.test(capital))return;
 const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(m=>plain(m[0]));
 const expected=/^\(단위:\s*주\) 구 분 당분기말 전기말 (상장주식수|발행주식수) 자기주식 유통주식수 \1 자기주식 유통주식수 \1 ([\d,]+) ([\d,]+) ([\d,]+) ([\d,]+) ([\d,]+) ([\d,]+)$/;
 const matches=tables.map(t=>expected.exec(t)).filter(m=>m!==null);
 if(matches.length!==1)return;
 const m=matches[0]!,numbers=m.slice(2).map(s=>BigInt(s.replaceAll(',','')));
 if(numbers[0]!<=0n||numbers[2]!<=0n||(numbers[0]! - numbers[1]!)!==numbers[2]!||(numbers[3]! - numbers[4]!)!==numbers[5]!)return;
 // A listed total may differ from legal issued capital after profit cancellation.
 // Keep issued shares unknown rather than relabeling the first column.
 const outstanding=numbers[2]!.toString(),treasury=numbers[1]!.toString();
 return {receiptNo:f.receiptNo,collectedAt:new Date().toISOString(),outstanding,issuedShares:null,treasuryShares:treasury,preferred:false,
  notesEvidence:{method:'DART_PUBLIC_NOTES_OUTSTANDING_RECONCILED',sourceUrl:url,contentSha256:createHash('sha256').update(html).digest('hex'),periodEnd:end},
  rows:[{stockKind:'보통주',shareClass:'COMMON',issuedShares:null,treasuryShares:treasury,outstandingShares:outstanding,periodEndDate:end}]};
}
