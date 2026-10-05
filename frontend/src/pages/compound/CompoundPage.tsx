import {Box,Button,Dialog,DialogContent,DialogTitle,IconButton,useMediaQuery} from '@mui/material';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation,useNavigate} from 'react-router-dom';
import {PageHeader} from '../../components/navigation/Navigation';
import {OverlayRegionScrollbar} from '../../components/navigation/OverlayRegionScrollbar';
import {usePageMemory} from '../../hooks/navigation/usePageMemory';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {format,number,seoulYear} from '../value/valueApi';
import {CompoundForm} from './CompoundForm';
import {listPlans,mutate,root,colors,type Plans,type Plan,type Goal,type FormValues} from './compoundApi';
const muted='#94A3B8',blue='#5EA1F0',yellow='#FFC21A',card={bgcolor:'#0E1729',borderRadius:'8px',p:'10px 16px',minWidth:0};
const button={height:28,borderRadius:'8px',fontSize:11,minWidth:0,p:'0 8px',color:'#F8FAFC',bgcolor:'#1E293B'};
type FormKind='plan-add'|'plan-edit'|'goal-add'|'goal-edit';
type Confirm={type:'plan-delete'|'goal-delete'|'default';plan:Plan;goal?:Goal};
function Empty({label,onAdd}:{label:string;onAdd:()=>void}){return <Box data-testid="compound-empty" sx={{minHeight:160,height:'100%',display:'flex',flex:1,flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'12px',color:muted,fontSize:12}}><span>내용이 없습니다.</span><Button onClick={onAdd} sx={{...button,bgcolor:'#3B82F6'}}>{label}</Button></Box>;}
function Line({label,value,color}:{label:string;value:ReactNode;color?:string}){return <Box sx={{display:'flex',justifyContent:'space-between',gap:'8px',fontSize:12,minHeight:20}}><span style={{color:muted}}>{label}</span><Box sx={{textAlign:'right',overflowWrap:'anywhere',minWidth:0,color}}>{value}</Box></Box>;}
function Targets({goal,leftLabel='올해 목표',leftValue,rightLabel='최종 목표',progressLabel='현재 진행률',progressValue}:{goal?:Goal;leftLabel?:string;leftValue?:string|null;rightLabel?:string;progressLabel?:string;progressValue?:string|null}){
 const progress=number(progressValue===undefined?goal?.progress:progressValue),marker=number(goal?.yearTarget),final=number(goal?.finalTarget);
 return <><Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px',mt:'8px'}}>
  {[{label:leftLabel,value:leftValue===undefined?goal?.yearTarget:leftValue,align:'left' as const},{label:rightLabel,value:goal?.finalTarget,align:'right' as const}].map(({label,value,align})=><Box key={label} sx={{textAlign:align,minWidth:0}}><Box sx={{fontSize:11,color:muted,height:16,lineHeight:'16px'}}>{label}</Box><Box sx={{fontSize:12,lineHeight:'16px',minHeight:16,mt:'4px',fontWeight:600,color:goal?.displayColor??blue,overflowWrap:'anywhere'}}>{format(value,0,'원')}</Box></Box>)}
 </Box><Box sx={{display:'flex',justifyContent:'space-between',fontSize:10,mt:'8px',mb:'4px'}}><span style={{color:muted}}>{progressLabel}</span><span>{format(progress,1,'%')}</span></Box>
 <Box role="meter" aria-label="현재 진행률" aria-valuenow={progress??undefined} aria-valuemin={0} aria-valuemax={Math.max(100,progress??0)} sx={{height:4,bgcolor:'#25334A',borderRadius:'2px',position:'relative'}}>{progress!==null&&<Box sx={{width:Math.max(0,Math.min(100,progress))+'%',height:'100%',bgcolor:blue,borderRadius:'2px'}}/>}{marker!==null&&final!==null&&final>0&&<Box sx={{position:'absolute',left:Math.max(0,Math.min(100,marker/final*100))+'%',top:-1,width:4,height:6,bgcolor:yellow,borderRadius:'2px'}}/>}</Box></>;
}
function GrowthChart({goal,currentYear,assets}:{goal:Goal;currentYear:number;assets:string|null}){
 const points=goal.rows.map(row=>({year:row.year,value:number(row.asset),contributed:number(row.contributed)}));
 const all=points.flatMap(p=>[p.value,p.contributed]).filter((v):v is number=>v!==null),actual=number(assets);
 if(actual!==null)all.push(actual);
 const max=Math.max(1,...all),scale=max>=1e12?1e12:max>=1e8?1e8:max>=1e4?1e4:1,unit=scale===1e12?'조':scale===1e8?'억':scale===1e4?'만':'원',x=(index:number)=>32+(index/Math.max(1,points.length-1))*272,y=(value:number)=>118-value/max*100;
 const path=(key:'value'|'contributed')=>{let started=false;return points.map((p,i)=>{const value=p[key];if(value===null){started=false;return '';}const command=(started?'L':'M')+x(i)+','+y(value);started=true;return command;}).join(' ');};
 const index=points.findIndex(p=>p.year===currentYear);
 return <Box sx={card}><Box sx={{fontSize:12,mb:'8px'}}>연도별 예상 자산</Box><Box sx={{fontSize:10,color:muted,display:'flex',gap:'12px',mb:'4px'}}><span style={{color:goal.displayColor}}>예상 자산</span><span style={{color:muted}}>누적 투입금</span><span style={{color:blue}}>현재 자산</span></Box>
  <svg role="img" aria-label="연도별 예상 자산과 누적 투입금 · 원" viewBox="0 0 320 150" width="100%" style={{display:'block',overflow:'visible'}}>
   {[0,0.5,1].map(f=><g key={f}><line x1="32" x2="304" y1={y(max*f)} y2={y(max*f)} stroke="#26354A"/><text x="0" y={y(max*f)+3} fill={muted} fontSize="10">{format(max*f/scale,1)}{unit}</text></g>)}
   <path d={path('contributed')} fill="none" stroke={muted} strokeWidth="1.5" strokeDasharray="3 3"/><path d={path('value')} fill="none" stroke={goal.displayColor} strokeWidth="2"/>
   {actual!==null&&index>=0&&<circle cx={x(index)} cy={y(actual)} r="3" fill={blue}/>}
   {points.filter((_,i)=>i===0||i===points.length-1||i===index).map(p=><text key={p.year} x={x(points.indexOf(p))} y="144" textAnchor="middle" fontSize="10" fill={muted}>{p.year}</text>)}
  </svg>
  <Box sx={{display:'grid',gap:'8px',mt:'8px'}}>{goal.rows.map(row=><Line key={row.year} label={String(row.year)} value={format(row.asset,0,'원')} color={row.year===goal.rows.at(-1)?.year?'#FA616E':undefined}/>)}</Box>
 </Box>;
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
 if(!accountId)return <Box sx={{fontSize:12,color:muted}}>{accounts.isError?<><span>계좌 조회에 실패했습니다.</span><Button onClick={()=>void accounts.refetch()}>재시도</Button></>:accounts.isPending?'계좌 조회 중…':'계좌를 선택해 주세요.'}</Box>;
 return <AccountPlans key={accountId} accountId={accountId}/>;
}
function AccountPlans({accountId}:{accountId:string}){
 const tablet=useMediaQuery('(min-width:600px)'),location=useLocation(),navigate=useNavigate(),params=new URLSearchParams(location.search);
 const [data,setData]=useState<Plans>(),[pending,setPending]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false);
 const [selected,setSelected]=usePageMemory<string|null>('compound-plan',params.get('plan')),[selectedGoal,setSelectedGoal]=usePageMemory<string|null>('compound-goal',params.get('goal'));
 const [confirm,setConfirm]=useState<Confirm|null>(null),[mutationError,setMutationError]=useState('');
 const formKind=params.get('form') as FormKind|null,view=params.get('view')??'list';
 const leftRef=useRef<HTMLDivElement>(null),rightRef=useRef<HTMLDivElement>(null),active=useRef(true);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 useEffect(()=>{const controller=new AbortController();let current=true;setPending(true);setError('');
  listPlans(accountId,controller.signal).then(value=>{if(current){setData(value);setPending(false);}}).catch((e:unknown)=>{if(current){setError(e instanceof Error?e.message:'조회에 실패했습니다.');setPending(false);}});
  return()=>{current=false;controller.abort();};
 },[accountId,revision]);
 const plans=data?.plans??[],plan=plans.find(p=>p.id===selected)??plans[0],goal=plan?.goals.find(g=>g.id===selectedGoal);
 useEffect(()=>{if(!data)return;const next=data.plans.some(p=>p.id===selected)?selected:data.plans[0]?.id??null;if(next!==selected)setSelected(next);},[data,selected,setSelected]);
 const go=(updates:Record<string,string|null>,replace=false)=>{[leftRef.current,rightRef.current].forEach(region=>region?.dispatchEvent(new Event('scroll',{bubbles:true})));const next=new URLSearchParams(location.search);for(const [key,value]of Object.entries(updates)){if(value===null)next.delete(key);else next.set(key,value);}navigate(location.pathname+(next.size?'?'+next:''),{replace,state:{...location.state,listEntryKey:location.state?.listEntryKey??location.key}});};
 const choose=(p:Plan)=>{setSelected(p.id);setSelectedGoal(null);if(!tablet)go({view:'compare',plan:p.id,goal:null});};
 const chooseGoal=(g:Goal)=>{setSelectedGoal(g.id);go({view:'goal',plan:plan!.id,goal:g.id});};
 const back=()=>{if(formKind)go({form:null},true);else if(view==='goal'){setSelectedGoal(null);go({view:'compare',goal:null},true);}else if(view==='compare'&&!tablet)go({view:'list',goal:null},true);else navigate('/more');};
 const openForm=(kind:FormKind)=>{setMutationError('');go({form:kind,plan:plan?.id??null,goal:goal?.id??null},true);};
 const closeForm=()=>go({form:null},true);
 const refresh=()=>setRevision(v=>v+1);
 const apply=async(path:string,method:string,body?:unknown)=>{
  setBusy(true);setMutationError('');try{const result=await mutate(path,method,body);if(!active.current)return result;refresh();return result;}catch(e){if(active.current)setMutationError(e instanceof Error?e.message:'처리에 실패했습니다.');throw e;}finally{if(active.current)setBusy(false);}
 };
 const save=async(values:FormValues)=>{
  const isGoal=formKind?.startsWith('goal'),editing=formKind?.endsWith('edit');
  const path=root(accountId)+(isGoal||editing?'/'+plan!.id:'')+(isGoal?'/goals'+(editing?'/'+goal!.id:''):'');
  const result=await apply(path,editing?'PUT':'POST',isGoal?{goalName:values.goalName,annualTargetRate:values.annualTargetRate,displayColor:values.displayColor}:values);
  if(active.current){if(!isGoal&&result.id)setSelected(result.id);closeForm();}
 };
 const addingPlan=formKind==='plan-add', nextStart=Math.max(seoulYear(),...(plans.map(p=>p.endYear+1)));
 const initial:FormValues={planName:formKind==='plan-edit'?plan?.planName??'':'',goalName:formKind==='goal-edit'?goal?.goalName??'':'',startYear:addingPlan?nextStart:plan?.startYear??seoulYear(),endYear:addingPlan?nextStart+4:plan?.endYear??seoulYear()+4,initialAssetValue:addingPlan?data?.currentAssets??'':plan?.initialAssetValue??'',annualContributionAmount:addingPlan?'0':plan?.annualContributionAmount??'0',annualTargetRate:(formKind==='goal-edit'?goal:formKind==='plan-edit'?plan?.goals.find(g=>g.isDefault):undefined)?.annualTargetRate??'0',displayColor:(formKind==='goal-edit'?goal:formKind==='plan-edit'?plan?.goals.find(g=>g.isDefault):undefined)?.displayColor??colors[0]};
 const formTitle=(formKind?.startsWith('goal')?plan?.planName+' · 목표':'복리계획')+' '+(formKind?.endsWith('edit')?'수정':'추가');
 const executeConfirm=async()=>{if(!confirm)return;const {plan:p,goal:g,type}=confirm,path=root(accountId)+'/'+p.id+(type==='plan-delete'?'':'/goals/'+g!.id+(type==='default'?'/default':''));
  try{await apply(path,type==='default'?'PUT':'DELETE');if(active.current){setConfirm(null);if(type==='goal-delete'){setSelectedGoal(null);go({view:'compare',goal:null},true);}if(type==='plan-delete')go({view:tablet?'compare':'list',plan:null,goal:null},true);}}catch{/* The dialog keeps the selection, error, and retry. */}
 };
 const status=<>{pending&&<Box role="status" sx={{fontSize:10,color:muted,py:'4px'}}>{data?'갱신 중 · 기존 데이터와 기준일을 유지합니다.':'조회 중…'}</Box>}{error&&<Box role="alert" sx={{fontSize:11,color:'#FA616E',mb:'8px'}}>조회 실패 · {error}<Button sx={button} onClick={refresh}>재시도</Button></Box>}</>;
 const assetCard=<Box sx={{...card,p:'14px 16px',minHeight:95,boxSizing:'border-box'}}><Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',fontSize:11,color:muted}}><span>현재 자산</span>{plan&&<select aria-label="계획 선택" value={plan.id} onChange={e=>{const p=plans.find(p=>p.id===e.target.value);if(p)choose(p);}} style={{background:'transparent',color:muted,border:0,fontSize:10,maxWidth:'55%',fontFamily:'inherit'}}>{plans.map(p=><option key={p.id} value={p.id} style={{background:'#0E1729'}}>{p.planName} · {p.startYear}–{p.endYear}</option>)}</select>}</Box>
  <Box sx={{textAlign:'right',fontSize:22,fontWeight:600,color:blue,overflowWrap:'anywhere',my:'3px'}}>{format(data?.currentAssets,0,'원')}</Box>
  <Box sx={{fontSize:10,color:muted,textAlign:'right'}}>{data?.asOf?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'short',timeStyle:'short'}).format(new Date(data.asOf)):'—'}</Box>
  {data&&!data.pricingComplete&&<Box sx={{fontSize:10,color:muted}}>미수집 주가가 있어 현재 자산과 진행률을 계산할 수 없습니다.</Box>}
 </Box>;
 const list=<Box sx={{display:'grid',gap:'8px'}}>{status}{data&&assetCard}{plans.map(p=>{const defaultGoal=p.goals.find(g=>g.isDefault);return <Box key={p.id} data-scroll-item={p.id} data-testid={'compound-plan-'+p.id} sx={{...card,bgcolor:p.status==='ENDED'?'#0E1012':'#0E1729',border:'1px solid '+(p.id===plan?.id?yellow:'transparent')}}>
  <Box component="button" onClick={()=>choose(p)} aria-pressed={p.id===plan?.id} sx={{font:'inherit',textAlign:'left',border:0,p:0,bgcolor:'transparent',color:'#F8FAFC',display:'flex',justifyContent:'space-between',gap:'8px',width:'100%',cursor:'pointer',fontSize:14}}>
   <span>{p.planName}<Box component="span" sx={{fontSize:10,color:muted,display:'block',mt:'4px'}}>{p.startYear}–{p.endYear} · 목표 {p.goals.length}개</Box></span><Box component="span" sx={{fontSize:10,color:muted}}>{p.status==='ACTIVE'?'진행 중':p.status==='ENDED'?'종료':'시작 전'}</Box>
  </Box><Targets goal={defaultGoal} leftLabel={p.status==='ENDED'?'종료 자산':defaultGoal?defaultGoal.goalName+' 올해 목표':'올해 목표'} leftValue={p.status==='ENDED'?p.endingAssets??null:undefined} rightLabel={p.status==='ENDED'?'목표 자산':'최종 목표'} progressLabel={p.status==='ENDED'?'최종 달성률':'현재 진행률'} progressValue={p.status==='ENDED'?defaultGoal?.finalAchievementRate??null:undefined}/>{p.status==='ENDED'&&<Box sx={{fontSize:10,color:muted,mt:'4px',textAlign:'right'}}>{p.endingAsOf?p.endingAsOf+' 종료 기준':'종료 연말 자산 미수집'}</Box>}
 </Box>;})}</Box>;
 const goalDetail=plan&&goal?<Box sx={{display:'grid',gap:'8px'}}>
  <Box sx={card}><Box sx={{display:'flex',justifyContent:'space-between',gap:'8px',fontSize:12}}><span>{plan.planName} · 연 {format(goal.annualTargetRate,1,'%')}{goal.isDefault?' · 기본 목표':''}</span><span style={{color:yellow}}>진행률 {format(goal.progress,1,'%')}</span></Box><Line label="현재 자산" value={format(data?.currentAssets,0,'원')} color={blue}/><Line label="올해 목표" value={format(goal.yearTarget,0,'원')}/><Line label="목표 자산" value={format(goal.finalTarget,0,'원')} color="#FA616E"/></Box>
  <Box sx={card}><Box sx={{fontSize:12,mb:'8px'}}>복리목표 설정</Box><Line label="기간" value={plan.duration+'년'}/><Line label="연 수익률" value={format(goal.annualTargetRate,1,'%')}/><Line label="시작 연도" value={plan.startYear}/><Line label="시작 금액" value={format(plan.initialAssetValue,0,'원')}/><Line label="매년 추가" value={format(plan.annualContributionAmount,0,'원')}/></Box>
  <GrowthChart goal={goal} currentYear={data?.currentYear??seoulYear()} assets={data?.currentAssets??null}/>
  <Box sx={{...card,fontSize:10,color:muted,lineHeight:'18px'}}>연초 추가금 반영: (직전 자산 + 매년 추가금) × (1 + 연 수익률). 시작 연도 첫해부터 종료 연도까지 포함합니다. 시작 금액은 시작 연도 초 기준, 올해 목표는 해당 연말 예상 자산, 진행률은 현재 자산 ÷ 최종 목표입니다. 기간 밖의 올해 목표와 0 이하 최종 목표의 진행률은 —로 표시합니다.</Box>
  <Box sx={{display:'flex',gap:'8px'}}><Button sx={{...button,flex:1}} onClick={()=>openForm('goal-edit')}>목표 수정</Button><Button sx={{...button,flex:1,color:'#FA616E'}} onClick={()=>{setMutationError('');setConfirm({type:'goal-delete',plan,goal});}}>목표 삭제</Button></Box>
 </Box>:null;
 const comparison=plan?<Box sx={{display:'flex',flexDirection:'column',minHeight:'100%',gap:'8px'}}>
  {status}
  <Box sx={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px'}}><Button sx={button} onClick={()=>{setSelectedGoal(null);go({view:'compare',goal:null},true);}}>{plan.planName}</Button><Box sx={{display:'flex',gap:'4px'}}><Button sx={button} onClick={()=>openForm('plan-edit')}>수정</Button><Button sx={{...button,color:'#FA616E'}} onClick={()=>{setMutationError('');setConfirm({type:'plan-delete',plan});}}>계획 삭제</Button><Button sx={button} onClick={()=>openForm('goal-add')}>목표 추가</Button></Box></Box>
  {view==='goal'&&goal?goalDetail:plan.goals.length===0?<Empty label="목표 추가" onAdd={()=>openForm('goal-add')}/>:<>{assetCard}{plan.goals.map(g=><Box key={g.id} data-scroll-item={g.id} data-testid={'compound-goal-'+g.id} sx={{...card,border:'1px solid '+(g.isDefault?yellow:'transparent')}}>
   <Box sx={{display:'flex',alignItems:'center',gap:'8px',justifyContent:'space-between',fontSize:14,color:g.displayColor}}><Box sx={{display:'flex',gap:'8px',alignItems:'center',minWidth:0}}><button aria-label={g.goalName+' 기본 목표로 변경'} disabled={g.isDefault||busy} onClick={()=>{setMutationError('');setConfirm({type:'default',plan,goal:g});}} style={{border:0,padding:0,background:'transparent',display:'flex',cursor:g.isDefault?'default':'pointer'}}><img src={g.isDefault?'/compound-v04/radio-selected.svg':'/compound-v04/radio.svg'} alt="" width="16" height="16"/></button><span>{g.goalName}{g.isDefault?' · 기본':''}<Box component="span" sx={{display:'block',fontSize:10,color:muted,mt:'4px'}}>연 {format(g.annualTargetRate,1,'%')}</Box></span></Box><Button sx={{...button,bgcolor:'transparent',fontSize:10,p:0,color:muted}} onClick={()=>chooseGoal(g)}>상세보기</Button></Box><Targets goal={g}/>
  </Box>)}</>}
 </Box>:null;
 const content=formKind?<CompoundForm key={formKind+':'+plan?.id+':'+goal?.id} initial={initial} goalMode={formKind.startsWith('goal')} busy={busy} onSave={save} onCancel={closeForm}/>:null;
 return <Box className="rox-home" data-testid={tablet?'T1900':'C1900'} data-restoration-ready={pending&&!data?'false':'true'} data-list-condition={JSON.stringify([accountId,view])} sx={{height:tablet||(!formKind&&data?.plans.length===0)?'100%':undefined,minHeight:!tablet?'100%':undefined,fontFamily:'RoxHomeInter, sans-serif',fontSize:12,color:'#F8FAFC'}}>
  <PageHeader embedded title={!tablet&&formKind?formTitle:!tablet&&view==='goal'?goal?.goalName??'목표 상세':!tablet&&view==='compare'?plan?.planName??'복리계획':'복리계획'} variant="detail" showBackTablet onBack={back} backIcon={<img src="/stocks-v03/back.svg" width="11" height="17" alt=""/>} showAdd={!formKind} showAddMobile addLabel="계획 추가" onAdd={()=>openForm('plan-add')}/>
  {!tablet&&formKind?content:!data?<>{status}</>:plans.length===0?<Box sx={{height:'100%',display:'flex',flexDirection:'column'}}>{status}<Empty label="첫 계획 추가" onAdd={()=>openForm('plan-add')}/></Box>:tablet?<Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px',height:'100%',minHeight:0}}>
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
