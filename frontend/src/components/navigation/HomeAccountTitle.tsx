import { Box, Button, ButtonBase, Dialog, IconButton, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useMoreAccounts } from '../../pages/more/MoreScreens';
import { usePopupHistory } from '../../hooks/usePopupHistory';

export function HomeAccountTitle() {
  const { accounts, selected, select, query } = useMoreAccounts();
  const [open, setOpen] = useState(false);
  const close = usePopupHistory(open, () => setOpen(false));
  return <>
    <ButtonBase aria-label="계좌 선택" onClick={() => setOpen(true)} sx={{ maxWidth:'100%', gap:'8px', height:32, fontWeight:700 }}>
      <Typography noWrap sx={{ fontSize:16, fontWeight:700 }}>{selected ? `${selected.brokerName || selected.name}${selected.accountNumber ? ` · ${selected.accountNumber}` : ''}` : '계좌 선택'}</Typography>
      <Box component="span" sx={{ color:'#61a6ff', fontSize:20 }}>⇄</Box>
    </ButtonBase>
    <Dialog open={open} onClose={() => void close()} aria-labelledby="account-select-title" slotProps={{paper:{sx:{width:340,maxWidth:'calc(100% - 30px)',m:0,p:'20px',borderRadius:'8px',border:'1px solid #25344d',bgcolor:'#111827',backgroundImage:'none',maxHeight:'calc(100dvh - 32px)'}}}}>
      <Stack direction="row" sx={{height:28,alignItems:'center',justifyContent:'space-between',mb:'8px',flexShrink:0}}>
        <Typography id="account-select-title" sx={{fontSize:18,fontWeight:700}}>계좌 선택</Typography>
        <IconButton aria-label="계좌 선택 닫기" onClick={() => void close()} sx={{p:0,fontSize:20,color:'#91a1b8'}}>×</IconButton>
      </Stack>
      <Stack spacing="8px" sx={{overflowY:'auto',minHeight:0}}>
        {query.isError && <Button onClick={()=>void query.refetch()}>계좌 조회 실패 · 다시 시도</Button>}
        {accounts.map(account => <ButtonBase key={account.id} onClick={async()=>{await close();void select(account.id);}} sx={{height:40,minHeight:40,px:'8px',gap:'4px',justifyContent:'space-between',borderRadius:'6px',bgcolor:account.id===selected?.id?'#1f385c':undefined}}>
          <Typography noWrap title={`${account.name}(${account.accountNumber || '—'})`} sx={{minWidth:0,fontSize:13,fontWeight:700,color:account.id===selected?.id?'#66abff':'#ebf0f7'}}>{account.name}({account.accountNumber || '—'})</Typography>
          {account.id===selected?.id && <Typography sx={{flexShrink:0,fontSize:11,fontWeight:700,color:'#33cc8c'}}>사용 중</Typography>}
        </ButtonBase>)}
        {!accounts.length && !query.isPending && !query.isError && <Typography sx={{fontSize:13}}>계좌 관리에서 계좌를 추가해 주세요.</Typography>}
      </Stack>
    </Dialog>
  </>;
}
