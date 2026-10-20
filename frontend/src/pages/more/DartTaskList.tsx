import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Box,Button,MenuItem,Select,Typography} from '@mui/material';
import {apiRequest} from '../../data/apiClient';

const labels:Record<string,string>={SUCCESS:'수집 성공',NOT_DUE:'미도래',NO_FILING:'미공시',DATA_UNAVAILABLE:'자료 미제공',REVIEW_REQUIRED:'검토 보류',PENDING:'대기',PROCESSING:'처리 중',FAILED:'실패',EXCLUDED:'수집 제외 (집계 밖)'};
type Page={total:number;nextOffset:number|null;items:Array<{id:string;symbol:string;name:string;year:number;period:string;status:string;reason:string|null;nextCheckAt:string|null;checkedAt:string|null}>};
const date=(value:string|null)=>value?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미정';
export function DartTaskList(){
  const [open,setOpen]=useState(false),[status,setStatus]=useState('NOT_DUE'),[scope,setScope]=useState('priority'),[offset,setOffset]=useState(0);
  const query=useQuery({queryKey:['dart-task-details',scope,status,offset],enabled:open,queryFn:({signal})=>apiRequest<Page>(`/collection/dart/tasks?status=${status}&scope=${scope}&offset=${offset}`,{signal}),refetchInterval:open?60000:false});
  return <Box sx={{border:'1px solid #26334A',borderRadius:2,p:1,minWidth:0}}>
    <Button size="small" onClick={()=>setOpen(v=>!v)} aria-expanded={open}>상태별 작업 상세 {open?'접기':'보기'}</Button>
    {open&&<><Box sx={{display:'flex',gap:1,mt:1}}>
      <Select size="small" value={scope} onChange={e=>{setScope(e.target.value);setOffset(0);}} inputProps={{'aria-label':'작업 범위'}} sx={{fontSize:11}}><MenuItem value="priority">내 우선종목</MenuItem><MenuItem value="all">전체 종목</MenuItem></Select>
      <Select size="small" value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}} inputProps={{'aria-label':'작업 상태'}} sx={{fontSize:11,minWidth:0,flex:1}}>{Object.entries(labels).map(([value,label])=><MenuItem key={value} value={value}>{label}</MenuItem>)}</Select>
    </Box>
    {query.isError?<Button onClick={()=>void query.refetch()}>조회 실패 · 다시 시도</Button>:query.isPending?<Typography sx={{fontSize:11,my:1}}>조회 중</Typography>:<>
      <Typography sx={{fontSize:11,my:1}}>{labels[status]} {query.data.total.toLocaleString()}건</Typography>
      {query.data.items.map(task=><Box key={task.id} sx={{borderTop:'1px solid #26334A',py:1,overflowWrap:'anywhere'}}>
        <Typography sx={{fontSize:12,fontWeight:700}}>{task.name} ({task.symbol}) · {task.year} {task.period}</Typography>
        <Typography sx={{fontSize:11}}>{labels[task.status]} · {task.reason??'사유 기록 없음'}</Typography>
        <Typography sx={{fontSize:10,color:'#7A8CA8'}}>확인 {date(task.checkedAt)} · 다음 확인 {date(task.nextCheckAt)} KST</Typography>
      </Box>)}
      {!query.data.items.length&&<Typography sx={{fontSize:11}}>해당 작업 없음</Typography>}
      <Box sx={{display:'flex',justifyContent:'space-between'}}><Button disabled={!offset} onClick={()=>setOffset(v=>Math.max(0,v-50))}>이전</Button><Button disabled={query.data.nextOffset===null} onClick={()=>setOffset(query.data.nextOffset??offset)}>다음</Button></Box>
    </> }</>}
  </Box>;
}
