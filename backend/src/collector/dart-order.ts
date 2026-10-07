export function collectionPasses<T extends {id:bigint}>(priority:T[],regular:T[],currentYear:number){
 const ids=new Set(priority.map(s=>String(s.id)));
 const years=Array.from({length:Math.max(0,currentYear-2015+1)},(_,i)=>currentYear-i);
 return [{items:priority,priority:true},{items:regular.filter(s=>!ids.has(String(s.id))),priority:false}].flatMap(group=>years.map(year=>({...group,year})));
}
