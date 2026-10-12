import {useRef,useState} from 'react';
import {BlockRounded,PlayCircleOutlineRounded} from '@mui/icons-material';
import {Box,IconButton,Typography} from '@mui/material';
import {useQueryClient} from '@tanstack/react-query';
import {ConfirmActionDialog} from '../../components/common/ConfirmActionDialog';
import {apiRequest} from '../../data/apiClient';
export type ManagedSecurity={id:string;symbol:string;name:string;marketType:string;listingYear:number|null;registrationSource:string;canCorrectCode?:boolean;isActive?:boolean;collectionExcluded:boolean;excludedFeatures:string[];automaticExclusion:boolean;exclusionReason:string|null;collectionRevision:number;deleteBlockedReasons?:string[];codeHistory?:Array<{id:string;previousSymbol:string;newSymbol:string;createdAt:string}>};
export const featureLabels:Record<string,string>={ALL:'전체 외부 수집','realtime-prices':'실시간 주가','market-prices':'일별·전체 주가','dart-financial-statements':'DART 재무제표','share-counts':'주식수','consensus':'컨센서스','valuation':'PER/PBR·가치지표 보완','security-master':'종목 마스터'};
export function CollectionSettingToggle({security,feature,onSaved,showReason=false}:{security:ManagedSecurity;feature:string;onSaved?:(s:ManagedSecurity)=>void;showReason?:boolean}){
 const client=useQueryClient(),lock=useRef(false);
 const [saved,setSaved]=useState<ManagedSecurity|null>(null),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const current=saved&&saved.collectionRevision>=security.collectionRevision?saved:security;
 const automatic=current.automaticExclusion||current.symbol.toUpperCase().startsWith('Z99');
 const global=current.collectionExcluded,local=current.excludedFeatures?.includes(feature)??false;
 const excluded=automatic||global||local;
 const scope=global&&feature!=='ALL'?'ALL':feature;
 const label=automatic?'Z99 코드 · 자동 수집 제외':`${featureLabels[scope]??scope} ${excluded?'재활성화':'수집 제외'}`;
 const save=async()=>{
  if(lock.current||automatic)return;lock.current=true;setBusy(true);setError('');
  try{
   const result=await apiRequest<ManagedSecurity>(`/security-management/${current.id}/collection`,{method:'PATCH',body:JSON.stringify({feature:scope,excluded:!excluded,confirmed:true})});
   setSaved(result);onSaved?.(result);setConfirm(false);
   await Promise.all([client.invalidateQueries({queryKey:['security-management']}),client.invalidateQueries({queryKey:['security-management-detail',current.id]}),client.invalidateQueries({queryKey:['collection-monitor-pages']}),client.invalidateQueries({queryKey:['stocks']})]);
  }catch(e){setError(e instanceof Error?e.message:'설정 저장 실패');}finally{setBusy(false);lock.current=false;}
 };
 return <Box sx={{minWidth:0}}><IconButton aria-label={label} title={label} disabled={busy||automatic} aria-pressed={excluded} onClick={e=>{e.stopPropagation();if(excluded)void save();else setConfirm(true);}} sx={{p:0.5,color:excluded?'#FAB83B':'#7A8CA8'}}>{excluded?<PlayCircleOutlineRounded fontSize="small"/>:<BlockRounded fontSize="small"/>}</IconButton>
 {showReason&&<Typography sx={{fontSize:10,overflowWrap:'anywhere'}}>{automatic?'Z99 코드: 모든 외부 수집에서 자동 제외':global?'사용자 설정: 전체 수집 제외':local?'사용자 설정: 해당 기능 수집 제외':'수집 활성'}</Typography>}
 {error&&!confirm&&<Typography role="alert" sx={{fontSize:10,color:'#F26A6F'}}>{error}</Typography>}
 <ConfirmActionDialog open={confirm} title="수집에서 제외하시겠습니까?" name={current.name} detail={`${current.symbol} · ${featureLabels[scope]??scope}`} danger={false} confirmLabel="제외" busy={busy} onClose={()=>{setConfirm(false);setError('');}} onConfirm={()=>void save()}>종목과 기존 자료·이력은 유지됩니다. 같은 설정에서 다시 활성화할 수 있습니다.{error&&<Typography role="alert">{error}</Typography>}</ConfirmActionDialog></Box>;
}
