import {Box,ButtonBase,Typography} from '@mui/material';
export function SettingsLink({title,caption,value,onClick,active=false,compact=false,valueColor}:{title:string;caption?:string;value?:string;onClick:()=>void;active?:boolean;compact?:boolean;valueColor?:string}){
 return <ButtonBase aria-current={active?'page':undefined} onClick={onClick} sx={{bgcolor:compact?(active?'#14386B':'#111825'):'#090F1C',border:'1px solid',borderColor:active?(compact?'#3C85F2':'#3B82F6'):(compact?'#25344D':'#21304A'),borderRadius:'8px',width:'100%',minHeight:compact?40:72,pl:compact?'13px':'14px',pr:'8px',py:'10px',gap:'10px',display:'flex',textAlign:'left'}}>
  <Box sx={{flex:1,minWidth:0}}><Typography sx={{fontSize:compact?13:15,fontWeight:compact&&active?600:400,color:compact?'#E8EDF7':'#F8FAFC'}}>{title}</Typography>{caption&&<Typography sx={{fontSize:11,color:'#7385A1',mt:'5px'}}>{caption}</Typography>}</Box>
  {value&&<Typography sx={{flexShrink:0,fontSize:11,color:valueColor??(compact&&active?'#E8EDF7':'#7385A1')}}>{value}</Typography>}
  <Box component="img" src="/notifications-v14/chevron-right.svg" alt="" sx={{flexShrink:0}}/>
 </ButtonBase>;
}
