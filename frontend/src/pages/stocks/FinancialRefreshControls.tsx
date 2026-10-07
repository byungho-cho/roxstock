import { Alert, Box, Button, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { apiRequest, ApiError } from '../../data/apiClient';
import { FormSelect } from '../../components/forms/Fields';
import type { FinancialDetail } from '../financial/financialApi';
import { ValueFinancialCharts } from '../value/ValueFinancialCharts';

export type RefreshPeriod = 'Q1' | 'Q2' | 'Q3' | 'ANNUAL' | 'ALL';
type Result = { fiscalYear?: number; period: RefreshPeriod; status: 'SUCCESS' | 'NO_DATA' | 'FAILED'; code?: string; valuationStatus?: string; valuationReasons?: Record<string,string> };
type RefreshStatus = { state: 'QUEUED' | 'PROCESSING' | 'FINISHED'; status: string; finishedAt: string | null; fiscalYear: number; startYear?: number; endYear?: number; period: RefreshPeriod; results: Result[] };
const labels: Record<RefreshPeriod, string> = { Q1: '1분기', Q2: '반기', Q3: '3분기', ANNUAL: '사업보고서', ALL: '연도 전체' };
const errorText = (code?: string) => {
  if (['010', '011', '012', 'API_KEY_MISSING', 'DART_NOT_CONFIGURED'].includes(code ?? '')) return '인증·접근 설정을 확인해 주세요.';
  if (['020', 'DAILY_CALL_LIMIT'].includes(code ?? '')) return '일일 API 호출 한도에 도달했습니다.';
  if (code === 'DART_CORP_CODE_NOT_MAPPED') return 'DART 기업코드가 연결되지 않았습니다.';
  return '업데이트에 실패했습니다. 잠시 후 다시 시도해 주세요.';
};
type Props = { stockId: string; collectedAt: string|null; startYear?:number; endYear?:number; initialPeriod?:RefreshPeriod; onComplete?:()=>void; onSelection?:(year:number,period:RefreshPeriod)=>void; fixedYear?:number; allReports?:boolean };
export function FinancialRefreshControls({stockId,collectedAt,startYear:initialStart,endYear:initialEnd,initialPeriod='ALL',onComplete,onSelection,fixedYear,allReports}:Props) {
  const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date()));
  const [startYear,setStartYear]=useState(initialStart??fixedYear??currentYear-2),[endYear,setEndYear]=useState(initialEnd??fixedYear??currentYear),[period,setPeriod]=useState<RefreshPeriod>(allReports?'ALL':initialPeriod);
  const [requestId,setRequestId]=useState<string|null>(()=>sessionStorage.getItem(`financialRefresh:${stockId}`));
  const [preview,setPreview]=useState<{startYear:number;endYear:number;period:RefreshPeriod}|null>(null);
  const client=useQueryClient(),submitLock=useRef(false),handled=useRef<string|null>(null),callback=useRef(onComplete);callback.current=onComplete;
  const mutation=useMutation({mutationFn:()=>apiRequest<{requestId:string}>(`/securities/${encodeURIComponent(stockId)}/financial-refresh`,{method:'POST',body:JSON.stringify({startYear,endYear,period})}),onSuccess:data=>{sessionStorage.setItem(`financialRefresh:${stockId}`,data.requestId);setRequestId(data.requestId);},onSettled:()=>{submitLock.current=false;}});
  const status=useQuery({queryKey:['financialRefresh',stockId,requestId],queryFn:()=>apiRequest<RefreshStatus>(`/securities/${encodeURIComponent(stockId)}/financial-refresh/${requestId}`),enabled:Boolean(requestId),refetchInterval:q=>q.state.data?.state==='FINISHED'?false:2000,retry:1});
  const stored=useQuery({queryKey:['financialPreview',stockId,preview],queryFn:({signal})=>apiRequest<FinancialDetail>(`/financial-statements/${encodeURIComponent(stockId)}?`+new URLSearchParams({startYear:String(preview!.startYear),endYear:String(preview!.endYear),period:preview!.period}),{signal}),enabled:!!preview});
  useEffect(()=>{if(status.data&&status.data.state!=='FINISHED'){setStartYear(status.data.startYear??status.data.fiscalYear);setEndYear(status.data.endYear??status.data.fiscalYear);setPeriod(status.data.period);}},[status.data]);
  useEffect(()=>{
    if(status.data?.state!=='FINISHED'||handled.current===requestId)return;
    handled.current=requestId;sessionStorage.removeItem(`financialRefresh:${stockId}`);
    for(const key of ['securityAnalysis','financialDetail','financialPreview'])void client.invalidateQueries({queryKey:[key,stockId]});
    for(const key of ['financialList','valueStored'])void client.invalidateQueries({queryKey:[key]});
    callback.current?.();
  },[status.data?.state,requestId,stockId,client]);
  useEffect(()=>{if(status.error instanceof ApiError&&status.error.status===404){sessionStorage.removeItem(`financialRefresh:${stockId}`);setRequestId(null);}},[status.error,stockId]);
  const busy=mutation.isPending||Boolean(requestId&&status.data?.state!=='FINISHED'),invalid=startYear>endYear;
  useEffect(()=>{if(!busy){setStartYear(initialStart??fixedYear??currentYear-2);setEndYear(initialEnd??fixedYear??currentYear);setPeriod(allReports?'ALL':initialPeriod);}},[initialStart,initialEnd,initialPeriod,fixedYear,allReports]);
  const finished=status.data?.state==='FINISHED'?status.data:null,range=`${startYear}–${endYear}년 ${labels[period]}`;
  const years=Array.from({length:currentYear-2015+1},(_,i)=>({value:String(currentYear-i),label:`${currentYear-i}년`}));
  const run=()=>{if(busy||invalid||submitLock.current)return;submitLock.current=true;mutation.mutate();};
  return <Stack spacing={1.5} data-testid="financial-refresh-form">
    <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:1}}>
      <Button sx={{fontSize:11,minHeight:40,lineHeight:'16px',p:'6px 4px'}} variant="outlined" disabled={busy||invalid||stored.isFetching} onClick={()=>{setPreview({startYear,endYear,period});onSelection?.(endYear,period);}}>저장 데이터 차트 보기</Button>
      <Button sx={{fontSize:11,minHeight:40,lineHeight:'16px',p:'6px 4px'}} variant="contained" disabled={busy||invalid} startIcon={busy?<HourglassEmptyIcon/>:undefined} onClick={run}>{busy?'갱신 중':'수동 업데이트'}</Button>
    </Box>
    <FormSelect label="시작연도" value={String(startYear)} onChange={v=>setStartYear(Number(v))} options={years} disabled={busy}/>
    <FormSelect label="종료연도" value={String(endYear)} onChange={v=>setEndYear(Number(v))} options={years} disabled={busy} error={invalid?'시작연도가 종료연도보다 늦습니다.':undefined}/>
    <FormSelect label="갱신범위" value={period} onChange={v=>setPeriod(v as RefreshPeriod)} options={Object.entries(labels).map(([value,label])=>({value,label}))} disabled={busy}/>
    <Typography sx={{fontSize:12,fontWeight:600}}>{range} · 현재 종목만 {busy?'처리 중':'조회 / 갱신'}</Typography>
    <Typography sx={{fontSize:11,color:'text.secondary'}}>차트 보기는 저장 데이터만 조회합니다. 수동 업데이트는 선택한 기간·범위의 재무제표와 가치지표를 보충합니다. 실패·미공시 자료는 기존 데이터를 유지합니다.</Typography>
    <Typography sx={{fontSize:11,color:'text.secondary'}}>저장 데이터 수집 시각: {collectedAt?new Date(collectedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미수집'}</Typography>
    {mutation.isError&&<Alert severity="error">{mutation.error instanceof ApiError?mutation.error.message:errorText()}</Alert>}
    {status.isError&&<Alert severity="warning">진행 상태를 확인할 수 없습니다. 중복 실행을 막기 위해 요청을 유지합니다.<Button onClick={()=>void status.refetch()}>상태 다시 확인</Button></Alert>}
    {finished&&<Alert severity={finished.status==='FAILED'?'error':['PARTIAL','SKIPPED'].includes(finished.status)||finished.results.some(r=>r.valuationStatus&&r.valuationStatus!=='SUCCESS')?'warning':'success'}>
      {finished.startYear??finished.fiscalYear}–{finished.endYear??finished.fiscalYear}년 · {finished.status==='FAILED'?'실패':finished.status==='PARTIAL'||finished.results.some(r=>r.valuationStatus&&r.valuationStatus!=='SUCCESS')?'부분 완료':finished.status==='SKIPPED'?'미공시':'완료'} · {finished.finishedAt?new Date(finished.finishedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):''}
      {finished.results.map((r,i)=><Typography key={i} sx={{fontSize:12}}>{r.fiscalYear??finished.fiscalYear}년 {labels[r.period]}: {r.status==='SUCCESS'?'최신 공시 확인 완료':r.status==='NO_DATA'?'공시·재무제표 없음 · 기존 데이터 유지':errorText(r.code)}{r.valuationReasons&&' · '+Object.values(r.valuationReasons).join(' · ')}</Typography>)}
    </Alert>}
    {preview&&<Box data-testid="financial-stored-preview"><Typography sx={{fontSize:12,mb:1}}>{preview.startYear}–{preview.endYear}년 {labels[preview.period]} · 저장 데이터</Typography>{stored.isFetching&&<CircularProgress size={20}/>} {stored.isError&&<Alert severity="error">저장 데이터 조회 실패<Button onClick={()=>void stored.refetch()}>다시 조회</Button></Alert>}{stored.data&&<Box sx={{overflowX:'auto'}}><Box sx={{minWidth:Math.max(290,stored.data.rows.length*72+100)}}><ValueFinancialCharts rows={stored.data.chartRows}/></Box></Box>}</Box>}
  </Stack>;
}
export function FinancialRefreshDialog({open,onClose,...props}:Props&{open:boolean;onClose:()=>void}) {
 return <Dialog keepMounted open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{paper:{sx:{m:1,width:'calc(100% - 16px)',maxHeight:'calc(100dvh - 16px)',bgcolor:'#0f1724',borderRadius:'12px'}}}}><DialogTitle sx={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:15,p:2}}>재무제표 갱신<IconButton onClick={onClose} aria-label="재무제표 갱신 닫기"><CloseIcon/></IconButton></DialogTitle><DialogContent sx={{p:2}}><FinancialRefreshControls key={props.stockId} {...props}/></DialogContent></Dialog>;
}
