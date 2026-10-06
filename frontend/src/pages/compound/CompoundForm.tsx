import {Box,Button} from '@mui/material';
import {useEffect,useLayoutEffect,useRef,useState,type FormEvent,type KeyboardEvent} from 'react';
import {format} from '../value/valueApi';
import {YearCalendar} from './YearCalendar';
import {groupAmount,validAmountDraft,amountCaret} from './amountInput';
import {colors,type FormValues} from './compoundApi';
const fieldStyle={height:36,boxSizing:'border-box' as const,border:'1px solid #334054',borderRadius:8,background:'#0B1220',color:'#F8FAFC',padding:'0 4px 0 8px',fontFamily:'inherit',fontSize:12,minWidth:0};
export function CompoundForm({initial,goalMode,busy,onSave,onCancel}:{initial:FormValues;goalMode:boolean;busy:boolean;onSave:(value:FormValues)=>Promise<void>;onCancel:()=>void}){
 const [values,setValues]=useState(initial),[error,setError]=useState(''),ref=useRef<HTMLFormElement>(null),submitting=useRef(false),caret=useRef<{input:HTMLInputElement;position:number}|null>(null),[yearPicker,setYearPicker]=useState<'startYear'|'endYear'|null>(null);
 useLayoutEffect(()=>{if(caret.current){const {input,position}=caret.current;input.setSelectionRange(position,position);caret.current=null;}},[values]);
 useEffect(()=>{const first=ref.current?.querySelector<HTMLInputElement>('input:not([readonly]):not([disabled])');first?.focus({preventScroll:true});first?.select();},[]);
 const set=(key:keyof FormValues,value:string)=>setValues(v=>({...v,[key]:key==='startYear'||key==='endYear'?Number(value):value}));
 const submit=async(event?:FormEvent)=>{event?.preventDefault();if(busy||submitting.current)return;
  if(!Number.isInteger(values.startYear)||!Number.isInteger(values.endYear)||values.startYear>values.endYear){setError('시작 연도는 종료 연도보다 클 수 없습니다.');return;}
  for(const [key,label,zero] of [['annualTargetRate','연 수익률',false],...(!goalMode?[['initialAssetValue','시작 금액',false],['annualContributionAmount','매년 추가',true]]:[])] as [keyof FormValues,string,boolean][]){const raw=String(values[key]).trim(),n=Number(raw);if(!raw||!Number.isFinite(n)||(zero?n<0:n<=0)){setError(label+'은 '+(zero?'0 이상':'0보다 큰')+' 값을 입력해 주세요.');ref.current?.querySelector<HTMLInputElement>('#compound-'+key)?.focus();return;}}
  submitting.current=true;try{setError('');await onSave(values);}catch(e){setError(e instanceof Error?e.message:'저장에 실패했습니다.');}finally{submitting.current=false;}
 };
 const enter=(e:KeyboardEvent<HTMLFormElement>)=>{if(e.key!=='Enter'||e.nativeEvent.isComposing||e.nativeEvent.keyCode===229||!(e.target instanceof HTMLInputElement))return;e.preventDefault();
  if(!goalMode&&(e.target.id==='compound-startYear'||e.target.id==='compound-endYear')){setYearPicker(e.target.id==='compound-startYear'?'startYear':'endYear');return;}
  const inputs=Array.from(ref.current?.querySelectorAll<HTMLInputElement>('input:not([disabled]):not([tabindex="-1"])')??[]),index=inputs.indexOf(e.target),next=inputs[index+1];
  if(next){next.focus();next.select();}else void submit();
 };
 const field=(label:string,key:keyof FormValues,unit='',readOnly=false)=>{
  const money=key==='initialAssetValue'||key==='annualContributionAmount';
  const numeric=['startYear','endYear','initialAssetValue','annualContributionAmount','annualTargetRate'].includes(key),isYear=key==='startYear'||key==='endYear',value=String(values[key]),inputId='compound-'+key;
  return <Box sx={{...fieldStyle,display:'flex',alignItems:'center',gap:'4px',bgcolor:readOnly?'#0E131C':'#0B1220',borderColor:readOnly?'#212B3B':'#334054'}}>
   <Box component="label" htmlFor={inputId} sx={{fontSize:11,color:'#94A3B8',flexShrink:0,width:isYear||key==='annualTargetRate'?52:60}}>{label}</Box>
   <Box sx={{display:'flex',alignItems:'center',flex:1,minWidth:0,justifyContent:'flex-end'}}>
    <input id={inputId} aria-label={label} readOnly={readOnly||isYear} onClick={()=>{if(isYear&&!readOnly&&!busy)setYearPicker(key as 'startYear'|'endYear');}} disabled={busy} tabIndex={readOnly?-1:undefined} inputMode={numeric?'decimal':undefined} value={money?groupAmount(value):readOnly&&numeric&&!isYear?format(value,0):value} onChange={e=>{const raw=e.target.value.replace(numeric?/,/g:/$^/g,'');if(money){if(!validAmountDraft(raw))return;const prefix=e.target.value.slice(0,e.target.selectionStart??0).replace(/,/g,'');caret.current={input:e.target,position:amountCaret(prefix,groupAmount(raw))};}set(key,raw);}} onFocus={e=>{if(!readOnly)e.target.select();}} required maxLength={numeric?24:100} style={{background:'transparent',border:0,outline:0,fontFamily:'inherit',fontSize:13,color:readOnly?'#6B788C':'#F0F5FA',textAlign:'right',width:'100%',minWidth:0,padding:0}}/>
    {unit&&<span style={{fontSize:13,color:readOnly?'#6B788C':'#F0F5FA'}}>{unit}</span>}
   </Box>
   {!readOnly&&<button type="button" aria-label={label+(isYear?' 선택':' 지우기')} disabled={busy} onClick={()=>{const input=ref.current?.querySelector<HTMLInputElement>('#'+inputId);if(isYear){setYearPicker(key as 'startYear'|'endYear');}else{set(key,'');input?.focus();}}} style={{border:0,padding:0,background:'transparent',width:15,height:16,flexShrink:0,display:'flex',cursor:'pointer'}}><img src={isYear?'/compound-v04/year-picker.svg':'/compound-v04/clear.svg'} alt="" width="15" height="16"/></button>}
  </Box>;
 };
 return <Box component="form" ref={ref} onSubmit={submit} onKeyDown={enter} sx={{display:'grid',gap:'8px',pt:'4px',fontSize:12}}>
  <Box sx={{display:'flex',alignItems:'center',gap:'8px',minHeight:28}}><span style={{fontSize:11,color:'#94A3B8'}}>색상</span><Box sx={{display:'flex',alignItems:'center',gap:'12px'}}>{colors.map(color=><button key={color} type="button" disabled={busy} aria-label={'목표 색상 '+color} aria-pressed={values.displayColor===color} onClick={()=>set('displayColor',color)} style={{border:values.displayColor===color?'2px solid #F8FAFC':'2px solid transparent',boxShadow:values.displayColor===color?'0 0 0 1px '+color:'none',background:color,borderRadius:'50%',width:22,height:24,padding:0,cursor:'pointer'}}/>)}</Box></Box>
  {field(goalMode?'목표명':'계획명',goalMode?'goalName':'planName')}
  <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px'}}>{field('시작 연도','startYear','',goalMode)}{field('종료 연도','endYear','',goalMode)}</Box>
  <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px'}}><Box sx={{...fieldStyle,display:'flex',alignItems:'center',justifyContent:'space-between',gap:'4px',bgcolor:'#0E131C',borderColor:'#212B3B'}}><Box sx={{fontSize:11,color:'#94A3B8'}}>기간 · 자동</Box><Box data-testid="compound-duration" sx={{fontSize:13,color:'#6B788C',textAlign:'right'}}>{values.startYear<=values.endYear?values.endYear-values.startYear+1+'년':'—'}</Box></Box>{field('연 수익률','annualTargetRate','%')}</Box>
  {field('시작 금액','initialAssetValue','원',goalMode)}{field('매년 추가','annualContributionAmount','원',goalMode)}
  {goalMode&&<Box sx={{fontSize:10,color:'#94A3B8'}}>기간·시작 금액·매년 추가금은 계획에서 상속합니다.</Box>}
  {error&&<Box role="alert" sx={{fontSize:11,color:'#FA616E',overflowWrap:'anywhere'}}>저장 실패 · {error} 입력을 유지했습니다. 다시 저장해 주세요.</Box>}
  <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px'}}><Button type="button" disabled={busy} onClick={onCancel} sx={{height:36,borderRadius:'8px',fontSize:12,bgcolor:'#1E293B',color:'#F8FAFC'}}>취소</Button><Button type="submit" disabled={busy} sx={{height:36,borderRadius:'8px',fontSize:12,bgcolor:'#3B82F6',color:'#F8FAFC'}}>{busy?'저장 중…':error?'재시도 · 저장':'저장'}</Button></Box>
  {yearPicker&&<YearCalendar label={yearPicker==='startYear'?'시작 연도':'종료 연도'} value={values[yearPicker]} min={yearPicker==='endYear'?values.startYear:1900} onChoose={year=>{const chosen=yearPicker;setValues(v=>({...v,[chosen]:year}));setYearPicker(null);requestAnimationFrame(()=>{const input=ref.current?.querySelector<HTMLInputElement>(chosen==='startYear'?'#compound-endYear':'#compound-annualTargetRate');input?.focus();input?.select();});}} onClose={()=>setYearPicker(null)}/>}
 </Box>;
}
