import {Box} from '@mui/material';
import {colors} from '../../styles/tokens';
import {compoundAssetColor,compoundTargetDifference} from '../../utils/compoundAchievement';
import {format,number} from '../value/valueApi';
import type {Goal} from './compoundApi';

// Width remains the server's final-target progress; annual target only affects presentation.
export function CompoundProgress({goal,assets,progressValue,progressLabel='목표 진행률',height=8}:{goal?:Goal;assets:string|null;progressValue?:string|null;progressLabel?:string;height?:number}){
 const progress=assets===null?null:number(progressValue===undefined?goal?.progress:progressValue);
 const annual=number(goal?.yearTarget),final=number(goal?.finalTarget);
 const marker=annual!==null&&annual>0&&final!==null&&final>0?Math.max(0,Math.min(100,annual/final*100)):null;
 const color=compoundAssetColor(assets,goal?.yearTarget),difference=compoundTargetDifference(assets,goal?.yearTarget);
 return <Box data-testid="compound-progress" sx={{minWidth:0,mt:'4px'}}>
  <Box role="meter" aria-label={progressLabel} aria-valuemin={0} aria-valuemax={Math.max(100,progress??0)} aria-valuenow={progress??undefined} sx={{height,bgcolor:'#25334A',borderRadius:'4px',position:'relative',isolation:'isolate'}}>
   {marker!==null&&<Box data-testid="compound-year-background" sx={{position:'absolute',inset:'0 auto 0 0',width:marker+'%',height:'100%',bgcolor:colors.warning,opacity:.24,borderRadius:'4px',zIndex:0}}/>}
   {progress!==null&&<Box data-testid="compound-current-bar" sx={{position:'relative',height:'100%',width:Math.max(0,Math.min(100,progress))+'%',bgcolor:color,borderRadius:'4px',zIndex:1}}/>}
   {marker!==null&&<Box data-testid="compound-year-marker" aria-label="올해 목표 기준선" sx={{position:'absolute',left:`clamp(1px, ${marker}%, calc(100% - 1px))`,transform:'translateX(-50%)',top:-2,width:2,height:height+4,bgcolor:colors.warning,zIndex:2}}/>}
  </Box>
  <Box data-testid="compound-year-difference" sx={{fontSize:10,lineHeight:'16px',color,minHeight:16,mt:'3px',overflowWrap:'anywhere',textAlign:'right'}}>{difference.kind==='unavailable'?'올해 목표 대비 —':difference.kind==='equal'?'올해 목표 달성':`올해 목표 대비 ${format(difference.amount,0,'원')} ${difference.kind==='shortfall'?'부족':'초과'}`}</Box>
 </Box>;
}
