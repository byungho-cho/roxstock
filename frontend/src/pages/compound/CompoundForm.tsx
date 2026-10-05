import {Box,Button} from '@mui/material';
import {useEffect,useRef,useState,type FormEvent,type KeyboardEvent} from 'react';
import {format} from '../value/valueApi';
import {colors,type FormValues} from './compoundApi';
const fieldStyle={height:36,boxSizing:'border-box' as const,border:'1px solid #2E4263',borderRadius:8,background:'#111927',color:'#F8FAFC',padding:'0 4px 0 8px',fontFamily:'inherit',fontSize:12,width:'100%',minWidth:0};
export function CompoundForm({initial,goalMode,busy,onSave,onCancel}:{initial:FormValues;goalMode:boolean;busy:boolean;onSave:(value:FormValues)=>Promise<void>;onCancel:()=>void}){
 const [values,setValues]=useState(initial),[error,setError]=useState(''),ref=useRef<HTMLFormElement>(null);
 useEffect(()=>{const first=ref.current?.querySelector<HTMLInputElement>('input:not([readonly]):not([disabled])');first?.focus({preventScroll:true});first?.select();},[]);
 const set=(key:keyof FormValues,value:string)=>setValues(v=>({...v,[key]:key==='startYear'||key==='endYear'?Number(value):value}));
 const submit=async(event?:FormEvent)=>{event?.preventDefault();if(busy)return;
  if(!Number.isInteger(values.startYear)||!Number.isInteger(values.endYear)||values.startYear>values.endYear){setError('시작 연도는 종료 연도보다 클 수 없습니다.');return;}
  try{setError('');await onSave(values);}catch(e){setError(e instanceof Error?e.message:'저장에 실패했습니다.');}
 };
 const enter=(e:KeyboardEvent<HTMLFormElement>)=>{if(e.key!=='Enter'||e.nativeEvent.isComposing||!(e.target instanceof HTMLInputElement))return;e.preventDefault();
  const inputs=Array.from(ref.current?.querySelectorAll<HTMLInputElement>('input:not([readonly]):not([disabled])')??[]),index=inputs.indexOf(e.target),next=inputs[index+1];
  if(next){next.focus();next.select();}else void submit();
 };
 const field=(label:string,key:keyof FormValues,unit='',readOnly=false)=>{
  const numeric=['startYear','endYear','initialAssetValue','annualContributionAmount','annualTargetRate'].includes(key),value=String(values[key]);
  return <Box sx={{minWidth:0}}><Box component="label" htmlFor={'compound-'+key} sx={{fontSize:11,color:'#94A3B8',display:'block',mb:'4px'}}>{label}</Box><Box sx={{position:'relative'}}>
   <input id={'compound-'+key} aria-label={label} readOnly={readOnly} disabled={busy} tabIndex={readOnly?-1:undefined} inputMode={numeric?'decimal':undefined} value={readOnly&&numeric&&!key.includes('Year')?format(value,0):value} onChange={e=>set(key,e.target.value.replace(numeric?/,/g:/$^/g,''))} onFocus={e=>{if(!readOnly)e.target.select();}} required maxLength={numeric?24:100} style={{...fieldStyle,paddingRight:unit?24:4,color:readOnly?'#94A3B8':'#F8FAFC'}}/>
   {unit&&<span style={{position:'absolute',right:4,top:10,fontSize:12,pointerEvents:'none',color:readOnly?'#94A3B8':'#F8FAFC'}}>{unit}</span>}
  </Box></Box>;
 };
 return <Box component="form" ref={ref} onSubmit={submit} onKeyDown={enter} sx={{display:'grid',gap:'8px',pt:'4px',fontSize:12}}>
  <Box sx={{display:'flex',alignItems:'center',gap:'8px',minHeight:24}}><span style={{fontSize:11,color:'#94A3B8'}}>색상</span>{colors.map(color=><button key={color} type="button" disabled={busy} aria-label={'목표 색상 '+color} aria-pressed={values.displayColor===color} onClick={()=>set('displayColor',color)} style={{border:values.displayColor===color?'2px solid #F8FAFC':'2px solid transparent',boxShadow:values.displayColor===color?'0 0 0 1px '+color:'none',background:color,borderRadius:'50%',width:18,height:18,padding:0,cursor:'pointer'}}/>)}</Box>
  {field(goalMode?'목표명':'계획명',goalMode?'goalName':'planName')}
  <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px'}}>{field('시작 연도','startYear','',goalMode)}{field('종료 연도','endYear','',goalMode)}</Box>
  <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px'}}><Box><Box sx={{fontSize:11,color:'#94A3B8',mb:'4px'}}>기간 · 자동</Box><Box data-testid="compound-duration" sx={{...fieldStyle,p:'8px',color:'#94A3B8'}}>{values.startYear<=values.endYear?values.endYear-values.startYear+1+'년':'—'}</Box></Box>{field('연 수익률','annualTargetRate','%')}</Box>
  {field('시작 금액','initialAssetValue','원',goalMode)}{field('매년 추가','annualContributionAmount','원',goalMode)}
  {goalMode&&<Box sx={{fontSize:10,color:'#94A3B8'}}>기간·시작 금액·매년 추가금은 계획에서 상속합니다.</Box>}
  {error&&<Box role="alert" sx={{fontSize:11,color:'#FA616E',overflowWrap:'anywhere'}}>저장 실패 · {error} 입력을 유지했습니다. 다시 저장해 주세요.</Box>}
  <Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px'}}><Button type="button" disabled={busy} onClick={onCancel} sx={{height:36,borderRadius:'8px',fontSize:12,bgcolor:'#1E293B',color:'#F8FAFC'}}>취소</Button><Button type="submit" disabled={busy} sx={{height:36,borderRadius:'8px',fontSize:12,bgcolor:'#3B82F6',color:'#F8FAFC'}}>{busy?'저장 중…':error?'재시도 · 저장':'저장'}</Button></Box>
 </Box>;
}
