import {Box} from '@mui/material';
import {colors} from '../../styles/tokens';
import {compoundAssetColor} from '../../utils/compoundAchievement';
import {format,number} from '../value/valueApi';
import type {Plan,Goal} from './compoundApi';
export function CompoundGoalSummary({plan,goal,assets,testId='compound-goal-summary'}:{plan:Plan;goal:Goal;assets:string|null;testId?:string}){
 const progress=assets==null?null:number(goal.progress);
 const rows=[{label:'현재 자산',value:assets,color:compoundAssetColor(assets,goal.yearTarget),id:'current'},
  {label:'올해 목표',value:goal.yearTarget,color:colors.textPrimary,id:'year'},
  {label:'목표 자산',value:goal.finalTarget,color:'#FA616E',id:'final'}];
 return <Box data-testid={testId} sx={{bgcolor:'#0E1729',borderRadius:'8px',p:'10px 14px',minWidth:0,minHeight:114,boxSizing:'border-box',border:'2px solid '+(goal.isDefault?'#FACC15':'transparent')}}>
  <Box sx={{display:'flex',justifyContent:'space-between',gap:'8px',fontSize:12,mb:'4px',alignItems:'start'}}>
   <Box sx={{color:goal.displayColor,minWidth:0,overflowWrap:'anywhere'}}>{plan.planName} · 연 {format(goal.annualTargetRate,1,'%')}{goal.isDefault?' · 기본 목표':''}</Box>
   <Box sx={{color:'#FA616E',flexShrink:0}}>진행률 {format(progress,1,'%')}</Box>
  </Box>
  {rows.map(row=><Box key={row.id} sx={{display:'flex',justifyContent:'space-between',gap:'8px',fontSize:12,minHeight:20}}>
   <Box sx={{color:colors.textMuted,flexShrink:0}}>{row.label}</Box><Box data-testid={'compound-summary-'+row.id} sx={{textAlign:'right',overflowWrap:'anywhere',minWidth:0,color:row.color}}>{format(row.value,0,'원')}</Box>
  </Box>)}
  <Box role="meter" aria-label="목표 진행률" aria-valuemin={0} aria-valuemax={Math.max(100,progress??0)} aria-valuenow={progress??undefined} sx={{height:6,bgcolor:'#25334A',borderRadius:'3px',mt:'4px'}}>{progress!==null&&<Box sx={{height:'100%',width:Math.max(0,Math.min(100,progress))+'%',bgcolor:'#FA616E',borderRadius:'3px'}}/>}</Box>
 </Box>;
}
