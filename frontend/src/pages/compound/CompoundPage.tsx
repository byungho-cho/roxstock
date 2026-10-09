import {Box,Button,Skeleton,Dialog,DialogContent,DialogTitle,IconButton,useMediaQuery} from '@mui/material';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {PageHeader} from '../../components/navigation/Navigation';
import {OverlayRegionScrollbar} from '../../components/navigation/OverlayRegionScrollbar';
import {useQueryClient} from '@tanstack/react-query';
import {invalidatePortfolio} from '../../data/invalidatePortfolio';
import {useCompoundPlans} from './useCompoundPlans';
import {CompoundGoalSummary} from './CompoundGoalSummary';
import {GrowthChart} from './GrowthChart';
import {usePageMemory,useReturnNavigation} from '../../hooks/navigation/usePageMemory';
import {useMainLoading} from '../../hooks/useMainLoading';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {format,number,seoulYear} from '../value/valueApi';
import {CompoundForm} from './CompoundForm';
import {mutate,root,colors,type Plan,type Goal,type FormValues} from './compoundApi';
const muted='#94A3B8',blue='#5EA1F0',yellow='#FFC21A',card={bgcolor:'#0E1729',borderRadius:'8px',p:'10px 16px',minWidth:0};
const button={height:28,minHeight:28,borderRadius:'8px',fontSize:11,minWidth:0,p:'0 8px',color:'#F8FAFC',bgcolor:'#1E293B'};
type FormKind='plan-add'|'plan-edit'|'goal-add'|'goal-edit';
type Confirm={type:'plan-delete'|'goal-delete'|'default';plan:Plan;goal?:Goal};
function Empty({label,onAdd,onlyMessage=false}:{label:string;onAdd:()=>void;onlyMessage?:boolean}){return <Box data-testid="compound-empty" sx={{minHeight:160,height:'100%',display:'flex',flex:1,flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'12px',color:muted,fontSize:12}}><span>내용이 없습니다.</span>{!onlyMessage&&<Button onClick={onAdd} sx={{...button,bgcolor:'#3B82F6'}}>{label}</Button>}</Box>;}
function Line({label,value,color}:{label:string;value:ReactNode;color?:string}){return <Box sx={{display:'flex',justifyContent:'space-between',gap:'8px',fontSize:12,minHeight:20}}><span style={{color:muted}}>{label}</span><Box sx={{textAlign:'right',overflowWrap:'anywhere',minWidth:0,color}}>{value}</Box></Box>;}
function Targets({goal,leftLabel='올해 목표',leftValue,rightLabel='최종 목표',rightValue,progressLabel='현재 진행률',progressValue,stateColor=blue,ending=false}:{goal?:Goal;leftLabel?:string;leftValue?:string|null;rightLabel?:string;rightValue?:string|null;progressLabel?:string;progressValue?:string|null;stateColor?:string;ending?:boolean}){
 const progress=number(progressValue===undefined?goal?.progress:progressValue),marker=number(goal?.yearTarget),final=number(goal?.finalTarget);
 return <><Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px',mt:'2px'}}>
  {[{label:leftLabel,value:leftValue===undefined?goal?.yearTarget:leftValue,align:'left' as const},{label:rightLabel,value:rightValue===undefined?goal?.finalTarget:rightValue,align:'right' as const}].map(({label,value,align})=><Box key={label} sx={{textAlign:align,minWidth:0}}><Box title={label} sx={{fontSize:11,color:muted,height:20,lineHeight:'20px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{label}</Box><Box sx={{fontSize:12,lineHeight:'20px',minHeight:20,fontWeight:600,color:align==='left'?stateColor:'#F8FAFC',overflowWrap:'anywhere'}}>{ending&&value==null?'데이터 없음':format(value,0,'원')}</Box></Box>)}
 </Box>
 <Box role="meter" aria-label={progressLabel} aria-valuenow={progress??undefined} aria-valuemin={0} aria-valuemax={Math.max(100,progress??0)} sx={{height:8,bgcolor:'#25334A',borderRadius:'4px',position:'relative',mt:'2px'}}>{progress!==null&&<Box sx={{width:Math.max(0,Math.min(100,progress))+'%',height:'100%',bgcolor:stateColor,borderRadius:'2px'}}/>}{marker!==null&&final!==null&&final>0&&<Box sx={{position:'absolute',left:Math.max(0,Math.min(100,marker/final*100))+'%',top:-1,width:4,height:12,bgcolor:yellow,borderRadius:'2px'}}/>}</Box><Box sx={{display:'flex',justifyContent:'space-between',fontSize:10,lineHeight:'14px',mt:'2px'}}><span style={{color:muted}}>{progressLabel}</span><span style={{color:stateColor}}>{format(progress,1,'%')}</span></Box></>;
}
function FormDialog({title,children,busy,close,compact=false}:{title:string;children:ReactNode;busy:boolean;close:()=>void;compact?:boolean}){
 const contentRef=useRef<HTMLDivElement>(null);
 return <Dialog open onClose={()=>{if(!busy)close();}} slotProps={{paper:{className:'rox-home',sx:{m:'16px',width:'calc(100% - 32px)',maxWidth:compact?338:370,maxHeight:'calc(100dvh - 32px)',borderRadius:'8px',bgcolor:'#0F1728',border:'1px solid #203652',backgroundImage:'none',fontFamily:'RoxHomeInter, sans-serif',color:'#F8FAFC'}}}}>
  <DialogTitle sx={{p:'8px 16px',fontSize:14,minHeight:36,display:'flex',alignItems:'center',justifyContent:'space-between'}}>{title}<IconButton aria-label="팝업 닫기" disabled={busy} onClick={close} sx={{p:0}}><img src="/stocks-v03/close.svg" width="16" height="16" alt=""/></IconButton></DialogTitle>
  <DialogContent ref={contentRef} sx={{p:'0 16px 16px !important',minHeight:0,overflowY:'auto',scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'},fontSize:12}}>{children}</DialogContent><OverlayRegionScrollbar scrollRef={contentRef} label="복리 입력 팝업 스크롤" offset={-8}/>
 </Dialog>;
}
export function CompoundPage(){
 const {accountId,accounts}=useActiveAccount();
 if(!accountId)return <Box sx={{fontSize:12,color:muted}}>{accounts.isError?<><span>계좌 조회에 실패했습니다.</span><Button onClick={()=>void accounts.refetch()}>재시도</Button></>:accounts.isPending?<Skeleton height={30}/>:'계좌를 선택해 주세요.'}</Box>;
 return <AccountPlans key={accountId} accountId={accountId}/>;
}
function AccountPlans({accountId}:{accountId:string}){
 const tablet=useMediaQuery('(min-width:600px)'),location=useLocation(),navigate=useNavigate(),params=new URLSearchParams(location.search);
 const query=useCompoundPlans(accountId),client=useQueryClient(),returnBack=useReturnNavigation('/more');
 const data=query.data,pending=query.isFetching,error=query.error?.message??'';
 const [busy,setBusy]=useState(false),formEntry=useRef(location.key);
 formEntry.current=location.key;
 const [selected,setSelected]=usePageMemory<string|null>('compound-plan',params.get('plan')),[selectedGoal,setSelectedGoal]=usePageMemory<string|null>('compound-goal',params.get('goal'));
 const [confirm,setConfirm]=useState<Confirm|null>(null),[mutationError,setMutationError]=useState('');
 const formKind=params.get('form') as FormKind|null,view=params.get('view')??'list';
 const leftRef=useRef<HTMLDivElement>(null),rightRef=useRef<HTMLDivElement>(null),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const plans=data?.plans??[],explicitPlan=params.get('plan'),explicitGoal=params.get('goal');
 const plan=plans.find(p=>p.id===(explicitPlan??selected))??(!explicitPlan?plans[0]:undefined),goal=plan?.goals.find(g=>g.id===(explicitGoal??selectedGoal));
 useEffect(()=>{if(!data||explicitPlan)return;const next=data.plans.some(p=>p.id===selected)?selected:data.plans[0]?.id??null;if(next!==selected)setSelected(next);},[data,selected,setSelected,explicitPlan]);
 const go=(updates:Record<string,string|null>,replace=false)=>{[leftRef.current,rightRef.current].forEach(region=>region?.dispatchEvent(new Event('scroll',{bubbles:true})));const next=new URLSearchParams(location.search);for(const [key,value]of Object.entries(updates)){if(value===null)next.delete(key);else next.set(key,value);}navigate(location.pathname+(next.size?'?'+next:''),{replace,state:{...location.state,compoundFormEntry:updates.form?true:undefined,listEntryKey:location.state?.listEntryKey??location.key}});};
 const choose=(p:Plan)=>{setSelected(p.id);setSelectedGoal(null);go({view:'compare',plan:p.id,goal:null});};
 const chooseGoal=(g:Goal)=>{setSelectedGoal(g.id);go({view:'goal',plan:plan!.id,goal:g.id});};
 const back=()=>{if(formKind)closeForm();else if(view==='goal'&&location.state?.analysisContext)returnBack();else if(view==='goal'){setSelectedGoal(null);go({view:'compare',goal:null},true);}else if(view==='compare'&&!tablet)go({view:'list',goal:null},true);else navigate('/more');};
 const openForm=(kind:FormKind,targetPlan=plan,targetGoal=goal)=>{setMutationError('');if(targetPlan)setSelected(targetPlan.id);setSelectedGoal(targetGoal?.id??null);go({form:kind,plan:targetPlan?.id??null,goal:targetGoal?.id??null});};
 const closeForm=()=>{if(location.state?.compoundFormEntry)navigate(-1);else go({form:null},true);};
 const refresh=()=>{void query.refetch();};
 const apply=async(path:string,method:string,body?:unknown)=>{
  setBusy(true);setMutationError('');try{const result=await mutate(path,method,body);await invalidatePortfolio(client);return result;}catch(e){if(active.current)setMutationError(e instanceof Error?e.message:'처리에 실패했습니다.');throw e;}finally{if(active.current)setBusy(false);}
 };
 const save=async(values:FormValues)=>{
  const savingEntry=location.key;
  const isGoal=formKind?.startsWith('goal'),editing=formKind?.endsWith('edit');
  const path=root(accountId)+(isGoal||editing?'/'+plan!.id:'')+(isGoal?'/goals'+(editing?'/'+goal!.id:''):'');
  const result=await apply(path,editing?'PUT':'POST',isGoal?{goalName:values.goalName,annualTargetRate:values.annualTargetRate,displayColor:values.displayColor}:values);
  if(active.current&&formEntry.current===savingEntry){if(!isGoal&&result.id)setSelected(result.id);closeForm();}
 };
 const addingPlan=formKind==='plan-add', nextStart=Math.max(seoulYear(),...(plans.map(p=>p.endYear+1)));
 const initial:FormValues={planName:formKind==='plan-edit'?plan?.planName??'':'',goalName:formKind==='goal-edit'?goal?.goalName??'':'',startYear:addingPlan?nextStart:plan?.startYear??seoulYear(),endYear:addingPlan?nextStart+4:plan?.endYear??seoulYear()+4,initialAssetValue:addingPlan?data?.currentAssets??'':plan?.initialAssetValue??'',annualContributionAmount:addingPlan?'0':plan?.annualContributionAmount??'0',annualTargetRate:(formKind==='goal-edit'?goal:formKind==='plan-edit'?plan?.goals.find(g=>g.isDefault):undefined)?.annualTargetRate??'0',displayColor:(formKind==='plan-edit'?plan?.displayColor:formKind==='goal-edit'?goal?.displayColor:undefined)??colors[0]};
 const formTitle=(formKind?.startsWith('goal')?(plan?.planName??'복리계획')+' · 목표':'복리계획')+' '+(formKind?.endsWith('edit')?'수정':'추가');
 const executeConfirm=async()=>{if(!confirm)return;const {plan:p,goal:g,type}=confirm,path=root(accountId)+'/'+p.id+(type==='plan-delete'?'':'/goals/'+g!.id+(type==='default'?'/default':''));
  try{await apply(path,type==='default'?'PUT':'DELETE');if(active.current){setConfirm(null);if(type==='goal-delete'){setSelectedGoal(null);go({view:'compare',goal:null},true);}if(type==='plan-delete')go({view:tablet?'compare':'list',plan:null,goal:null},true);}}catch{/* The dialog keeps the selection, error, and retry. */}
 };
 useMainLoading(pending);
 const status=<>{pending&&!data&&<Skeleton height={100}/>} {error&&<Box role="alert" sx={{fontSize:11,color:'#FA616E',mb:'8px'}}>조회 실패 · {error}<Button sx={button} onClick={refresh}>재시도</Button></Box>}</>;
 const planColor=(p:Plan)=>p.displayColor??p.goals[0]?.displayColor??colors[0];
 const actions=(p:Plan,g?:Goal)=><Box sx={{display:'flex',gap:'8px',mt:'4px'}}>{(['edit','delete'] as const).map(action=><IconButton key={action} disabled={busy} aria-label={(g?.goalName??p.planName)+(action==='edit'?' 수정':' 삭제')} onClick={event=>{event.stopPropagation();if(action==='edit')openForm(g?'goal-edit':'plan-edit',p,g);else{setMutationError('');setConfirm({type:g?'goal-delete':'plan-delete',plan:p,goal:g});}}} sx={{p:0,width:24,height:24}}><img src={'/stocks-v03/'+action+'.svg'} alt="" width="16" height="16"/></IconButton>)}</Box>;
 const assetCard=(showSelect=false)=><Box sx={{...card,p:'14px 16px',minHeight:95,boxSizing:'border-box'}}><Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',fontSize:14,fontWeight:600,lineHeight:'20px',minHeight:20,color:plan?planColor(plan):blue}}><span>현재 자산</span>{showSelect&&plan&&<select aria-label="계획 선택" value={plan.id} onChange={e=>{const p=plans.find(p=>p.id===e.target.value);if(p)choose(p);}} style={{background:'transparent',color:muted,border:0,fontSize:10,maxWidth:'55%',fontFamily:'inherit'}}>{plans.map(p=><option key={p.id} value={p.id} style={{background:'#0E1729'}}>{p.planName} · {p.startYear}–{p.endYear}</option>)}</select>}</Box>
  <Box sx={{textAlign:'right',fontSize:24,lineHeight:'29px',fontWeight:600,color:blue,overflowWrap:'anywhere',my:'3px'}}>{format(data?.currentAssets,0,'원')}</Box>
  <Box sx={{fontSize:10,lineHeight:'12px',color:muted,textAlign:'right'}}>{data?.asOf?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(data.asOf)):'—'}</Box>
  {data&&!data.pricingComplete&&<Box sx={{fontSize:10,color:muted}}>미수집 주가가 있어 현재 자산과 진행률을 계산할 수 없습니다.</Box>}
 </Box>;
 const sortedPlans=[...plans].sort((a,b)=>Number(b.status==='ACTIVE')-Number(a.status==='ACTIVE')||b.startYear-a.startYear||a.id.localeCompare(b.id));
 const list=<Box sx={{display:'grid',gap:'10px'}}>{status}{data&&plans.length>0&&assetCard()}{sortedPlans.map(p=>{const defaultGoal=p.goals.find(g=>g.isDefault),ended=p.status==='ENDED',achievement=number(defaultGoal?.finalAchievementRate),stateColor=ended?achievement===null?muted:achievement>=100?'#F76B73':'#60A5FA':'#33D199';return <Box key={p.id} role="link" tabIndex={0} aria-label={p.planName+' 상세'} onClick={()=>choose(p)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();choose(p);}}} data-scroll-item={p.id} data-testid={'compound-plan-'+p.id} sx={{...card,p:'10px 14px',cursor:'pointer',boxSizing:'border-box',bgcolor:ended?'#0E1012':'#0E1729',border:p.startYear<=(data?.currentYear??seoulYear())&&p.endYear>=(data?.currentYear??seoulYear())?'2px solid #FACC15':'2px solid transparent','&:focus-visible':{outline:'2px solid #5EA1F0'}}}>
  <Box sx={{display:'flex',justifyContent:'space-between',gap:'8px',width:'100%',fontSize:14,fontWeight:600,lineHeight:'20px',minHeight:20,color:planColor(p)}}><span style={{minWidth:0,overflowWrap:'anywhere'}}>{p.planName}<Box component="span" sx={{fontSize:10,fontWeight:400,color:muted,display:'inline',ml:'7px'}}>{p.startYear}–{p.endYear} · 목표 {p.goals.length}개</Box></span><Box component="span" sx={{fontSize:10,fontWeight:400,color:stateColor}}>{ended?achievement===null?'종료':achievement>=100?'목표 초과':'목표 미달':p.status==='ACTIVE'?'진행 중':'시작 전'}</Box></Box>
  <Targets goal={defaultGoal} leftLabel={ended?'목표 자산':defaultGoal?defaultGoal.goalName+' 올해 목표':'올해 목표'} leftValue={ended?defaultGoal?.finalTarget??null:undefined} rightLabel={ended?'종료 자산':'최종 목표'} rightValue={ended?p.endingAssets??null:undefined} ending={ended} stateColor={ended?stateColor:blue} progressLabel={ended?'최종 달성률':'현재 진행률'} progressValue={ended?defaultGoal?.finalAchievementRate??null:undefined}/>
  {actions(p)}{ended&&<Box sx={{fontSize:10,color:muted,mt:'4px',textAlign:'right'}}>{p.endingAsOf?p.endingAsOf+' 종료 기준':'종료 연말 자산 · 데이터 없음'}</Box>}
 </Box>;})}</Box>;
 const goalDetail=plan&&goal?<Box sx={{display:'grid',gap:'8px'}}>
  <CompoundGoalSummary plan={plan} goal={goal} assets={data?.pricingComplete===false?null:data?.currentAssets??null}/>
  <Box sx={card}><Box sx={{fontSize:12,mb:'8px'}}>복리목표 설정</Box><Line label="기간" value={plan.duration+'년'}/><Line label="연 수익률" value={format(goal.annualTargetRate,1,'%')}/><Line label="기간" value={plan.startYear+' ~ '+plan.endYear}/><Line label="시작 금액" value={format(plan.initialAssetValue,0,'원')}/><Line label="매년 추가" value={format(plan.annualContributionAmount,0,'원')}/></Box>
  <GrowthChart goal={goal} currentYear={data?.currentYear??seoulYear()} assets={data?.pricingComplete===false?null:data?.currentAssets??null}/>
  <Box sx={{...card,fontSize:10,color:muted,lineHeight:'18px'}}>연초 추가금 반영: (직전 자산 + 매년 추가금) × (1 + 연 수익률). 시작 연도 첫해부터 종료 연도까지 포함합니다. 시작 금액은 시작 연도 초 기준, 올해 목표는 해당 연말 예상 자산, 진행률은 현재 자산 ÷ 최종 목표입니다. 기간 밖의 올해 목표와 0 이하 최종 목표의 진행률은 —로 표시합니다.</Box>
  <Box sx={{display:'flex',gap:'8px'}}><Button sx={{...button,flex:1}} onClick={()=>openForm('goal-edit')}>목표 수정</Button><Button sx={{...button,flex:1,color:'#FA616E'}} onClick={()=>{setMutationError('');setConfirm({type:'goal-delete',plan,goal});}}>목표 삭제</Button></Box>
 </Box>:null;
 const planActions=plan?<Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}><Button sx={button} onClick={()=>{setSelectedGoal(null);go({view:'compare',goal:null},true);}}>{plan.planName}</Button><Box sx={{display:'flex',gap:'4px'}}><Button sx={button} onClick={()=>openForm('plan-edit')}>수정</Button><Button sx={{...button,color:'#FA616E'}} onClick={()=>{setMutationError('');setConfirm({type:'plan-delete',plan});}}>계획 삭제</Button><Button sx={button} onClick={()=>openForm('goal-add')}>목표 추가</Button></Box></Box>:null;
 const comparison=plan?<Box sx={{display:'flex',flexDirection:'column',minHeight:'100%',gap:'10px'}}>
  {status}

  {view==='goal'?(goal?goalDetail:<Box role="status">해당 목표를 찾을 수 없습니다.</Box>):plan.goals.length===0?<Empty label="목표 추가" onAdd={()=>openForm('goal-add')}/>:<>{assetCard(true)}{plan.goals.map(g=><Box key={g.id} role="link" tabIndex={0} aria-label={g.goalName+' 상세'} onClick={()=>chooseGoal(g)} onKeyDown={e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();chooseGoal(g);}}} data-scroll-item={g.id} data-testid={'compound-goal-'+g.id} sx={{...card,p:'10px 14px',cursor:'pointer',boxSizing:'border-box',border:'2px solid '+(g.isDefault?'#FACC15':'transparent'),'&:focus-visible':{outline:'2px solid #5EA1F0'}}}>
   <Box sx={{display:'flex',alignItems:'center',gap:'8px',justifyContent:'space-between',fontSize:14,fontWeight:600,lineHeight:'20px',minHeight:20,color:g.displayColor}}><span style={{minWidth:0,overflowWrap:'anywhere'}}>{g.goalName}{g.isDefault?' · 기본':''}<Box component="span" sx={{display:'inline',fontSize:10,color:g.displayColor,ml:'8px'}}>연 {format(g.annualTargetRate,1,'%')}</Box></span><IconButton role="radio" aria-checked={g.isDefault} aria-label={g.goalName+' 기본 목표로 설정'} disabled={g.isDefault||busy} onClick={event=>{event.stopPropagation();setMutationError('');setConfirm({type:'default',plan,goal:g});}} sx={{p:0,width:24,height:24}}><img src={g.isDefault?'/compound-v04/radio.svg':'/compound-v04/radio-selected.svg'} alt="" width="16" height="16"/></IconButton></Box>
   <Targets goal={g} stateColor={plan.status==='ENDED'?(number(g.finalAchievementRate)===null?muted:number(g.finalAchievementRate)!>=100?'#F76B73':'#60A5FA'):blue} ending={plan.status==='ENDED'} leftLabel={plan.status==='ENDED'?'목표 자산':'올해 목표'} leftValue={plan.status==='ENDED'?g.finalTarget:undefined} rightLabel={plan.status==='ENDED'?'종료 자산':'최종 목표'} rightValue={plan.status==='ENDED'?plan.endingAssets??null:undefined} progressLabel={plan.status==='ENDED'?'최종 달성률':'현재 진행률'} progressValue={plan.status==='ENDED'?g.finalAchievementRate??null:undefined}/>{actions(plan,g)}
  </Box>)}</>}
  {!(view==='goal'&&goal)&&planActions}
 </Box>:<Box role="status">{status}해당 계획을 찾을 수 없습니다.</Box>;
 const formTargetValid=formKind==='plan-add'||!!plan&&(formKind!=='goal-edit'||!!goal);
 const content=formKind?(formTargetValid?<CompoundForm key={formKind+':'+plan?.id+':'+goal?.id} initial={initial} goalMode={formKind.startsWith('goal')} busy={busy} onSave={save} onCancel={closeForm}/>:<Box role="status">수정할 계획·목표를 찾을 수 없습니다.</Box>):null;
 return <Box className="rox-home" data-testid={tablet?'T1900':'C1900'} data-restoration-ready={pending&&!data?'false':'true'} data-list-condition={JSON.stringify([accountId,view])} sx={{height:tablet||(!formKind&&data?.plans.length===0)?'100%':undefined,minHeight:!tablet?'100%':undefined,fontFamily:'RoxHomeInter, sans-serif',fontSize:12,color:'#F8FAFC'}}>
  <PageHeader embedded title={!tablet&&formKind?formTitle:!tablet&&view==='goal'?goal?.goalName??'목표 상세':!tablet&&view==='compare'?plan?.planName??'복리계획':'복리계획'} variant="detail" showBackTablet onBack={!formKind&&view==='list'?undefined:back} backIcon={<img src="/stocks-v03/back.svg" alt=""/>} action={!tablet&&!formKind&&view==='goal'&&goal?<Button sx={{...button,height:24,minHeight:24,bgcolor:'#3B82F6'}} onClick={()=>openForm('goal-edit')}>수정</Button>:undefined} showAdd={!formKind&&view!=='goal'} showAddMobile addLabel="계획 추가" onAdd={()=>openForm('plan-add')}/>
  {!tablet&&formKind?content:!data?<>{status}</>:plans.length===0?<Box sx={{height:'100%',display:'flex',flexDirection:'column'}}>{status}<Empty onlyMessage label="첫 계획 추가" onAdd={()=>openForm('plan-add')}/></Box>:tablet?<Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px',height:'100%',minHeight:0}}>
   <Box ref={leftRef} data-scroll-region="compound-left" data-list-condition={accountId} sx={{minWidth:0,overflowY:'auto',scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'},pb:'80px'}}>{list}</Box><OverlayRegionScrollbar scrollRef={leftRef} label="복리계획 목록 스크롤" offset={0}/>
   <Box ref={rightRef} data-scroll-region="compound-right" data-list-condition={JSON.stringify([plan?.id,view,goal?.id])} sx={{minWidth:0,overflowY:'auto',scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'},pb:'80px'}}>{comparison}</Box><OverlayRegionScrollbar scrollRef={rightRef} label="복리목표 스크롤" offset={0}/>
  </Box>:view==='list'?list:comparison}
  {tablet&&formKind&&<FormDialog title={formTitle} busy={busy} close={closeForm}>{content}</FormDialog>}
  {confirm&&<FormDialog compact title={confirm.type==='default'?'기본 목표 변경':confirm.type==='goal-delete'?'복리목표 삭제':'복리계획 삭제'} busy={busy} close={()=>setConfirm(null)}>
   <Box sx={{borderTop:'1px solid #203652',pt:'12px',lineHeight:'20px',fontSize:12}}>{confirm.type==='default'?confirm.goal!.goalName+'을 기본 목표로 변경할까요?':(confirm.type==='goal-delete'?confirm.goal!.goalName:confirm.plan.planName)+'을 삭제할까요?'}</Box>
   <Box sx={{fontSize:11,color:muted,lineHeight:'18px',my:'8px'}}>{confirm.plan.planName} · {confirm.plan.startYear}–{confirm.plan.endYear}<br/>{confirm.type==='plan-delete'?'계획과 연결된 목표 '+confirm.plan.goals.length+'개가 함께 삭제됩니다.':confirm.type==='default'?'계획 목록의 올해 목표·최종 목표·진행률이 이 목표 기준으로 변경됩니다.':'선택한 목표만 삭제됩니다. 기본 목표 삭제 시 남은 첫 목표가 기본 목표가 됩니다.'}</Box>
   {mutationError&&<Box role="alert" sx={{fontSize:11,color:'#FA616E',mb:'8px'}}>처리 실패 · {mutationError} 기존 내용을 유지했습니다.</Box>}
   <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px'}}><Button sx={{...button,height:36}} disabled={busy} onClick={()=>setConfirm(null)}>취소</Button><Button sx={{...button,height:36,bgcolor:confirm.type==='default'?'#3B82F6':'#FA616E'}} disabled={busy} onClick={()=>void executeConfirm()}>{busy?'처리 중…':mutationError?'재시도':confirm.type==='default'?'변경':'삭제'}</Button></Box>
  </FormDialog>}
 </Box>;
}
