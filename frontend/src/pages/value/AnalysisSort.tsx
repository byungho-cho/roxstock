import {Box} from '@mui/material';
export type SortKey='name'|'w'|'currentPrice'|'targetPrice'|'value'|'eps'|'epsYield'|'priceUpdatedAt'|'issuedShares'|'roe'|'capital'|'netIncome';
export type AnalysisSort={key:SortKey;direction:'asc'|'desc'};
export const defaultAnalysisSort:AnalysisSort[]=[{key:'w',direction:'desc'}];
export const encodeSort=(sorts:AnalysisSort[])=>sorts.map(s=>`${s.key}:${s.direction}`).join(',');
export function toggleAnalysisSort(sorts:AnalysisSort[],key:SortKey):AnalysisSort[]{
 const found=sorts.find(s=>s.key===key);
 return !found?[...sorts,{key,direction:'desc'}]:found.direction==='desc'?sorts.map(s=>s.key===key?{...s,direction:'asc'}:s):sorts.filter(s=>s.key!==key);
}
export function AnalysisSortHeader({label,column,sorts,onChange}:{label:string;column:SortKey;sorts:AnalysisSort[];onChange:(sorts:AnalysisSort[])=>void}){
 const index=sorts.findIndex(s=>s.key===column),selected=index>=0;
 return <Box sx={{display:'flex',alignItems:'center',gap:'2px',minWidth:0}}>
  <button type="button" data-testid={'sort-'+column} aria-label={label+' 정렬'} aria-pressed={selected} title="선택: 내림차순 → 오름차순 → 해제. 선택 순서대로 우선순위를 적용합니다." onClick={()=>onChange(toggleAnalysisSort(sorts,column))} style={{border:0,padding:0,background:'transparent',color:selected?'#FBBF24':'#94A3B8',fontSize:10,textAlign:'inherit',cursor:'pointer',overflowWrap:'anywhere'}}>{label}{selected&&` ${index+1}${sorts[index].direction==='desc'?'↓':'↑'}`}</button>
  {selected&&<button type="button" aria-label={label+' 정렬 해제'} onClick={()=>onChange(sorts.filter(s=>s.key!==column))} style={{border:0,background:'transparent',color:'#FBBF24',padding:0,fontSize:11,cursor:'pointer'}}>×</button>}
 </Box>;
}
