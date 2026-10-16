import type {ReactNode} from 'react';
import {Box,useMediaQuery} from '@mui/material';
import {useLocation} from 'react-router-dom';
import {PageHeader} from '../../components/navigation/Navigation';
import {GrowthChart} from './GrowthChart';
const muted='#94A3B8',card={bgcolor:'#0E1729',borderRadius:'8px',p:'8px 16px',minWidth:0};
function Asset(){return <Box sx={{...card,p:'8px 16px',minHeight:95,boxSizing:'border-box'}}><Box sx={{fontSize:14,fontWeight:600,lineHeight:'20px',minHeight:20,color:muted}}>현재 자산</Box><Box sx={{height:29,my:'3px'}}/><Box sx={{height:12}}/></Box>;}
function Target(){return <Box sx={{...card,p:'8px 14px',border:'2px solid transparent',boxSizing:'border-box'}}><Box sx={{minHeight:20}}/><Box sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'8px',mt:'2px'}}>{['올해 목표','최종 목표'].map((label,i)=><Box key={label} sx={{textAlign:i?'right':'left'}}><Box sx={{fontSize:11,color:muted,height:20,lineHeight:'20px'}}>{label}</Box><Box sx={{height:20}}/></Box>)}</Box><Box sx={{mt:'4px',height:8}}/><Box sx={{minHeight:19,mt:'3px'}}/><Box sx={{fontSize:10,lineHeight:'14px',mt:'2px',color:muted}}>현재 진행률</Box><Box sx={{height:24,mt:'4px'}}/></Box>;}
export function CompoundEmptyFrame({header=false,notice}:{header?:boolean;notice?:ReactNode}){
 const tablet=useMediaQuery('(min-width:600px)'),location=useLocation(),params=new URLSearchParams(location.search),view=params.get('view')??'list';
 const column={display:'grid',alignContent:'start',gap:'10px',minWidth:0,minHeight:0,overflowY:{sm:'auto'},pb:{sm:'80px'},scrollbarWidth:'none'};
 return <>{header&&<PageHeader embedded title={!tablet&&view==='goal'?'목표 상세':'복리계획'} showAdd={false}/>}
 <Box data-testid="compound-empty-frame" className="rox-home" aria-busy sx={{position:'relative',display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:'8px',height:{sm:'100%'},minHeight:0,fontFamily:'RoxHomeInter, sans-serif',fontSize:12,color:'#F8FAFC'}}>
  {notice&&<Box sx={{position:'absolute',top:0,left:0,right:0,zIndex:1,p:'8px',bgcolor:'#111927',borderRadius:'8px'}}>{notice}</Box>}
  <Box sx={{...column,display:{xs:view==='list'?'grid':'none',sm:'grid'}}}><Asset/><Target/><Target/></Box>
  <Box sx={{...column,display:{xs:view!=='list'?'grid':'none',sm:'grid'}}}>{view==='goal'?<><Box sx={{...card,minHeight:114,boxSizing:'border-box'}}>{['현재 자산','올해 목표','목표 자산'].map(label=><Box key={label} sx={{fontSize:12,color:muted,minHeight:20}}>{label}</Box>)}</Box><Box sx={card}><Box sx={{fontSize:12,mb:'8px'}}>복리목표 설정</Box>{['기간','연 수익률','기간','시작 금액','매년 추가'].map((label,i)=><Box key={i} sx={{fontSize:12,minHeight:20,color:muted}}>{label}</Box>)}</Box><GrowthChart pending currentYear={0} assets={null}/></>:<><Asset/><Target/><Target/></>}</Box>
 </Box></>;
}
