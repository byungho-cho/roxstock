import {useEffect,useRef,useState} from 'react';
import {Box,Button,ButtonBase,InputBase,Stack,TextField,Typography} from '@mui/material';
import {useInfiniteQuery,useQuery,useQueryClient} from '@tanstack/react-query';
import {useSearchParams} from 'react-router-dom';
import {apiRequest} from '../../data/apiClient';
import {PageHeader} from '../../components/navigation/Navigation';
import {AppCard} from '../../components/common/Common';
import {StockSearchFrame} from '../../components/common/StockSearchFrame';
import {StockIdentity} from '../stocks/StockIdentity';
import {ConfirmActionDialog} from '../../components/common/ConfirmActionDialog';
import {DelayedSkeleton} from '../../components/common/DelayedSkeleton';
import {CollectionSettingToggle,featureLabels,type ManagedSecurity} from './CollectionSettingToggle';
import {colors} from '../../styles/tokens';
const sourceLabel=(value:string)=>({MANUAL:'사용자 등록',DART:'DART 등록',SECURITY_MASTER:'종목 마스터 수집',UNKNOWN:'출처 미확인'}[value]??'출처 미확인');
type Page={rows:ManagedSecurity[];hasNext:boolean;nextCursor:string|null};
export function SecurityManagementPage(){
 const [params,setParams]=useSearchParams(),query=params.get('query')??'',selected=params.get('selected');
 const [input,setInput]=useState(query),lock=useRef(false);
 useEffect(()=>setInput(query),[query]);
 const list=useInfiniteQuery({queryKey:['security-management',query],initialPageParam:null as string|null,queryFn:({pageParam,signal})=>apiRequest<Page>(`/security-management?${new URLSearchParams({query,...(pageParam?{cursor:pageParam}:{})})}`,{signal}),getNextPageParam:p=>p.hasNext?p.nextCursor:undefined,staleTime:Infinity,refetchOnWindowFocus:false,retry:false});
 const search=()=>{const next=new URLSearchParams(params);next.set('query',input.trim());next.delete('selected');setParams(next);(document.activeElement as HTMLElement)?.blur();};
 const more=async()=>{if(lock.current||list.isFetching||!list.hasNextPage)return;lock.current=true;try{await list.fetchNextPage();}finally{lock.current=false;}};
 const rows=list.data?.pages.flatMap(p=>p.rows)??[];
 return <><PageHeader embedded title="종목 관리" showAdd={false} showBackTablet backPath={selected?`/detail/security-management?query=${encodeURIComponent(query)}`:'/detail/settings?view=settings'}/><Box sx={{pb:4}} data-testid="security-management" data-list-condition={`master:${query}`} data-restoration-ready={list.isPending?'false':'true'}>
 <StockSearchFrame><Box component="img" src="/stocks-v03/search.svg" alt=""/><InputBase aria-label="종목 관리 검색" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();search();}}} placeholder="종목명·코드 검색" sx={{fontSize:12,flex:1,minWidth:0}}/><Button onClick={search} sx={{minWidth:40,fontSize:12}}>검색</Button></StockSearchFrame>
 <Typography sx={{fontSize:11,color:colors.textMuted,my:1}}>종목명 오름차순 · 등록 출처와 수집 설정</Typography>
 {selected?<SecurityEditor key={selected} securityId={selected} onDeleted={()=>{const next=new URLSearchParams(params);next.delete('selected');setParams(next,{replace:true});}}/>:<>
 {list.isPending?<DelayedSkeleton height={64}/>:<Stack spacing={1}>{rows.map(s=><AppCard key={s.id} sx={{p:0}}><ButtonBase data-testid="security-master-row" data-scroll-item={s.id} onClick={()=>{const next=new URLSearchParams(params);next.set('selected',s.id);setParams(next);}} sx={{display:'block',textAlign:'left',width:'100%',p:1.5}}><Typography sx={{fontSize:15,fontWeight:700,overflowWrap:'anywhere'}}><StockIdentity name={s.name} symbol={s.symbol}/></Typography><Typography sx={{fontSize:11,color:colors.textMuted,mt:0.5}}>{sourceLabel(s.registrationSource)} · {s.exclusionReason??(s.excludedFeatures.length?'일부 기능 수집 제외':'수집 활성')}</Typography></ButtonBase></AppCard>)}</Stack>}
 {!list.isPending&&!list.isError&&rows.length===0&&<Typography sx={{fontSize:12}}>검색 결과가 없습니다.</Typography>}
 {list.isError&&<Typography role="alert" sx={{fontSize:12,color:colors.error}}>조회 실패 · 기존 목록을 유지합니다.<Button onClick={()=>{if(list.isFetchNextPageError)void more();else void list.refetch();}}>다시 시도</Button></Typography>}
 {list.hasNextPage&&<Button disabled={list.isFetching} onClick={()=>void more()} sx={{display:'block',mx:'auto',mt:1}}>더보기</Button>}
 </>}</Box></>;
}
function SecurityEditor({securityId,onDeleted}:{securityId:string;onDeleted:()=>void}){
 const client=useQueryClient(),detail=useQuery({queryKey:['security-management-detail',securityId],queryFn:({signal})=>apiRequest<ManagedSecurity>(`/security-management/${securityId}`,{signal}),retry:false});
 const [draft,setDraft]=useState<{name:string;symbol:string;listingYear:string}|null>(null),[action,setAction]=useState<'code'|'delete'|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false);
 const lastAction=useRef<'code'|'delete'>('code');const openAction=(a:'code'|'delete')=>{lastAction.current=a;setAction(a);};const dialogAction=action??lastAction.current;
 const s=detail.data,value=draft??{name:s?.name??'',symbol:s?.symbol??'',listingYear:String(s?.listingYear??'')};
 const update=(key:keyof typeof value,v:string)=>setDraft({...value,[key]:v});
 const save=async(confirmed=false)=>{
  if(!s||lock.current)return;
  const normalized=value.symbol.trim().toUpperCase();
  if(!/^[A-Z0-9]{6}$/.test(normalized)){setError('종목코드는 영문·숫자 6자리입니다.');return;}
  if(normalized!==s.symbol&&!confirmed){openAction('code');return;}
  lock.current=true;setBusy(true);setError('');
  try{
   await client.cancelQueries({predicate:q=>!['security-management','security-management-detail'].includes(String(q.queryKey[0]))});
   await apiRequest(`/security-management/${securityId}`,{method:'PATCH',body:JSON.stringify({...value,symbol:normalized,listingYear:value.listingYear||null,confirmCodeChange:confirmed})});
   if(normalized!==s.symbol)client.removeQueries({predicate:q=>!['security-management','security-management-detail'].includes(String(q.queryKey[0]))});
   await client.invalidateQueries();setDraft(null);setAction(null);
  }catch(e){setError(e instanceof Error?e.message:'저장 실패');}finally{lock.current=false;setBusy(false);}
 };
 const remove=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  try{await apiRequest(`/security-management/${securityId}`,{method:'DELETE',body:JSON.stringify({confirmed:true})});await client.invalidateQueries({queryKey:['security-management']});setAction(null);onDeleted();}catch(e){setError(e instanceof Error?e.message:'삭제 실패');}finally{lock.current=false;setBusy(false);}
 };
 if(!s)return <Box>{detail.isError?<Typography role="alert">종목 정보 조회 실패<Button onClick={()=>void detail.refetch()}>다시 시도</Button></Typography>:<DelayedSkeleton height={180}/>}</Box>;
 return <Stack spacing={1.5} sx={{mt:1}}><Typography sx={{fontSize:12,color:colors.textMuted}}>등록 출처: {sourceLabel(s.registrationSource)}</Typography>
 <TextField label="종목명" value={value.name} size="small" onChange={e=>update('name',e.target.value)}/>
 <TextField label="종목코드" value={value.symbol} size="small" disabled={!s.canCorrectCode} onChange={e=>update('symbol',e.target.value)} helperText={s.canCorrectCode?'직접 등록 시 잘못 입력한 코드 정정':'등록 출처가 확인된 사용자 종목만 코드 정정 가능'}/>
 <TextField label="상장연도" value={value.listingYear} size="small" onChange={e=>update('listingYear',e.target.value)}/>
 {error&&!action&&<Typography role="alert" sx={{color:colors.error,fontSize:12}}>{error}</Typography>}
 <Stack direction="row" spacing={1}><Button disabled={busy} variant="contained" onClick={()=>void save()}>정보 저장</Button><Button disabled={busy||!!s.deleteBlockedReasons?.length} color="error" onClick={()=>openAction('delete')}>종목 삭제</Button></Stack>
 {!!s.deleteBlockedReasons?.length&&<Typography sx={{fontSize:12,color:colors.warning}}>{s.deleteBlockedReasons.join(' · ')}에서 사용 중 · 일반 정보 수정 가능</Typography>}
 <AppCard><Typography sx={{fontWeight:600,fontSize:13,mb:1}}>수집 대상 설정</Typography><Stack spacing={1}>{Object.entries(featureLabels).map(([feature,label])=><Stack key={feature} direction="row" sx={{alignItems:'center',gap:1}}><Typography sx={{fontSize:12,flex:1}}>{label}</Typography><CollectionSettingToggle security={s} feature={feature} showReason/></Stack>)}</Stack></AppCard>
 {!!s.codeHistory?.length&&<AppCard><Typography sx={{fontSize:12}}>코드 정정 이력 · 이전 코드 자료는 보존되며 현재 코드 자료로 표시하지 않습니다.</Typography>{s.codeHistory.map(h=><Typography key={h.id} sx={{fontSize:11}}>{h.previousSymbol} → {h.newSymbol} · {new Date(h.createdAt).toLocaleDateString('ko-KR')}</Typography>)}</AppCard>}
 <ConfirmActionDialog open={!!action} title={dialogAction==='code'?'종목코드를 변경하시겠습니까?':'종목을 삭제하시겠습니까?'} name={s.name} danger={dialogAction==='delete'} disabled={!action} confirmLabel={dialogAction==='delete'?'삭제':'저장'} busy={busy} onClose={()=>{setAction(null);setError('');}} onConfirm={()=>{if(!action)return;if(action==='delete')void remove();else void save(true);}}>{dialogAction==='code'?<Box sx={{whiteSpace:'pre-line'}}>변경 이후 수집은 새 코드를 사용합니다.{'\n'}변경 전 수집 자료는 새 코드 기준으로 변환하거나 재연결하지 않습니다.{'\n'}Z99로 시작하는 코드는 모든 수집에서 제외됩니다.</Box>:'종목 목록에서 비활성화하며 기존 수집 자료는 보존합니다.'}{error&&<Typography role="alert">{error}</Typography>}</ConfirmActionDialog>
 </Stack>;
}
