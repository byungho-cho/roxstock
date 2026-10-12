import {useRef,useState} from 'react';
import {Box,ButtonBase,Divider,Stack,Typography} from '@mui/material';
import {useQueryClient} from '@tanstack/react-query';
import {AppCard} from '../../components/common/Common';
import {ConfirmActionDialog} from '../../components/common/ConfirmActionDialog';
import {apiRequest} from '../../data/apiClient';
import {colors} from '../../styles/tokens';
import {featureLabels,type ManagedSecurity} from './CollectionSettingToggle';

/** State-driven control: fixed design geometry, non-overlapping 44×24 touch target. */
function CollectionSwitch({label,checked,mixed=false,primary=false,disabled,onClick}:{label:string;checked:boolean;mixed?:boolean;primary?:boolean;disabled:boolean;onClick:()=>void}){
 return <ButtonBase role={mixed?'checkbox':'switch'} aria-label={label} aria-checked={mixed?'mixed':checked} disabled={disabled} onClick={onClick} sx={{width:44,height:24,minWidth:44,flexShrink:0,justifyContent:'flex-end',borderRadius:'4px','&.Mui-focusVisible':{outline:`2px solid ${colors.focus}`,outlineOffset:1}}}>
  <Box data-testid="collection-switch-track" sx={{width:36,height:20,position:'relative',borderRadius:'10px',bgcolor:checked?(primary?colors.buttonPrimary:colors.focus):mixed?colors.warning:colors.borderStrong,opacity:disabled ? .45 : 1}}>
   <Box data-testid="collection-switch-thumb" sx={{position:'absolute',top:2,left:mixed?10:checked?18:2,width:16,height:16,borderRadius:'50%',bgcolor:colors.textPrimary,transition:'left 120ms ease','@media (prefers-reduced-motion: reduce)':{transition:'none'}}}/>
   {mixed&&<Box sx={{position:'absolute',width:8,height:2,top:9,left:14,bgcolor:colors.canvas}}/>}
  </Box>
 </ButtonBase>;
}
const labels={...featureLabels,valuation:'PER/PBR·가치지표'};
export function CollectionSettingsCard({security}:{security:ManagedSecurity}){
 const client=useQueryClient(),lock=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[confirm,setConfirm]=useState<{feature:string;excluded:boolean;allFeatures?:boolean}|null>(null);
 const automatic=security.automaticExclusion||security.symbol.trim().toUpperCase().startsWith('Z99'),disabled=automatic||security.isActive===false;
 const active=(feature:string)=>!disabled&&!security.collectionExcluded&&(feature==='ALL'||!security.excludedFeatures.includes(feature));
 const enabled=Object.keys(labels).filter(active).length,total=Object.keys(labels).length,mixed=enabled>0&&enabled<total;
 const refresh=()=>Promise.all([
  client.invalidateQueries({queryKey:['security-management-detail',security.id]}),
  client.invalidateQueries({queryKey:['security-management']}),
  client.invalidateQueries({queryKey:['collection-monitor-pages']}),
  client.invalidateQueries({queryKey:['stocks']})
 ]);
 const save=async(change:NonNullable<typeof confirm>)=>{
  if(lock.current||disabled)return;lock.current=true;setBusy(true);setError('');
  try{await apiRequest(`/security-management/${security.id}/collection`,{method:'PATCH',body:JSON.stringify({...change,confirmed:true})});await refresh();setConfirm(null);}
  catch(e){setError((e instanceof Error?e.message:'설정 저장 실패')+' · 서버 상태를 다시 조회합니다.');await refresh();}
  finally{lock.current=false;setBusy(false);}
 };
 const toggle=(feature:string)=>{
  if(lock.current||disabled)return;
  // Preserve the existing global gate policy: restoring a row behind ALL restores ALL first.
  const change={feature:security.collectionExcluded&&feature!=='ALL'?'ALL':feature,excluded:active(feature)};
  if(change.excluded)setConfirm(change);else void save(change);
 };
 const all=()=>{if(!lock.current&&!disabled)setConfirm({feature:'ALL',excluded:enabled===total,allFeatures:true});};
 const title=confirm?.allFeatures?`전체 ${confirm.excluded?'비활성화':'활성화'} 하시겠습니까?`:'수집에서 제외하시겠습니까?';
 return <AppCard data-testid="collection-settings-card" sx={{p:'8px',borderRadius:'8px',alignSelf:'start',minWidth:0}}>
  <Stack spacing="4px">
   <Stack direction="row" sx={{height:24,alignItems:'center',gap:1}}><Typography sx={{fontSize:13,fontWeight:600,flex:1}}>수집 대상 설정</Typography><CollectionSwitch label={mixed?'전체 수집 혼합 상태 · 전체 활성화':'전체 수집 '+(enabled===total?'활성':'비활성')} checked={enabled===total} mixed={mixed} primary disabled={disabled||busy} onClick={all}/></Stack>
   <Divider sx={{borderColor:colors.borderStrong}}/>
   {Object.entries(labels).map(([feature,label])=><Stack data-testid="collection-setting-row" key={feature} direction="row" sx={{height:24,alignItems:'center',gap:1}}><Typography sx={{fontSize:12,lineHeight:'20px',flex:1,minWidth:0}}>{label}</Typography><CollectionSwitch label={`${label} ${active(feature)?'활성':'비활성'}`} checked={active(feature)} disabled={disabled||busy} onClick={()=>toggle(feature)}/></Stack>)}
   <Divider sx={{borderColor:colors.borderStrong}}/>
   <Box data-testid="collection-setting-guide" sx={{fontSize:11,lineHeight:'16px',color:colors.textSecondary,overflowWrap:'anywhere'}}>
    {automatic?<><Typography sx={{fontSize:12,fontWeight:600,color:colors.warning,mb:'4px'}}>Z99 코드 · 전체 수집 자동 제외</Typography>코드를 정정하기 전에는 활성화할 수 없습니다.</>:security.isActive===false?'비활성 종목의 수집 설정은 변경할 수 없습니다.':<>우측 스위치로 수집 ON/OFF 변경<br/>수집 설정은 변경 즉시 저장됩니다.{security.collectionExcluded&&<><br/>사용자 설정: 전체 수집 제외</>}{!security.collectionExcluded&&security.excludedFeatures.length>0&&<><br/>사용자 설정: 일부 기능 수집 제외</>}</>}
    {mixed&&<><br/>일부 항목 활성 · 제목의 전체 스위치로 전체 활성화</>}
    {error&&<Typography role="alert" sx={{fontSize:11,color:colors.error,mt:.5}}>{error}</Typography>}
   </Box>
  </Stack>
  <ConfirmActionDialog open={!!confirm} title={title} name={security.name} danger={false} confirmLabel="확인" disabled={!confirm} busy={busy} onClose={()=>{setConfirm(null);setError('');}} onConfirm={()=>{if(confirm)void save(confirm);}}>종목과 기존 자료·이력은 유지됩니다. 자동 제외 규칙은 변경하지 않습니다.{error&&<Typography role="alert" sx={{color:colors.error,fontSize:12,mt:1}}>{error}</Typography>}</ConfirmActionDialog>
 </AppCard>;
}
