import {CompoundProgress} from './CompoundProgress';
import {Box} from '@mui/material';
import {colors} from '../../styles/tokens';
import {compoundAssetColor} from '../../utils/compoundAchievement';
import {format,number} from '../value/valueApi';
import type {Plan,Goal} from './compoundApi';
export function CompoundGoalSummary({plan,goal,assets,testId='compound-goal-summary'}:{plan:Plan;goal:Goal;assets:string|null;testId?:string}){
 const progress=assets==null?null:number(goal.progress);
 const rows=[{label:'현재 자산',value:assets,color:compoundAssetColor(assets,goal.yearTarget),id:'current'},
  {label:'올해 목표',value:goal.yearTarget,color:colors.textPrimary,id:'year'},
  {label:'목표 자산',value:goal.finalTarget,color:colors.textPrimary,id:'final'}];
 return <Box data-testid={testId} sx={{bgcolor:'#0E1729',borderRadius:'8px',p:'10px 14px',minWidth:0,minHeight:114,boxSizing:'border-box',border:'2px solid '+(goal.isDefault?'#FACC15':'transparent')}}>
  <Box sx={{display:'flex',justifyContent:'space-between',gap:'8px',fontSize:12,mb:'4px',alignItems:'start'}}>
   <Box sx={{color:goal.displayColor,minWidth:0,overflowWrap:'anywhere'}}>{plan.planName} · 연 {format(goal.annualTargetRate,1,'%')}{goal.isDefault?' · 기본 목표':''}</Box>
   <Box sx={{color:compoundAssetColor(assets,goal.yearTarget),flexShrink:0}}>진행률 {format(progress,1,'%')}</Box>
  </Box>
  {rows.map(row=><Box key={row.id} sx={{display:'flex',justifyContent:'space-between',gap:'8px',fontSize:12,minHeight:20}}>
   <Box sx={{color:colors.textMuted,flexShrink:0}}>{row.label}</Box><Box data-testid={'compound-summary-'+row.id} sx={{textAlign:'right',overflowWrap:'anywhere',minWidth:0,color:row.color}}>{format(row.value,0,'원')}</Box>
  </Box>)}
  <CompoundProgress goal={goal} assets={assets} height={6}/>
 </Box>;
}
