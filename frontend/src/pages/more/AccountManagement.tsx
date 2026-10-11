import {DelayedSkeleton as Skeleton} from '../../components/common/DelayedSkeleton';
import {useMoreAccounts} from '../../hooks/useMoreAccounts';
import {useAccountAllocation} from '../../hooks/useAccountAllocation';
import {accountUpdatedAt} from '../../utils/accountUpdatedAt';
import {Box,Button,ButtonBase,IconButton,Stack,Typography} from '@mui/material';
import {useNavigate} from 'react-router-dom';
import {liveApiEnabled} from '../../data/liveData';
import type {AccountDto} from '../../data/roxstockApi';
import {colors} from '../../styles/tokens';
const settingsPanel={bgcolor:'#090F1C',border:'1px solid #21304A',borderRadius:'8px',minWidth:0};
const hint={fontSize:11,color:'#7A859E'};
const fmt=(value:string|number|null)=>value==null||!Number.isFinite(Number(value))?'—':`${Number(value).toLocaleString('ko-KR')}원`;
export function AccountManagement(_props: { openReset?: () => void }) {
 const navigate=useNavigate();const {accounts,selected,query,select}=useMoreAccounts();
 const pending=liveApiEnabled&&query.isPending;
 return <Stack spacing="8px" data-testid="account-management" aria-busy={pending}>
 <Typography sx={{fontSize:11,color:colors.textMuted}}>계좌를 선택하거나 계좌 정보를 수정할 수 있습니다.</Typography>
 <Button fullWidth variant="contained" sx={{height:42,bgcolor:colors.buttonPrimary,color:'#fff'}} onClick={()=>navigate('/detail/settings?view=add')}>계좌 추가</Button>
 {query.isError&&liveApiEnabled&&<Button role="alert" onClick={()=>void query.refetch()}>계좌 조회 실패 · 다시 시도</Button>}
 {pending?Array.from({length:3},(_,i)=><Box key={i} data-testid="account-loading-row" sx={{...settingsPanel,p:'6px 15px',borderWidth:2}}><Stack spacing="4px">{[0,1].map(n=><Stack key={n} direction="row" sx={{height:n?20:21,justifyContent:'space-between',alignItems:'center'}}><Skeleton width={n?72:140} height={n?10:13} sx={{transform:'none'}}/><Skeleton width={n?100:20} height={n?16:20} sx={{transform:'none'}}/></Stack>)}</Stack></Box>):accounts.map(item=><AccountCard key={item.id} item={item} active={selected?.id===item.id} select={()=>void select(item.id)}/>)}
 {!pending&&!query.isError&&!accounts.length&&<Typography>등록된 계좌가 없습니다. 계좌를 추가해 주세요.</Typography>}
 </Stack>;
}
function AccountCard({item,active,select}:{item:AccountDto;active:boolean;select:()=>void}) {
 const navigate=useNavigate();const allocation=useAccountAllocation(item.id);const cash=allocation.query.data?allocation.query.data.cashBalance:item.cashBalance;
 return <Box data-testid={'account-card-'+item.id} sx={{...settingsPanel,p:'6px 15px',border:'2px solid',borderColor:active?'#FACC15':'#21304A',display:'flex',flexDirection:'column',gap:'4px',position:'relative'}}>
 <ButtonBase aria-label={item.name+' 계좌 선택'} aria-pressed={active} onClick={select} sx={{position:'absolute',inset:0,borderRadius:'inherit','&.Mui-focusVisible':{outline:'2px solid #60A5FA',outlineOffset:2}}}/>
 <Stack data-testid="account-title-row" direction="row" sx={{justifyContent:'space-between',alignItems:'center',gap:'4px',minHeight:20,pointerEvents:'none'}}><Typography sx={{fontSize:13,lineHeight:'20px',color:active?'#FACC15':colors.textPrimary,overflowWrap:'anywhere',minWidth:0}}>{item.name} <Box component="span" data-testid="account-number" sx={{...hint,fontWeight:400}}>({item.accountNumber??'—'})</Box></Typography><IconButton aria-label={item.name+' 계좌 정보 수정'} sx={{p:0,width:20,height:20,flexShrink:0,pointerEvents:'auto',zIndex:1}} onClick={event=>{event.stopPropagation();navigate('/detail/settings?view=edit&accountId='+item.id);}}><img src="/phase15/account-edit.svg" alt="" width="20" height="20"/></IconButton></Stack>
 <Stack data-testid="account-detail-row" direction="row" sx={{justifyContent:'space-between',alignItems:'center',gap:'4px',minHeight:20,pointerEvents:'none'}}>
 <Typography data-testid="account-updated-at" sx={{...hint,fontSize:10,lineHeight:'20px',fontWeight:400,flexShrink:0}}>{accountUpdatedAt(item.updatedAt)}</Typography>
 <Typography data-testid="account-cash" sx={{fontSize:16,lineHeight:'20px',color:allocation.cashColor,textAlign:'right',overflowWrap:'anywhere',minWidth:0}}>{fmt(cash)}</Typography>
 </Stack>
 </Box>;
}
