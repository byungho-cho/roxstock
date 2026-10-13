/** Preserve the entry order; a singleton never navigates or prefetches itself. */
export function circularNeighbors<T extends {id:string}>(items:T[],id:string|null) {
  const unique=[...new Map(items.map(item=>[item.id,item])).values()];
  const index=unique.findIndex(item=>item.id===id),count=unique.length;
  if(index<0||count<2)return {previous:undefined,next:undefined};
  return {previous:unique[(index+count-1)%count],next:unique[(index+1)%count]};
}
