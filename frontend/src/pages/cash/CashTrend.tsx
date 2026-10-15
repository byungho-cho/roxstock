import {DelayedSkeleton as Skeleton} from '../../components/common/DelayedSkeleton';
import { Box, Button, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { AppCard } from '../../components/common/Common';
import { getAssetHistory } from '../../data/roxstockApi';
import { colors } from '../../styles/tokens';
import { formatWon } from '../../utils/format';
import {CashTrendFrame} from './CashTrendFrame';
import { useMemo, useState } from 'react';
import { Dialog, Stack, Select, MenuItem } from '@mui/material';
import { usePopupHistory } from '../../hooks/usePopupHistory';
import { cashToday } from './cashData';
import { cashSegments } from './cashData';

function CashTrendContent({ accountId, range, onDetail, expanded=false }: { accountId?: string; range: { from: string; to: string };onDetail?:()=>void;expanded?:boolean }) {
  const result = useQuery({ queryKey: ['cashTrend', accountId, range.from, range.to], queryFn: ({signal}) => getAssetHistory(accountId!, range, signal), enabled: !!accountId });
  const points = useMemo(() => {
    const segments = cashSegments(result.data?.data ?? []);
    return segments.flatMap((segment,index)=>[
      ...(index ? [{date:new Date(Date.parse(segment[0].date)-86_400_000).toISOString().slice(0,10), values:{cash:null},text:{cash:'데이터 없음'}}] : []),
      ...segment.map(point=>({date:point.date,values:{cash:point.value},text:{cash:formatWon(point.value)}})),
    ]);
  },[result.data]);
  return <CashTrendFrame onDetail={onDetail} expanded={expanded} points={points} range={range} pending={result.isPending} error={result.isError} retry={()=>void result.refetch()} empty={!result.data?.data.length} />;
}

export function CashTrend({accountId,range}:{accountId?:string;range:{from:string;to:string}}) {
 const today=cashToday(),currentYear=Number(today.slice(0,4));
 const [open,setOpen]=useState(false),[startYear,setStartYear]=useState(currentYear);
 const close=usePopupHistory(open,()=>setOpen(false));
 return <><CashTrendContent accountId={accountId} range={range} onDetail={()=>{setStartYear(currentYear);setOpen(true);}}/>
  <Dialog fullScreen transitionDuration={0} open={open} onClose={()=>void close()} slotProps={{paper:{sx:{bgcolor:colors.canvas,p:'8px',display:'flex',flexDirection:'column',overflow:'hidden'}}}}>
   <Stack direction="row" sx={{height:44,flexShrink:0,alignItems:'center',justifyContent:'space-between',gap:'8px'}}><Typography sx={{fontSize:20,fontWeight:600}}>예수금 차트</Typography><Button aria-label="예수금 차트 닫기" onClick={()=>void close()} sx={{minWidth:32}}>✕</Button></Stack>
   <Stack direction="row" sx={{justifyContent:'flex-end',alignItems:'center',gap:'8px',py:'8px',flexShrink:0}}><Typography sx={{fontSize:12}}>시작연도</Typography><Select size="small" value={startYear} inputProps={{'aria-label':'예수금 차트 시작연도'}} onChange={event=>setStartYear(Number(event.target.value))} sx={{height:32,fontSize:12}}>{Array.from({length:currentYear-2010+1},(_,i)=>currentYear-i).map(year=><MenuItem key={year} value={year}>{year}년</MenuItem>)}</Select></Stack>
   <Box sx={{flex:1,minHeight:0}}>{open&&<CashTrendContent accountId={accountId} range={{from:`${startYear}-01-01`,to:today}} expanded/>}</Box>
  </Dialog></>;
}