import {Prisma} from '../generated/prisma/index.js';
export const analysisSortKeys=['name','w','currentPrice','targetPrice','value','eps','epsYield','priceUpdatedAt','issuedShares','roe','capital','netIncome'] as const;
export type AnalysisSort={key:typeof analysisSortKeys[number];direction:'asc'|'desc'};
export function parseAnalysisSort(value?:string,legacyKey='w',legacyDirection='desc'):AnalysisSort[]{
 const input=value===undefined?`${legacyKey}:${legacyDirection}`:value;
 if(!input)return [];
 const seen=new Set<string>();
 return input.split(',').map(part=>{
  const [key='',direction='',...extra]=part.split(':');
  if(extra.length||!analysisSortKeys.includes(key as AnalysisSort['key'])||!['asc','desc'].includes(direction)||seen.has(key))throw new Error('INVALID_ANALYSIS_SORT');
  seen.add(key);return {key,direction} as AnalysisSort;
 });
}
export function sortAnalysisRows<T extends {symbol:string;id:string}>(rows:T[],sorts:AnalysisSort[]):T[]{
 return [...rows].sort((a,b)=>{
  for(const {key,direction} of sorts){
   const left=(a as Record<string,unknown>)[key],right=(b as Record<string,unknown>)[key];
   const missing=(v:unknown)=>v==null||v==='';
   if(missing(left)!==missing(right))return missing(left)?1:-1;
   if(missing(left))continue;
   if(['eps','capital','netIncome'].includes(key)){
    const currency=(row:T)=>{const r=row as Record<string,any>;return (key==='capital'?r.capitalBasis?.unit:key==='netIncome'?r.netIncomeBasis?.unit:r.metricBasis?.currency)??'KRW';};
    const group=currency(a).localeCompare(currency(b));if(group)return group;
   }
   const c=key==='name'||key==='priceUpdatedAt'?String(left).localeCompare(String(right),'ko'):new Prisma.Decimal(String(left)).cmp(String(right));
   if(c)return direction==='asc'?c:-c;
  }
  return a.symbol.localeCompare(b.symbol)||a.id.localeCompare(b.id);
 });
}
