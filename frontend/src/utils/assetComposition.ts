export const compositionPalette=['#FA6170','#60A5FA','#34D399','#A78BFA','#FBC02D','#FB923C','#22D3EE','#94A3B8'];
export function groupedComposition(rows:{id:string;name:string;percent:number}[]){
 const ordered=rows.filter(r=>Number.isFinite(r.percent)&&r.percent>0).sort((a,b)=>b.percent-a.percent||a.id.localeCompare(b.id));
 const top=ordered.slice(0,7),remaining=ordered.slice(7);
 return [...top,...(remaining.length?[{id:'other',name:'기타',percent:remaining.reduce((sum,r)=>sum+r.percent,0)}]:[])].map((r,i)=>({...r,color:compositionPalette[i]!}));
}
