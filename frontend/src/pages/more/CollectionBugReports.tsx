import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useInfiniteQuery,useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {Alert,Box,Button,DialogContent,DialogTitle,IconButton,MenuItem,Select,Stack,TextField,Typography} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import {HistoryDialog} from '../../components/common/HistoryDialog';
import {ActionButton} from '../../components/common/Common';
import {apiRequest} from '../../data/apiClient';
import {colors} from '../../styles/tokens';
type Report={id:string;feature:string;code:string;severity:string;summary:string;state:string;occurrences:number;firstSeenAt:string;lastSeenAt:string;reviewNote:string|null};
type Event={eventKey:string;observedAt:string;securityId?:string;securityName?:string|null;symbol?:string|null;fiscalYear?:number|null;periodType?:string|null;runId?:string;metric?:string|null};
type Detail=Report&{events:Event[]};
const states:Record<string,string>={UNRESOLVED:'미해결',OPEN:'신규',REVIEWING:'검토 중',RESOLVED:'해결 완료',ALL:'전체'};
const names:Record<string,string>={'dart-financial-statements':'재무제표·가치지표','investor-trends':'투자동향','security-master':'종목 마스터','market-prices':'전체 종목 주가','realtime-prices':'실시간 주가','account-snapshots':'계좌 스냅샷'};
const date=(s:string)=>new Date(s).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});
export function CollectionBugReportSummary(){
 const navigate=useNavigate();
 const query=useQuery({queryKey:['collection-bug-reports','summary'],queryFn:({signal})=>apiRequest<{open:number;reviewing:number;resolved:number;lastSeenAt:string|null}>('/collection/bug-reports/summary',{signal}),refetchInterval:60000});
 return <Box data-testid="collection-bug-report-summary" sx={{mt:'4px',p:'12px',bgcolor:'#0E131F',border:'1px solid #26334A',borderRadius:'8px',minWidth:0}}>
  <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:1,height:19}}><Typography sx={{fontSize:12,fontWeight:600,lineHeight:1.1}}>오류 리포트</Typography><Button onClick={()=>navigate('/detail/collection-monitoring/bug-reports')} sx={{fontSize:10,lineHeight:1,fontWeight:600,minWidth:82,height:19,minHeight:19,px:1,py:0,borderRadius:'999px',border:'1px solid #7A8CA8',bgcolor:'transparent','&:hover':{bgcolor:'transparent',borderColor:'#94A3B8'}}}>상세보기</Button></Box>
  {query.isError?<Typography sx={{fontSize:11,color:colors.warning}}>요약을 불러오지 못했습니다.</Typography>:!query.data?<Typography sx={{fontSize:11,color:colors.textMuted}}>리포트 조회 중</Typography>:<>
   <Box sx={{display:'flex',flexWrap:'wrap',gap:'4px 12px',mt:'6px',fontSize:11}}><span style={{color:'#FAB83B'}}>신규 {query.data.open}건</span><span style={{color:'#3D8CF5'}}>검토 중 {query.data.reviewing}건</span><span style={{color:'#34D399'}}>해결 완료 {query.data.resolved}건</span></Box>
   <Typography sx={{fontSize:10,color:colors.textMuted,mt:'4px'}}>{query.data.lastSeenAt?'최근 발생 '+date(query.data.lastSeenAt):'발생한 리포트가 없습니다.'}</Typography>
  </>}
 </Box>;
}
export function CollectionBugReports(){
 const [state,setState]=useState('UNRESOLVED'),[day,setDay]=useState(''),[selected,setSelected]=useState<string|null>(null),[note,setNote]=useState('');const client=useQueryClient();
 const list=useInfiniteQuery({queryKey:['collection-bug-reports',state,day],initialPageParam:0,queryFn:({pageParam,signal})=>apiRequest<{rows:Report[];hasNext:boolean;nextOffset:number}>('/collection/bug-reports?'+new URLSearchParams({state,offset:String(pageParam),...(day?{date:day}:{})}),{signal}),getNextPageParam:p=>p.hasNext?p.nextOffset:undefined,refetchInterval:60000});
 const detail=useQuery({queryKey:['collection-bug-report',selected],queryFn:({signal})=>apiRequest<Detail>('/collection/bug-reports/'+selected,{signal}),enabled:!!selected});
 useEffect(()=>{setNote(detail.data?.reviewNote??'');},[detail.data]);
 const mutation=useMutation({mutationFn:async(action:string)=>apiRequest('/collection/bug-reports/'+selected,{method:action==='DELETE'?'DELETE':'PATCH',...(action==='DELETE'?{}:{body:JSON.stringify({state:action==='SAVE'?detail.data?.state:action,note})})}),onSuccess:(_data,action)=>{void client.invalidateQueries({queryKey:['collection-bug-reports']});void client.invalidateQueries({queryKey:['collection-bug-report',selected]});if(action==='DELETE')setSelected(null);}});
 const rows=list.data?.pages.flatMap(p=>p.rows??[])??[];
 return <Box data-testid="collection-bug-reports" sx={{mt:'12px',p:'12px',bgcolor:'#0E131F',border:'1px solid #26334A',borderRadius:'8px',minWidth:0}}>
  <Typography sx={{fontSize:13,fontWeight:600}}>오류 리포트</Typography>
  <Typography sx={{fontSize:11,color:colors.textMuted,mt:'4px'}}>수집 오류·보완 누락을 자동 기록합니다. 같은 원인은 묶어서 표시합니다.</Typography>
  <Box sx={{display:'grid',gridTemplateColumns:day?'minmax(0,1fr) minmax(0,1.3fr) auto':'minmax(0,1fr) minmax(0,1.3fr)',gap:'8px',my:'8px',minWidth:0,width:'100%'}}><Select size="small" inputProps={{'aria-label':'리포트 상태'}} value={state} onChange={e=>setState(e.target.value)} sx={{fontSize:11,minWidth:0,width:'100%',height:32,'& .MuiSelect-select':{minWidth:0}}}>{['UNRESOLVED','REVIEWING','RESOLVED','ALL'].map(s=><MenuItem key={s} value={s}>{states[s]}</MenuItem>)}</Select><Box component="input" aria-label="리포트 발생일" type="date" value={day} onChange={e=>setDay(e.target.value)} sx={{bgcolor:colors.raised,color:colors.textSecondary,border:'1px solid #334155',borderRadius:'6px',px:'6px',minWidth:0,width:'100%',height:32,boxSizing:'border-box',fontSize:11}}/>{day&&<Button size="small" onClick={()=>setDay('')} sx={{minWidth:0,fontSize:11}}>전체 날짜</Button>}</Box>
  {list.isError?<Alert severity="error" action={<Button onClick={()=>void list.refetch()}>재시도</Button>}>리포트를 불러오지 못했습니다.</Alert>:list.isPending?<Typography sx={{fontSize:11,color:colors.textMuted}}>리포트 조회 중</Typography>:!rows.length?<Typography sx={{fontSize:11,color:colors.textMuted,py:'8px'}}>해당 조건의 리포트가 없습니다.</Typography>:<Stack spacing={.75}>{rows.map(report=><Box component="button" key={report.id} onClick={()=>{mutation.reset();setSelected(report.id);}} sx={{appearance:'none',textAlign:'left',bgcolor:'#111825',border:'1px solid #26334A',borderRadius:'6px',p:'8px',color:'inherit',cursor:'pointer',width:'100%'}}><Box sx={{display:'flex',justifyContent:'space-between',gap:1,fontSize:11}}><span>{names[report.feature]??report.feature}</span><span style={{color:report.state==='RESOLVED'?'#34D399':report.severity==='ERROR'?'#F26A6F':'#FAB83B'}}>{states[report.state]} · {report.occurrences}회</span></Box><Typography sx={{fontSize:11,mt:'4px',overflowWrap:'anywhere'}}>{report.summary}</Typography><Typography sx={{fontSize:10,color:colors.textMuted,mt:'4px'}}>최근 {date(report.lastSeenAt)} · {report.code}</Typography></Box>)}</Stack>}
  {list.hasNextPage&&<Button fullWidth disabled={list.isFetchingNextPage} onClick={()=>void list.fetchNextPage()} sx={{fontSize:11,mt:1}}>{list.isFetchingNextPage?'불러오는 중':'더보기'}</Button>}
  <HistoryDialog open={!!selected} onClose={()=>setSelected(null)} fullWidth maxWidth="sm"><DialogTitle sx={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:15}}>오류 리포트 상세<IconButton aria-label="오류 리포트 닫기" onClick={()=>setSelected(null)}><CloseIcon/></IconButton></DialogTitle><DialogContent>
   {detail.isPending?<Typography>조회 중</Typography>:detail.isError?<Alert severity="error" action={<Button onClick={()=>void detail.refetch()}>재시도</Button>}>상세 조회에 실패했습니다.</Alert>:detail.data&&<Stack spacing={1.5}>
    <Typography sx={{fontSize:13,fontWeight:600}}>{detail.data.summary}</Typography><Typography sx={{fontSize:11,color:colors.textMuted,overflowWrap:'anywhere'}}>{names[detail.data.feature]??detail.data.feature} · {detail.data.code}<br/>최초 {date(detail.data.firstSeenAt)}<br/>최근 {date(detail.data.lastSeenAt)} · 총 {detail.data.occurrences}회<br/>상태: {states[detail.data.state]}</Typography>
    <TextField multiline minRows={2} size="small" label="검토 메모" slotProps={{htmlInput:{maxLength:1000}}} value={note} onChange={e=>setNote(e.target.value)}/>
    <Box sx={{display:'flex',gap:'6px',flexWrap:'wrap'}}><ActionButton size="small" tone="muted" disabled={mutation.isPending} onClick={()=>mutation.mutate('SAVE')}>메모 저장</ActionButton><ActionButton size="small" tone="primary" disabled={mutation.isPending||detail.data.state==='REVIEWING'} onClick={()=>mutation.mutate('REVIEWING')}>검토 중</ActionButton><ActionButton size="small" tone="muted" disabled={mutation.isPending||detail.data.state==='RESOLVED'} onClick={()=>mutation.mutate('RESOLVED')}>해결 완료</ActionButton>{detail.data.state==='RESOLVED'&&<ActionButton size="small" tone="danger" disabled={mutation.isPending} onClick={()=>mutation.mutate('DELETE')}>리포트 삭제</ActionButton>}</Box>
    {mutation.isError&&<Alert severity="error">변경하지 못했습니다. 다시 시도해 주세요.</Alert>}
    {mutation.isSuccess&&<Typography sx={{fontSize:11,color:'#34D399'}}>저장했습니다.</Typography>}
    <Typography sx={{fontSize:11,color:colors.textMuted}}>해결 후 새로 발생하면 다시 열립니다. 삭제는 해결 완료한 리포트에만 적용됩니다.</Typography>
    <Typography sx={{fontSize:12,fontWeight:600}}>최근 발생 내역 (최대 50건)</Typography>
    {detail.data.events.map(event=><Box key={event.eventKey} sx={{p:1,bgcolor:'#111825',borderRadius:'6px',fontSize:11,overflowWrap:'anywhere'}}>{date(event.observedAt)}<br/>{event.securityName??event.symbol??'전체 작업'}{event.symbol?' ('+event.symbol+')':''}{event.fiscalYear?' · '+event.fiscalYear+' '+(event.periodType??''):''}{event.metric?' · '+event.metric.toUpperCase():''}{event.runId?' · 실행 #'+event.runId:''}</Box>)}
   </Stack>}
  </DialogContent></HistoryDialog>
 </Box>;
}
