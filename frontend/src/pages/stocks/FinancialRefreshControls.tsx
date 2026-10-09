import { HistoryDialog } from '../../components/common/HistoryDialog';
import {ActionButton} from '../../components/common/Common';
import { Alert, Box, Button, DialogContent, DialogTitle, IconButton, Stack, Typography, CircularProgress } from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CloseIcon from '@mui/icons-material/Close';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { apiRequest, ApiError } from '../../data/apiClient';
import { FormSelect } from '../../components/forms/Fields';
import { colors, radius } from '../../styles/tokens';

export type RefreshPeriod = 'Q1' | 'Q2' | 'Q3' | 'ANNUAL' | 'ALL';
type RefreshCounts = { processed:number; disclosureCompleted:number; valuationCompleted:number; noDisclosure:number; disclosureFailed:number; supplementFailed:number };
type Result = { fiscalYear?: number; period: RefreshPeriod; status: 'SUCCESS' | 'NO_DATA' | 'FAILED'; code?: string; valuationStatus?: string; valuationReasons?: Record<string,string>; valuationErrors?:Record<string,string> };
type RefreshStatus = { requestId:string; state: 'QUEUED' | 'PROCESSING' | 'FINISHED'; status: string; finishedAt: string | null; fiscalYear: number; startYear?: number; endYear?: number; period: RefreshPeriod; results: Result[]; counts?:RefreshCounts; progress?: {currentYear:number;currentPeriod?:RefreshPeriod;stage:string;completed:number;total:number}|null };
const labels: Record<RefreshPeriod, string> = { Q1: '1분기', Q2: '반기', Q3: '3분기', ANNUAL: '사업보고서', ALL: '연도 전체' };
const errorText = (code?: string) => {
  if (['010', '011', '012', 'API_KEY_MISSING', 'DART_NOT_CONFIGURED'].includes(code ?? '')) return '인증·접근 설정을 확인해 주세요.';
  if (['020', 'DAILY_CALL_LIMIT'].includes(code ?? '')) return '일일 API 호출 한도에 도달했습니다.';
  if (code === 'DART_CORP_CODE_NOT_MAPPED') return 'DART 기업코드가 연결되지 않았습니다.';
  return '업데이트에 실패했습니다. 잠시 후 다시 시도해 주세요.';
};
type Props = { stockId: string; collectedAt: string|null; startYear?:number; endYear?:number; initialPeriod?:RefreshPeriod; onComplete?:()=>void; onSelection?:(year:number,period:RefreshPeriod)=>void; fixedYear?:number; allReports?:boolean; visible?:boolean };
export function FinancialRefreshControls({stockId,collectedAt,startYear:initialStart,endYear:initialEnd,initialPeriod='ALL',onComplete,fixedYear,allReports,visible=true}:Props) {
  const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date()));
  const boundYear=(year:number)=>Math.max(2015,Math.min(currentYear,year));
  const defaultStart=boundYear(initialStart??fixedYear??currentYear-2),defaultEnd=boundYear(initialEnd??fixedYear??currentYear);
  const [startYear,setStartYear]=useState(defaultStart),[endYear,setEndYear]=useState(defaultEnd),[period,setPeriod]=useState<RefreshPeriod>(allReports?'ALL':initialPeriod);
  const [requestId,setRequestId]=useState<string|null>(()=>sessionStorage.getItem(`financialRefresh:${stockId}`));
  const client=useQueryClient(),submitLock=useRef(false),handled=useRef<string|null>(null),callback=useRef(onComplete);callback.current=onComplete;
  const mutation=useMutation({mutationFn:()=>apiRequest<{requestId:string}>(`/securities/${encodeURIComponent(stockId)}/financial-refresh`,{method:'POST',body:JSON.stringify({startYear,endYear,period})}),onSuccess:data=>{sessionStorage.setItem(`financialRefresh:${stockId}`,data.requestId);setRequestId(data.requestId);void active.refetch();},onError:()=>{void active.refetch();},onSettled:()=>{submitLock.current=false;}});
  const active=useQuery({queryKey:['financialRefreshActive',stockId],queryFn:()=>apiRequest<RefreshStatus|null>(`/securities/${encodeURIComponent(stockId)}/financial-refresh/active`),staleTime:0,retry:1,refetchInterval:q=>visible&&(q.state.data?.requestId||q.state.error)?3000:false});
  useEffect(()=>{if(visible)void active.refetch();},[visible,stockId]);
  useEffect(()=>{if(active.data?.requestId&&active.data.state!=='FINISHED'){
    sessionStorage.setItem(`financialRefresh:${stockId}`,active.data.requestId);setRequestId(active.data.requestId);
  }},[active.data,stockId]);
  const status=useQuery({queryKey:['financialRefresh',stockId,requestId],queryFn:()=>apiRequest<RefreshStatus>(`/securities/${encodeURIComponent(stockId)}/financial-refresh/${requestId}`),enabled:Boolean(requestId),refetchInterval:q=>q.state.data?.state==='FINISHED'?false:3000,retry:1});
  useEffect(()=>{if(status.data&&status.data.state!=='FINISHED'){setStartYear(status.data.startYear??status.data.fiscalYear);setEndYear(status.data.endYear??status.data.fiscalYear);setPeriod(status.data.period);}},[status.data]);
  useEffect(()=>{
    if(status.data?.state!=='FINISHED'||handled.current===requestId)return;
    handled.current=requestId;sessionStorage.removeItem(`financialRefresh:${stockId}`);
    for(const key of ['securityAnalysis','financialDetail','financialPreview','financialChartAll'])void client.invalidateQueries({queryKey:[key,stockId]});
    for(const key of ['financialList','valueStored'])void client.invalidateQueries({queryKey:[key]});
    client.setQueryData<RefreshStatus|null>(['financialRefreshActive',stockId],current=>current?.requestId===requestId?null:current);
    void active.refetch();
    callback.current?.();
  },[status.data?.state,requestId,stockId,client]);
  const busy=mutation.isPending||Boolean(active.data?.requestId&&active.data.state!=='FINISHED')||Boolean(requestId&&status.data?.state!=='FINISHED'),invalid=startYear>endYear;
  useEffect(()=>{if(!busy){setStartYear(defaultStart);setEndYear(defaultEnd);setPeriod(allReports?'ALL':initialPeriod);}},[defaultStart,defaultEnd,initialPeriod,allReports]);
  const finished=status.data?.state==='FINISHED'?status.data:null,range=`${startYear}–${endYear}년 ${labels[period]}`;
  const years=Array.from({length:currentYear-2015+1},(_,i)=>({value:String(currentYear-i),label:`${currentYear-i}년`}));
  const run=()=>{if(busy||active.isPending||invalid||submitLock.current)return;submitLock.current=true;mutation.mutate();};
  const progress=status.data?.progress;
  const reportCount=period==='ALL'?4:1;
  const completedYears=Array.from({length:endYear-startYear+1},(_,i)=>startYear+i).filter(y=>(status.data?.results??[]).filter(r=>(r.fiscalYear??status.data?.fiscalYear)===y).length===reportCount);
  const stageText:Record<string,string>={DISCLOSURE:'공시 확인 중',FINANCIALS:'재무제표 수집 중',VALUATION:'가치지표 보충 중',REPORT_DONE:'처리 중'};
  const progressText=[...completedYears.map(y=>`${y}년 처리 완료`),...(progress&&!completedYears.includes(progress.currentYear)?[`${progress.currentYear}년 ${progress.currentPeriod?labels[progress.currentPeriod]+' ':''}${stageText[progress.stage]??'처리 중'}`]:[])].join(' · ')||'서버 처리 대기 중';
  const completed=finished?.counts?.disclosureCompleted??finished?.results.filter(r=>r.status==='SUCCESS').length??0,noData=finished?.counts?.noDisclosure??finished?.results.filter(r=>r.status==='NO_DATA').length??0,failed=finished?.counts?.disclosureFailed??finished?.results.filter(r=>r.status==='FAILED').length??0;
  const supplemented=finished?.counts?.valuationCompleted??finished?.results.filter(r=>r.status==='SUCCESS'&&r.valuationStatus==='SUCCESS').length??0;
  const incomplete=finished?.counts?.supplementFailed??completed-supplemented;
  const outcome=finished?.status==='FAILED'?'실패':finished?.status==='SKIPPED'?'미공시':finished?.status==='PARTIAL'||failed||noData||incomplete?'부분 완료':'완료';
  return <Stack spacing={1.5} data-testid="financial-refresh-form">
    <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:1}}>
      <FormSelect size="small" label="시작연도" value={String(startYear)} onChange={v=>setStartYear(Number(v))} options={years} disabled={busy}/>
      <FormSelect size="small" label="종료연도" value={String(endYear)} onChange={v=>setEndYear(Number(v))} options={years} disabled={busy}/>
    </Box>
    {invalid&&<Typography role="alert" sx={{fontSize:11,color:'error.main'}}>시작연도가 종료연도보다 늦습니다.</Typography>}
    <FormSelect size="small" label="갱신범위" value={period} onChange={v=>setPeriod(v as RefreshPeriod)} options={Object.entries(labels).map(([value,label])=>({value,label}))} disabled={busy}/>
    <Button size="small" variant="contained" disabled={busy||active.isPending||invalid} startIcon={busy?<HourglassEmptyIcon/>:undefined} onClick={run}>{busy?'갱신 중':'수동 업데이트'} · {range}</Button>
    {busy&&<Typography role="status" aria-live="polite" sx={{fontSize:11,lineHeight:'18px',whiteSpace:'nowrap',overflowX:'auto'}}>{progressText}{progress?` (${progress.completed}/${progress.total} 보고서)`:''}</Typography>}
    {initialEnd!==undefined&&initialEnd>currentYear&&<Typography sx={{fontSize:11,color:'text.secondary'}}>미래 기간은 제외하고 {currentYear}년까지 갱신합니다.</Typography>}
    <Typography sx={{fontSize:11,color:'text.secondary'}}>현재 종목만 갱신합니다. 실패·미공시 자료는 기존 데이터를 유지합니다.</Typography>
    <Typography sx={{fontSize:11,color:'text.secondary'}}>저장 데이터 수집 시각: {collectedAt?new Date(collectedAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미수집'}</Typography>
    {mutation.isError&&<Alert severity="error">{mutation.error instanceof ApiError?mutation.error.message:errorText()}</Alert>}
    {active.isError&&<Alert severity="warning">진행 작업 확인에 실패했습니다. 서버 상태를 다시 확인합니다.</Alert>}
    {status.isError&&<Alert severity="warning">진행 상태 조회 오류 · 작업 종료 여부를 확인 중입니다.<Button size="small" onClick={()=>void status.refetch()}>상태 다시 확인</Button></Alert>}
    {finished&&<Alert severity={outcome==='실패'?'error':outcome==='완료'?'success':'warning'}>
      <Typography sx={{fontSize:12}}>{finished.startYear??finished.fiscalYear}–{finished.endYear??finished.fiscalYear}년 · {outcome}</Typography>
      <Typography sx={{fontSize:11}}>보고서 기준: 공시 확인 완료 {completed} · 미공시 {noData} · 수집 실패 {failed}</Typography>
      <Typography sx={{fontSize:11}}>가치지표 보충 완료 {supplemented} · 보충 실패/근거 부족 {incomplete}</Typography>
      <Box component="details" sx={{mt:1,fontSize:11}}><Box component="summary" sx={{cursor:'pointer'}}>상세 내용</Box>
        {finished.results.map((r,i)=><Box key={i} sx={{mt:1}}>{r.fiscalYear??finished.fiscalYear}년 {labels[r.period]}: {r.status==='SUCCESS'?'공시 확인 완료 · '+(r.valuationStatus==='SUCCESS'?'가치지표 보충 완료':'가치지표 보충 미완료'):r.status==='NO_DATA'?'미공시 · 기존 데이터 유지':errorText(r.code)}
          {[...new Set([...Object.values(r.valuationReasons??{}),...Object.values(r.valuationErrors??{}).map(code=>errorText(code))])].map(reason=><Typography key={reason} sx={{fontSize:11}}>{reason}</Typography>)}
        </Box>)}
      </Box>
    </Alert>}
  </Stack>;
}
export function FinancialRefreshDialog({open,onClose,...props}:Props&{open:boolean;onClose:()=>void}) {
 return <HistoryDialog keepMounted open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{paper:{sx:{m:'16px 24px',width:'calc(100% - 48px)',boxSizing:'border-box',maxHeight:'calc(100dvh - 32px)',bgcolor:colors.surface,border:`1px solid ${colors.border}`,backgroundImage:'none',borderRadius:`${radius.lg}px`}}}}><DialogTitle sx={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:15,p:2,flexShrink:0}}>재무제표 갱신<IconButton onClick={onClose} aria-label="재무제표 갱신 닫기"><CloseIcon/></IconButton></DialogTitle><DialogContent sx={{p:2,overflowY:'auto',minHeight:0}}><FinancialRefreshControls key={props.stockId} {...props} visible={open}/></DialogContent></HistoryDialog>;
}

/** Shared by both entry screens; status comes from the durable server job, not session state. */
export function FinancialRefreshButton({stockId,onClick,compact=false}:{stockId:string;onClick:()=>void;compact?:boolean}) {
 const active=useQuery({queryKey:['financialRefreshActive',stockId],queryFn:()=>apiRequest<RefreshStatus|null>(`/securities/${encodeURIComponent(stockId)}/financial-refresh/active`),staleTime:0,retry:1,refetchInterval:q=>q.state.data?3000:false});
 const running=!!active.data&&active.data.state!=='FINISHED';
 return <ActionButton tone="muted" aria-label="재무제표 갱신" size="small" startIcon={running?<CircularProgress size={12}/>:<RefreshRoundedIcon sx={{fontSize:16}}/>} onClick={onClick} >{running?'갱신 중':compact?'갱신':'재무제표 갱신'}</ActionButton>;
}
