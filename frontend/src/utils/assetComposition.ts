export const compositionPalette=['#FA6170','#60A5FA','#34D399','#A78BFA','#FBC02D','#FB923C','#22D3EE','#94A3B8'];
export function groupedComposition(rows:{id:string;name:string;percent:number;amount?:number;purchaseAmount?:number;purchasePercent?:number}[],basis:'valuation'|'investment'='valuation'){
 const ordered=rows.filter(r=>Number.isFinite(r.percent)&&r.percent>=0).sort((a,b)=>(basis==='investment'?(b.purchasePercent??0)-(a.purchasePercent??0):b.percent-a.percent)||a.id.localeCompare(b.id));
 const count=ordered.length>6?5:6,top=ordered.slice(0,count),remaining=ordered.slice(count);
 return [...top,...(remaining.length?[{id:'other',name:'기타',percent:remaining.reduce((sum,r)=>sum+r.percent,0),amount:remaining.reduce((sum,r)=>sum+(r.amount??0),0),purchaseAmount:remaining.every(r=>Number.isFinite(r.purchaseAmount))?remaining.reduce((sum,r)=>sum+r.purchaseAmount!,0):undefined,purchasePercent:remaining.every(r=>Number.isFinite(r.purchasePercent))?remaining.reduce((sum,r)=>sum+r.purchasePercent!,0):undefined}]:[])].map((r,i)=>({...r,color:r.id==='other'?compositionPalette.at(-1)!:compositionPalette[i]!}));
}

export function compositionAmount(amount:number|undefined){
 if(amount===undefined||!Number.isFinite(amount))return '—';
 if(amount>0&&amount<10000)return '1만원 미만';
 return `${Math.round(amount/10000).toLocaleString('ko-KR')}만원`;
}
