import {createHash} from 'node:crypto';
const compact = v => v.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s/g,'');
const label = v => v.replace(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVX]+[.．]?/,'').replace(/\(주석[^)]*\)|\(주\d[^)]*\)/g,'');
const categories = new Map([['자본금','capital'],['자본잉여금','surplus'],['주식발행초과금','surplus'],['자본조정','other'],['기타자본','other'],['기타자본항목','other'],['기타자본구성요소','other'],['자기주식','other'],['기타포괄손익누계액','oci'],['이익잉여금','retained'],['이익잉여금(결손금)','retained'],['결손금','retained']]);
/** Exact receipt, dated current/prior columns and independently reconciled balance totals. */
export function verifiedOwnerCapital(identity,html,url) {
  let u;try{u=new URL(url);}catch{return null;}
  const day=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
  if (identity.currency!=='KRW'||identity.fsDivision!=='CFS'||!/^\d{14}$/.test(identity.receiptNo)||!day(identity.start)||!day(identity.end)||identity.start>identity.end||(Date.parse(identity.end)-Date.parse(identity.start))/86400000>365||html.length>2000000||u.username||u.password||u.origin!=='https://dart.fss.or.kr'||u.pathname!=='/report/viewer.do'||u.searchParams.get('rcpNo')!==identity.receiptNo) return null;
  const text=compact(html);if(!/연결재무제표|연결재무상태표/.test(text.slice(0,1000)))return null;
  const dates=[...text.matchAll(/(\d{4})(?:년|\.)(\d{1,2})(?:월|\.)(\d{1,2})(?:일)?현재/g)].map(m=>`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
  const openingDate=new Date(Date.parse(identity.start)-86400000).toISOString().slice(0,10);
  if(dates[0]!==identity.end||dates[1]!==openingDate)return null;
  const term=text.match(/제(\d+)(?:\([^)]*\))?기(?:말)?\d{4}(?:년|\.)\d{1,2}(?:월|\.)\d{1,2}(?:일)?현재/)?.[1];if(!term)return null;
  const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];if(tables.length>64)return null;
  for(const t of tables){
    const rows=[...t[0].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r=>[...r[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)].flatMap(c=>Array(Math.min(30,Number(c[1].match(/colspan=["']?(\d+)/i)?.[1]??1))).fill(compact(c[2]))));
    if(rows.length>512||rows.some(r=>r.length>128))return null;
    const unique = name => rows.filter(r=>label(r[0]??'')===name);
    if(unique('자산총계').length!==1||unique('부채총계').length!==1||unique('자본총계').length!==1)continue;
    const unit=[...compact(html.slice(0,t.index)).matchAll(/단위[:：](원|천원|백만원)[)）]/g)].at(-1)?.[1],scale=unit==='원'?1n:unit==='천원'?1000n:unit==='백만원'?1000000n:null;if(!scale)return null;
    const head=rows.find(r=>r.some(c=>/^제\d+/.test(c)));if(!head)return null;
    const first=head.findIndex(c=>/^제\d+/.test(c));if(head[first].match(/^제(\d+)/)?.[1]!==term)return null;
    const columns=[];let at=first;for(let i=0;i<2;i++){let next=at+1;while(next<head.length&&head[next]===head[at])next++;columns.push([at,next]);at=next;}if(at>head.length)return null;
    const number=(row,index,dash=false)=>{const [start,end]=columns[index],cells=[...new Set(row.slice(start,end).filter(c=>c!==''))];if(cells.length!==1)return null;let value=cells[0];if(value==='-'&&dash)return 0n;value=value.replaceAll(',','').replace(/^\((\d+)\)$/,'-$1');return /^-?\d+$/.test(value)?BigInt(value)*scale:null;};
    const amount=(name,index)=>number(unique(name)[0],index),e=[0,1].map(i=>amount('자본총계',i)),a=[0,1].map(i=>amount('자산총계',i)),l=[0,1].map(i=>amount('부채총계',i));
    if([...e,...a,...l].some(v=>v===null)||[0,1].some(i=>a[i]!==l[i]+e[i]))return null;
    if(![identity.assets,identity.liabilities,identity.equity].every(v=>/^-?\d+$/.test(v??''))||a[0]!==BigInt(identity.assets)||l[0]!==BigInt(identity.liabilities)||e[0]!==BigInt(identity.equity))return null;
    const owners=rows.map((r,i)=>({r,i})).filter(x=>['지배기업의소유주에게귀속되는자본','지배기업소유주지분','지배기업의소유주지분','지배주주지분'].includes(label(x.r[0]??'')));if(owners.length!==1)return null;
    const owner=owners[0],end=rows.findIndex((r,i)=>i>owner.i&&/^(비지배지분|비지배주주지분|자본총계)$/.test(label(r[0]??'')));if(end<0)return null;
    let values=[number(owner.r,0),number(owner.r,1)],method='EXPLICIT_OWNER_CAPITAL',components=[];
    if(values.some(v=>v===null)){
      const group=rows.slice(owner.i+1,end),seen=new Set();if(group.length<2)return null;
      for(const r of group){const name=label(r[0]??''),category=categories.get(name);if(!category||seen.has(category))return null;seen.add(category);const curr=number(r,0,true),prev=number(r,1,true);if(curr===null||prev===null)return null;components.push({label:name,current:curr.toString(),opening:prev.toString()});}
      values=[0,1].map(i=>components.reduce((sum,r)=>sum+BigInt(i===0?r.current:r.opening),0n));method='DECLARED_OWNER_COMPONENTS_SUM';
    }
    const nci=rows.filter(r=>/^(비지배지분|비지배주주지분)$/.test(label(r[0]??'')));if(nci.length>1)return null;
    // A dash is accepted only when the separately summed owner components equal total equity.
    const n=[0,1].map(i=>nci.length?number(nci[0],i,true):0n);if(n.some(v=>v===null)||[0,1].some(i=>values[i]+n[i]!==e[i]))return null;
    return {method:'DART_PUBLIC_OWNER_CAPITAL_COMPONENTS_RECONCILED',calculation:method,receiptNo:identity.receiptNo,start:identity.start,end:identity.end,openingDate,current:values[0].toString(),opening:values[1].toString(),totalEquity:e[0].toString(),openingTotalEquity:e[1].toString(),nonControlling:n[0].toString(),unit,components,sourceUrl:url,contentSha256:createHash('sha256').update(html).digest('hex')};
  }
  return null;
}
