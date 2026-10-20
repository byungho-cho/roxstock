import {useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Box,Button,Typography} from '@mui/material';
import {apiRequest} from '../../data/apiClient';
import type {NewsCollection} from '../../data/stockNewsApi';
import {PageHeader} from '../../components/navigation/Navigation';
import {FormSelect} from '../../components/forms/Fields';
import {showSuccessToast} from '../../components/common/QueryErrorNotice';
import {newsTime} from './newsUi';
export const newsCollectionOptions={queryKey:['news-collection-settings'],queryFn:()=>apiRequest<NewsCollection>('/stock-news/settings'),staleTime:0};
export const newsPanel={bgcolor:'#111827',border:'1px solid #1E293B',borderRadius:'12px',p:'12px',minWidth:0,display:'flex',flexDirection:'column',gap:'8px'} as const;
const label={fontSize:14,lineHeight:'20px',color:'#F8FAFC'},hint={fontSize:11,lineHeight:'17px',color:'#CBD5E1'};
export function NewsCollectionSettings(){
 const query=useQuery(newsCollectionOptions),client=useQueryClient();
 const [draft,setDraft]=useState<{intervalHours:number;startTime:string}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(query.data&&!draft)setDraft({intervalHours:query.data.intervalHours,startTime:query.data.startTime});},[query.data,draft]);
 const save=async()=>{if(!draft||busy)return;setBusy(true);setError('');try{const data=await apiRequest<NewsCollection>('/stock-news/settings',{method:'PUT',body:JSON.stringify(draft)});client.setQueryData(newsCollectionOptions.queryKey,data);await Promise.all(['stockNews','collection-monitoring-summary','collection-monitor-pages'].map(name=>client.invalidateQueries({queryKey:[name],refetchType:'none'})));showSuccessToast('저장했습니다.');}catch(e){setError(e instanceof Error?e.message:'저장에 실패했습니다.');}finally{setBusy(false);}};
 const interval=draft?.intervalHours??3,parts=(draft?.startTime??'06:00').split(':'),preview=Array.from({length:Math.min(8,Math.ceil(24/interval))},(_,i)=>{const minute=(Number(parts[0])*60+Number(parts[1])+i*interval*60)%1440;return String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');});
 return <><PageHeader embedded title="종목소식 수집 설정" showBack showBackTablet backPath="/detail/settings" showAdd={false}/>
 <Box data-testid="news-schedule-settings" sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:'8px',alignItems:'start',pt:'8px'}}>
  <Box sx={{display:'flex',flexDirection:'column',gap:'8px',minWidth:0}}><Box sx={newsPanel}>
   <Typography sx={{fontSize:15,fontWeight:600,lineHeight:'21px'}}>자동 수집</Typography>
   <Box data-testid="news-interval-row" sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',height:28}}><Typography sx={label}>수집 주기</Typography><Box sx={{width:112,flexShrink:0}}><FormSelect compact size="small" label="수집 주기" value={String(interval)} onChange={v=>setDraft(d=>({...d!,intervalHours:Number(v)}))} options={Array.from({length:24},(_,i)=>({value:String(i+1),label:`${i+1}시간`}))} disabled={!draft||busy}/></Box></Box>
   <Typography sx={hint}>1~24시간 · 1시간 단위</Typography>
   <Box data-testid="news-start-row" sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',height:28}}><Typography sx={label}>기준 시작 시각</Typography><Box sx={{display:'flex',width:112,height:28,boxSizing:'border-box',px:'12px',pr:'8px',bgcolor:'#1E293B',border:'1px solid #1E293B',borderRadius:'6px',flexShrink:0,alignItems:'center','& > div':{flex:'0 0 24px',width:24,minWidth:0},'& > div:last-child':{flex:1},'& .MuiBox-root':{px:0,border:0,bgcolor:'transparent'},'& .MuiSelect-select':{fontSize:13},'& > div:first-of-type .MuiSelect-icon':{display:'none'},'& > div:first-of-type .MuiSelect-select':{pr:'0 !important'},'& .MuiSelect-icon':{right:0}}}><FormSelect compact size="small" label="시작 시" value={parts[0]!} onChange={v=>setDraft(d=>({...d!,startTime:v+':'+parts[1]}))} options={Array.from({length:24},(_,i)=>({value:String(i).padStart(2,'0'),label:String(i).padStart(2,'0')}))} disabled={!draft||busy}/><span>:</span><FormSelect compact size="small" label="시작 분" value={parts[1]!} onChange={v=>setDraft(d=>({...d!,startTime:parts[0]+':'+v}))} options={Array.from({length:60},(_,i)=>({value:String(i).padStart(2,'0'),label:String(i).padStart(2,'0')}))} disabled={!draft||busy}/></Box></Box>
   <Typography sx={hint}>한국시간 KST</Typography>
  </Box><Button onClick={()=>void save()} disabled={!draft||busy} sx={{height:44,bgcolor:'#60A5FA',border:'1px solid #1E293B',borderRadius:'12px',fontSize:14,color:'#F8FAFC'}}>저장</Button>{(error||query.isError)&&<Typography role="alert" sx={{...hint,color:'#FA6170'}}>{error||'설정을 조회할 수 없습니다.'}</Typography>}{query.isError&&<Button onClick={()=>void query.refetch()}>다시 조회</Button>}</Box>
  <Box sx={newsPanel}><Typography data-testid="news-next-scheduled" sx={{fontSize:15,fontWeight:600,lineHeight:'21px',color:'#60A5FA'}}>다음 수집 {newsTime(query.data?.nextAt)}</Typography><Typography sx={{fontSize:12,lineHeight:'18px',overflowWrap:'anywhere'}}>{Array.from({length:Math.ceil(preview.length/4)},(_,i)=><Box component="span" key={i} sx={{display:'block'}}>{preview.slice(i*4,i*4+4).join(' → ')}</Box>)}</Typography><Typography sx={hint}>저장 후 다음 예정 시각이 갱신됩니다.<br/>실행 중인 수집은 계속 진행합니다.</Typography></Box>
 </Box></>;
}
