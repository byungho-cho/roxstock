import {Tabs,Tab} from '@mui/material';
import {stockTabs} from './stockMath';
import type {StockListType} from '../../types/models';
import {colors} from '../../styles/tokens';
export function StockTabs({active,changeTab,tablet}:{active:StockListType;changeTab:(tab:StockListType)=>void;tablet:boolean}){return <Tabs value={active} onChange={(_,value:StockListType)=>changeTab(value)} variant="fullWidth" aria-label="종목 목록 구분" sx={{width:tablet?270:'100%',minHeight:tablet?36:42,p:'4px',bgcolor:colors.surface,borderRadius:'8px','& .MuiTabs-indicator':{display:'none'},'& .MuiTab-root':{p:0,minWidth:0,minHeight:tablet?28:34,fontSize:tablet?10:13,fontWeight:400,borderRadius:'8px',color:colors.textMuted},'& .Mui-selected':{bgcolor:colors.buttonPrimary,color:'#fff !important',fontWeight:600}}}>{stockTabs.map(t=><Tab key={t.value} value={t.value} label={t.label}/>)}</Tabs>;}
