import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {Box,Button,Typography} from '@mui/material';
import {AppCard} from '../../components/common/Common';
import {SnapshotChart,type SnapshotChartPoint} from '../../components/common/SnapshotChart';
import {colors} from '../../styles/tokens';

/** Shared fixed frame for both code download and API waiting. */
export function CashTrendFrame({points=[],range,pending=false,error=false,retry,empty=false,onDetail,expanded=false}:{points?:SnapshotChartPoint[];range:{from:string;to:string};pending?:boolean;error?:boolean;retry?:()=>void;empty?:boolean;onDetail?:()=>void;expanded?:boolean}){
 return <AppCard data-testid="cash-trend" aria-busy={pending} sx={{p:'8px 16px',borderRadius:'8px',height:expanded?'100%':{xs:123,sm:'max(123px, calc((100dvh - 314px) * 1.5))'},minHeight:expanded?0:123,flexShrink:0,display:'flex',flexDirection:'column',gap:'4px'}}>
  <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0}}><Typography sx={{fontSize:14,fontWeight:700,lineHeight:'19px'}}>예수금 변화 추이</Typography>{onDetail&&<Button onClick={onDetail} sx={{fontSize:10,p:0,minHeight:19}}>상세보기 ›</Button>}</Box>
  <Box data-testid="cash-chart-region" sx={{flex:1,minHeight:0,position:'relative',display:'flex',flexDirection:'column'}}>
   <SnapshotChart points={points} series={[{key:'cash',label:'예수금',color:colors.marketFall,lineTestId:'cash-trend-line'}]} from={range.from} to={range.to} emptyFrame fill testId="cash-trend-chart" ariaLabel="저장된 예수금 · 날짜별 금액 조회" />
   {!pending&&(error||empty||!points.length)&&<Box sx={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',bgcolor:'#111927bb'}}>
    {error?<QueryErrorNotice message="추이 조회 실패 · 다시 시도" onRetry={retry}/>:<Typography role="status" sx={{fontSize:10,color:colors.textMuted}}>{empty?'내용이 없습니다.':'— · 저장 잔액 미수집'}</Typography>}
   </Box>}
  </Box>
 </AppCard>;
}
