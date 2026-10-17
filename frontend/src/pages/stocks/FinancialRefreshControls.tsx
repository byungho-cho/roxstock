import {refreshOutcome} from './refreshOutcome';
import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import { HistoryDialog } from '../../components/common/HistoryDialog';
import {ActionButton} from '../../components/common/Common';
import { Alert, Box, DialogContent, DialogTitle, IconButton, Stack, Typography, CircularProgress, Snackbar, Select, MenuItem } from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import CloseIcon from '@mui/icons-material/Close';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { apiRequest, ApiError } from '../../data/apiClient';
import { FormSelect } from '../../components/forms/Fields';
import { colors, radius } from '../../styles/tokens';

export const hasSavedFinancialData=(rows:readonly unknown[])=>rows.some(row=>{const data=row as Record<string,unknown>;return Boolean(data.values&&typeof data.values==='object'&&Object.values(data.values).some(value=>value!=null))||['revenue','operatingProfit','netIncome','eps','bps','per','pbr','roe'].some(key=>data[key]!=null);});
export type RefreshPeriod = 'Q1' | 'Q2' | 'Q3' | 'ANNUAL' | 'ALL';
type RefreshCounts = { processed:number; disclosureCompleted:number; valuationCompleted:number; noDisclosure:number; disclosureFailed:number; supplementFailed:number };
type Task={state:string;code?:string};
type Result = { tasks?:{dart:Task;valuation:Task}; fiscalYear?: number; period: RefreshPeriod; status: 'SUCCESS' | 'NO_DATA' | 'FAILED'; code?: string; valuationStatus?: string; valuationReasons?: Record<string,string>; valuationErrors?:Record<string,string> };
type RefreshStatus = {leaseState?:'ALIVE'|'CHECK_REQUIRED'|null;activityState?:string;acceptedAt?:string;executionStartedAt?:string|null;lastProgressAt?:string|null;waitReason?:string|null;financialCollectedAt?:string|null;supplementUpdatedAt?:string|null;startedAt?:string; requestId:string; state: 'QUEUED' | 'PROCESSING' | 'FINISHED'; status: string; finishedAt: string | null; fiscalYear: number; startYear?: number; endYear?: number; period: RefreshPeriod; results: Result[]; counts?:RefreshCounts; terminalCode?:string;refreshMode?:'FULL'|'SUPPLEMENT';progress?: {tasks?:{dart:Task;valuation:Task};currentYear:number;currentPeriod?:RefreshPeriod;stage:string;completed:number;total:number}|null };
const labels: Record<RefreshPeriod, string> = { Q1: '1분기', Q2: '반기', Q3: '3분기', ANNUAL: '사업보고서', ALL: '연도 전체' };
const errorText = (code?: string) => {
  if (['010', '011', '012', 'API_KEY_MISSING', 'DART_NOT_CONFIGURED'].includes(code ?? '')) return '인증·접근 설정을 확인해 주세요.';
  if (['020', 'DAILY_CALL_LIMIT'].includes(code ?? '')) return '일일 API 호출 한도에 도달했습니다.';
  if (code === 'DART_CORP_CODE_NOT_MAPPED') return 'DART 기업코드가 연결되지 않았습니다.';
  return '업데이트에 실패했습니다. 잠시 후 다시 시도해 주세요.';
};
type Props = { stockId: string; collectedAt: string|null; startYear?:number; endYear?:number; initialPeriod?:RefreshPeriod; onComplete?:()=>void; onSelection?:(year:number,period:RefreshPeriod)=>void; fixedYear?:number; allReports?:boolean; visible?:boolean;hasExistingData?:boolean };
export function FinancialRefreshControls({stockId,collectedAt,startYear:initialStart,endYear:initialEnd,initialPeriod='ALL',onComplete,fixedYear,allReports,visible=true}:Props) {
  const currentYear = Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Seoul' }).format(new Date()));
  const minimumYear=initialPeriod==='ANNUAL'&&!allReports?2015:2020;
  const boundYear=(year:number)=>Math.max(minimumYear,Math.min(currentYear,year));
  const defaultStart=boundYear(initialStart??fixedYear??currentYear-2),defaultEnd=boundYear(initialEnd??fixedYear??currentYear);
  const [startYear,setStartYear]=useState(defaultStart),[endYear,setEndYear]=useState(defaultEnd),[period,setPeriod]=useState<RefreshPeriod>(allReports?'ALL':initialPeriod);
  const [requestId,setRequestId]=useState<string|null>(()=>sessionStorage.getItem(`financialRefresh:${stockId}`));
  const [clock,setClock]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const [uncertain,setUncertain]=useState(false),[toast,setToast]=useState('');
  const token=useRef<string|null>(null),toastHandled=useRef('');
  const client=useQueryClient(),submitLock=useRef(false),handled=useRef<string|null>(null),callback=useRef(onComplete);callback.current=onComplete;
  const mutation=useMutation({mutationFn:(refreshMode:'FULL'|'SUPPLEMENT')=>{token.current??=crypto.randomUUID();return apiRequest<{requestId:string}>(`/securities/${encodeURIComponent(stockId)}/financial-refresh`,{method:'POST',body:JSON.stringify({startYear,endYear,period,refreshMode,clientRequestId:token.current}),signal:AbortSignal.timeout(15000)});},onSuccess:data=>{setUncertain(false);token.current=null;sessionStorage.setItem(`financialRefresh:${stockId}`,data.requestId);setRequestId(data.requestId);void active.refetch();},onError:error=>{if(error instanceof ApiError&&error.code==='REFRESH_REQUEST_MISMATCH')token.current=null;setUncertain(true);void active.refetch().then(result=>{if(!result.isError)setUncertain(false);});},onSettled:()=>{submitLock.current=false;}});
  const materialTimes=useQuery({queryKey:['financialMaterialTimes',stockId],queryFn:({signal})=>apiRequest<{financialCollectedAt:string|null;supplementUpdatedAt:string|null}>(`/securities/${encodeURIComponent(stockId)}/financial-refresh/material-times`,{signal}),enabled:visible});
  const active=useQuery({queryKey:['financialRefreshActive',stockId],queryFn:({signal})=>apiRequest<RefreshStatus|null>(`/securities/${encodeURIComponent(stockId)}/financial-refresh/active`,{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])}),staleTime:0,retry:1,refetchInterval:q=>visible&&(q.state.data?.requestId||q.state.error)?3000:false});
  useEffect(()=>{if(visible){void active.refetch();if(requestId)void status.refetch();}},[visible,stockId]);
  useEffect(()=>{const sync=()=>{if(document.visibilityState==='visible'){void active.refetch();if(requestId)void status.refetch();}};window.addEventListener('focus',sync);document.addEventListener('visibilitychange',sync);return()=>{window.removeEventListener('focus',sync);document.removeEventListener('visibilitychange',sync);};},[stockId,requestId]);
  useEffect(()=>{if(active.data?.requestId&&active.data.state!=='FINISHED'){
    sessionStorage.setItem(`financialRefresh:${stockId}`,active.data.requestId);setRequestId(active.data.requestId);
  }},[active.data,stockId]);
  const status=useQuery({queryKey:['financialRefresh',stockId,requestId],queryFn:({signal})=>apiRequest<RefreshStatus>(`/securities/${encodeURIComponent(stockId)}/financial-refresh/${requestId}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])}),enabled:Boolean(requestId),refetchInterval:q=>q.state.data?.state==='FINISHED'?false:3000,retry:1});
  useEffect(()=>{if(status.data&&status.data.state!=='FINISHED'){setStartYear(status.data.startYear??status.data.fiscalYear);setEndYear(status.data.endYear??status.data.fiscalYear);setPeriod(status.data.period);}},[status.data]);
  useEffect(()=>{
    if(status.data?.state!=='FINISHED'||handled.current===requestId)return;
    handled.current=requestId;sessionStorage.removeItem(`financialRefresh:${stockId}`);
    for(const key of ['financialMaterialTimes','securityAnalysis','financialDetail','financialPreview','financialChartAll'])void client.invalidateQueries({queryKey:[key,stockId]});
    for(const key of ['financialList','valueStored'])void client.invalidateQueries({queryKey:[key]});
    client.setQueryData<RefreshStatus|null>(['financialRefreshActive',stockId],current=>current?.requestId===requestId?null:current);
    void active.refetch();
    callback.current?.();
  },[status.data?.state,requestId,stockId,client]);
  const busy=uncertain||mutation.isPending||Boolean(active.data?.requestId&&active.data.state!=='FINISHED')||Boolean(requestId&&status.data?.state!=='FINISHED'),invalid=startYear>endYear;
  useEffect(()=>{if(!busy){setStartYear(defaultStart);setEndYear(defaultEnd);setPeriod(allReports?'ALL':initialPeriod);}},[defaultStart,defaultEnd,initialPeriod,allReports]);
  const finished=status.data?.state==='FINISHED'?status.data:null,range=`${startYear}–${endYear}년 ${labels[period]}`;
  const years=Array.from({length:currentYear-(period==='ANNUAL'?2015:2020)+1},(_,i)=>({value:String(currentYear-i),label:String(currentYear-i)}));
  const submit=(mode:'FULL'|'SUPPLEMENT')=>{if(busy||active.isPending||active.isError||invalid||submitLock.current)return;submitLock.current=true;mutation.mutate(mode);};
  const current=status.data??active.data;
  const financialAt=[current?.financialCollectedAt,materialTimes.data?.financialCollectedAt,collectedAt].filter((at):at is string=>Boolean(at)).sort().at(-1);
  const supplementAt=[current?.supplementUpdatedAt,materialTimes.data?.supplementUpdatedAt].filter((at):at is string=>Boolean(at)).sort().at(-1);
  const elapsed=(at?:string|null)=>at?`${Math.max(0,Math.floor((clock-Date.parse(at))/1000))}초`:'미기록';
  const waitLabels:Record<string,string>={CHECKING:'대기 사유 확인 중',AUTOMATIC:'자동 수집 종료 대기',PREVIOUS_REQUEST:'앞선 요청 처리 대기',LOCK:'실행 잠금 대기'};
  if(current?.leaseState==='CHECK_REQUIRED')waitLabels.LOCK='실행 잠금 대기 · 수집기 응답 확인 중';
  const progress=status.data?.progress;
  useEffect(()=>{const failed=progress?.tasks?.dart.state==='FAILED'||status.data?.results.some(r=>r.tasks?.dart.state==='FAILED');if(failed&&requestId&&toastHandled.current!==requestId){toastHandled.current=requestId;setToast('DART 수집 실패·시간 초과 · 가치지표 보완은 계속 진행합니다.');}},[progress,status.data,requestId]);
  const reportCount=period==='ALL'?4:1;
  const completedYears=Array.from({length:endYear-startYear+1},(_,i)=>startYear+i).filter(y=>(status.data?.results??[]).filter(r=>(r.fiscalYear??status.data?.fiscalYear)===y).length===reportCount);
  const stageText:Record<string,string>={DISCLOSURE:'공시 확인 중',FINANCIALS:'재무제표 수집 중',VALUATION:'가치지표 보충 중',REPORT_DONE:'처리 중'};
  const taskLabels:Record<string,string>={QUEUED:'대기',RUNNING:'중',SUCCESS:'완료',PARTIAL:'일부 자료 부족',FAILED:'실패',NO_DATA:'미공시',UNAVAILABLE:'자료 미제공',SKIPPED:'요청 없음'};
  const taskText=progress?.tasks?`DART 수집 ${taskLabels[progress.tasks.dart.state]??progress.tasks.dart.state} · 가치지표 보완 ${taskLabels[progress.tasks.valuation.state]??progress.tasks.valuation.state}`:null;
  const progressText=taskText??([...completedYears.map(y=>`${y}년 처리 완료`),...(progress&&!completedYears.includes(progress.currentYear)?[`${progress.currentYear}년 ${progress.currentPeriod?labels[progress.currentPeriod]+' ':''}${stageText[progress.stage]??'처리 중'}`]:[])].join(' · ')||'서버 처리 대기 중');
  const completed=finished?.counts?.disclosureCompleted??finished?.results.filter(r=>r.status==='SUCCESS').length??0,noData=finished?.counts?.noDisclosure??finished?.results.filter(r=>r.status==='NO_DATA').length??0,failed=finished?.counts?.disclosureFailed??finished?.results.filter(r=>r.status==='FAILED').length??0;
  const outcome=finished?refreshOutcome(finished):null;
  return <Stack spacing={1.5} data-testid="financial-refresh-form">
    <Box sx={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(0,1.35fr)',gap:'6px','& .MuiSelect-select':{fontSize:11,py:0,pl:0,pr:'16px !important'},'& .MuiSelect-icon':{fontSize:16,right:0}}}>
      <Box sx={{display:'flex',alignItems:'center',height:36,px:'6px',gap:'4px',minWidth:0,bgcolor:colors.raised,border:'1px solid',borderColor:colors.borderStrong,borderRadius:'8px'}}>
        <Typography sx={{fontSize:10,color:colors.textSecondary,whiteSpace:'nowrap'}}>갱신범위</Typography>
        <Select inputProps={{'aria-label':'갱신범위'}} variant="standard" disableUnderline value={period} onChange={e=>{const next=e.target.value as RefreshPeriod;setPeriod(next);if(next!=='ANNUAL'){setStartYear(y=>Math.max(2020,y));setEndYear(y=>Math.max(2020,y));}}} disabled={busy} sx={{flex:1,minWidth:0,textAlign:'right'}}>{Object.entries(labels).map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}</Select>
      </Box>
      <Box role="group" aria-label="갱신연도" sx={{display:'flex',alignItems:'center',height:36,px:'6px',gap:'4px',minWidth:0,bgcolor:colors.raised,border:'1px solid',borderColor:invalid?'error.main':colors.borderStrong,borderRadius:'8px'}}>
        <Typography sx={{fontSize:10,color:colors.textSecondary,whiteSpace:'nowrap'}}>갱신연도</Typography>
        <Select inputProps={{'aria-label':'갱신 시작연도'}} variant="standard" disableUnderline value={String(startYear)} onChange={e=>setStartYear(Number(e.target.value))} disabled={busy} sx={{flex:1,minWidth:0,textAlign:'right'}}>{years.map(option=><MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select>
        <Typography aria-hidden="true" sx={{fontSize:12,color:colors.textSecondary}}>~</Typography>
        <Select inputProps={{'aria-label':'갱신 종료연도'}} variant="standard" disableUnderline value={String(endYear)} onChange={e=>setEndYear(Number(e.target.value))} disabled={busy} sx={{flex:1,minWidth:0,textAlign:'right'}}>{years.map(option=><MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}</Select>
      </Box>
    </Box>
    {invalid&&<Typography role="alert" sx={{fontSize:11,color:'error.main'}}>시작연도가 종료연도보다 늦습니다.</Typography>}
    <Stack sx={{gap:'4px'}}>
    {initialEnd!==undefined&&initialEnd>currentYear&&<Typography sx={{fontSize:11,color:'text.secondary'}}>미래 기간은 제외하고 {currentYear}년까지 갱신합니다.</Typography>}
    <Typography sx={{fontSize:11,color:'text.secondary'}}>현재 종목만 갱신합니다. 실패·미공시 자료는 기존 데이터를 유지합니다.</Typography>
    <Typography sx={{fontSize:11,color:'text.secondary'}}>재무제표 수집 시각: {financialAt?new Date(financialAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미기록'}</Typography>
    <Typography sx={{fontSize:11,color:'text.secondary'}}>보완자료 갱신 시각: {supplementAt?new Date(supplementAt).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미기록'}</Typography>
    <Typography sx={{fontSize:11,color:'text.secondary'}}>보완자료만 갱신하면 기존 재무제표를 유지하고 누락된 가치지표를 보완합니다.</Typography>
    <Typography sx={{fontSize:11,color:'text.secondary'}}>갱신 대상: {range}</Typography>
    </Stack>
    <Box sx={{display:'grid',gridTemplateColumns:'1fr 1.4fr',gap:'8px','&&':{mt:'20px'},'&& .MuiButton-root':{height:36,minHeight:36,maxHeight:36,minWidth:0,px:'8px',py:0,fontSize:12,whiteSpace:'nowrap'}}}>
      <ActionButton size="small" tone="danger" disabled={busy||active.isPending||active.isError||invalid} startIcon={busy&&mutation.variables==='FULL'?<HourglassEmptyIcon/>:undefined} onClick={()=>submit('FULL')}>전체 갱신</ActionButton>
      <ActionButton size="small" tone="primary" disabled={busy||active.isPending||active.isError||invalid} startIcon={busy&&mutation.variables==='SUPPLEMENT'?<HourglassEmptyIcon/>:undefined} onClick={()=>submit('SUPPLEMENT')}>보완자료만 갱신</ActionButton>
    </Box>
    {busy&&!status.isError&&!active.isError&&<Typography role="status" aria-live="polite" sx={{fontSize:11,lineHeight:'18px',overflowWrap:'anywhere'}}>{current?.activityState==='CHECKING'?(current.leaseState==='CHECK_REQUIRED'?'실행 잠금 유지 중 · 수집기 응답 확인 중':'실행 상태 확인 중 · 최근 활동과 실행 잠금을 확인하고 있습니다.'):current?.state==='QUEUED'?`${waitLabels[current.waitReason??'CHECKING']??waitLabels.CHECKING} · 대기 ${elapsed(current.acceptedAt??current.startedAt)}`:`처리 중 · 실행 ${elapsed(current?.executionStartedAt)} · ${progressText}`}{progress?` (${progress.completed}/${progress.total} 보고서)`:''}</Typography>}
    {mutation.isError&&<Alert severity="error">{mutation.error instanceof ApiError?mutation.error.message:errorText()}</Alert>}
    {active.isError&&<QueryErrorNotice message="진행 작업 확인에 실패했습니다. 서버 상태를 다시 확인해 주세요." onRetry={()=>void active.refetch().then(result=>{if(!result.isError)setUncertain(false);})}/>}
    {status.isError&&<QueryErrorNotice message="진행 상태 조회에 실패했습니다. 작업 종료 여부를 다시 확인해 주세요." onRetry={()=>void status.refetch()}/>}
    {finished?.terminalCode&&<Alert severity="warning">시간 제한으로 작업이 종료되었습니다. 기존 데이터는 유지했습니다.</Alert>}
    {finished&&outcome&&<Alert severity={outcome.severity} sx={outcome.tone==='neutral'?{color:'#94A3B8',bgcolor:'#1E293B','& .MuiAlert-icon':{color:'#94A3B8'}}:undefined}>
      <Typography sx={{fontSize:12}}>{finished.startYear??finished.fiscalYear}–{finished.endYear??finished.fiscalYear}년 · {outcome.title}</Typography>
      {finished.refreshMode==='SUPPLEMENT'?<Typography sx={{fontSize:11}}>기존 재무제표 유지 · 보완자료만 수집</Typography>:<Typography sx={{fontSize:11}}>보고서 기준: 공시 확인 완료 {completed} · 미공시 {noData} · 수집 실패 {failed}</Typography>}
      <Typography sx={{fontSize:11}}>완료 {outcome.completed}건 · 일부 자료 부족 {outcome.missing}건 · 오류 {outcome.failed}건</Typography>
      {outcome.missing>0&&<Typography sx={{fontSize:11}}>계산 근거나 원천 자료가 부족한 항목이 있습니다. 기존 값은 유지했습니다.</Typography>}
      <Box component="details" sx={{mt:1,fontSize:11}}><Box component="summary" sx={{cursor:'pointer'}}>상세 내용</Box>
        {finished.results.map((r,i)=><Box key={i} sx={{mt:1}}>{r.fiscalYear??finished.fiscalYear}년 {labels[r.period]}: {r.tasks?`재무제표 ${r.tasks.dart.state==='SKIPPED'?'기존 자료 유지':taskLabels[r.tasks.dart.state]??r.tasks.dart.state} / 가치지표 보완 ${taskLabels[r.tasks.valuation.state]??r.tasks.valuation.state}`:r.status==='SUCCESS'?'공시 확인 완료 · '+(r.valuationStatus==='SUCCESS'?'가치지표 보충 완료':'가치지표 보충 미완료'):r.status==='NO_DATA'?'미공시 · 기존 데이터 유지':errorText(r.code)}{r.tasks?.dart.state==='FAILED'&&<Typography sx={{fontSize:11}}>기존 재무제표는 유지했습니다.</Typography>}
          {[...new Set([...Object.values(r.valuationReasons??{}),...Object.values(r.valuationErrors??{}).map(code=>errorText(code))])].map(reason=><Typography key={reason} sx={{fontSize:11}}>{reason}</Typography>)}
        </Box>)}
      </Box>
    </Alert>}
    <Snackbar open={Boolean(toast)} autoHideDuration={6000} onClose={()=>setToast('')} message={toast}/>
  </Stack>;
}
export function FinancialRefreshDialog({open,onClose,...props}:Props&{open:boolean;onClose:()=>void}) {
 return <HistoryDialog keepMounted open={open} onClose={onClose} fullWidth maxWidth="sm" slotProps={{paper:{sx:{m:'16px 24px',width:'calc(100% - 48px)',boxSizing:'border-box',maxHeight:'calc(100dvh - 32px)',bgcolor:colors.surface,border:`1px solid ${colors.border}`,backgroundImage:'none',borderRadius:`${radius.lg}px`}}}}><DialogTitle sx={{display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:15,p:2,pb:0,flexShrink:0}}>재무제표 갱신<IconButton onClick={onClose} aria-label="재무제표 갱신 닫기"><CloseIcon/></IconButton></DialogTitle><DialogContent sx={{p:2,pt:0,overflowY:'auto',minHeight:0}}><FinancialRefreshControls key={props.stockId} {...props} visible={open}/></DialogContent></HistoryDialog>;
}

/** Shared by both entry screens; status comes from the durable server job, not session state. */
export function FinancialRefreshButton({stockId,onClick,compact=false}:{stockId:string;onClick:()=>void;compact?:boolean}) {
 const active=useQuery({queryKey:['financialRefreshActive',stockId],queryFn:({signal})=>apiRequest<RefreshStatus|null>(`/securities/${encodeURIComponent(stockId)}/financial-refresh/active`,{signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])}),staleTime:0,retry:1,refetchInterval:q=>q.state.data?3000:false});
 const running=!!active.data&&active.data.state!=='FINISHED';
 return <ActionButton tone="muted" aria-label="재무제표 갱신" size="small" startIcon={running?<CircularProgress size={12}/>:<RefreshRoundedIcon sx={{fontSize:16}}/>} onClick={onClick} >{running?'갱신 중':compact?'갱신':'재무제표 갱신'}</ActionButton>;
}
