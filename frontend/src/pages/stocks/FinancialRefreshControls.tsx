import {useNavigate} from 'react-router-dom';
import {useAuth} from '../../auth/AuthGate';
import {HistoryDialog} from '../../components/common/HistoryDialog';
import {ActionButton} from '../../components/common/Common';
import {Box,DialogContent,DialogTitle,IconButton,Typography} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import {colors,radius} from '../../styles/tokens';
export const hasSavedFinancialData=(rows:readonly unknown[])=>rows.some(row=>{const data=row as Record<string,unknown>;return Boolean(data.values&&typeof data.values==='object'&&Object.values(data.values).some(value=>value!=null))||['revenue','operatingProfit','netIncome','eps','bps','per','pbr','roe'].some(key=>data[key]!=null);});
export type RefreshPeriod = 'Q1' | 'Q2' | 'Q3' | 'ANNUAL' | 'ALL';
type Props = { stockId: string; collectedAt: string|null; startYear?:number; endYear?:number; initialPeriod?:RefreshPeriod; onComplete?:()=>void; onSelection?:(year:number,period:RefreshPeriod)=>void; fixedYear?:number; allReports?:boolean; visible?:boolean;hasExistingData?:boolean };
/** Historical queues remain readable; no screen can resume historical external requests. */
export function FinancialRefreshControls(_props:Props){const {user}=useAuth(),navigate=useNavigate();return user?.role==='ADMIN'?<Box><Typography sx={{fontSize:12}}>과거 보완 수집은 종료되었습니다.</Typography><ActionButton size="small" onClick={()=>navigate('/detail/security-data')}>종목 관리</ActionButton></Box>:null;}
export function FinancialRefreshDialog({open,onClose,...props}:Props&{open:boolean;onClose:()=>void}) {
 return <HistoryDialog keepMounted open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{paper:{sx:{m:'16px 24px',width:'calc(100% - 48px)',boxSizing:'border-box',maxHeight:'calc(100dvh - 32px)',bgcolor:colors.surface,border:`1px solid ${colors.border}`,backgroundImage:'none',borderRadius:`${radius.lg}px`}}}}><DialogTitle sx={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:15,p:2,pb:0,flexShrink:0}}>재무제표 갱신<IconButton onClick={onClose} aria-label="재무제표 갱신 닫기"><CloseIcon/></IconButton></DialogTitle><DialogContent sx={{p:2,pt:0,overflowY:'auto',minHeight:0}}><FinancialRefreshControls key={props.stockId} {...props} visible={open}/></DialogContent></HistoryDialog>;
}

/** Shared by both entry screens; status comes from the durable server job, not session state. */
export function FinancialRefreshButton(_props:{stockId:string;onClick:()=>void;compact?:boolean}) {
 const {user}=useAuth(),navigate=useNavigate();
 return user?.role==='ADMIN'?<ActionButton tone="muted" aria-label="종목 관리" size="small" onClick={()=>navigate('/detail/security-data')}>종목 관리</ActionButton>:null;
}
