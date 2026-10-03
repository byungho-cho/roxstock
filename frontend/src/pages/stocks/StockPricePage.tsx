import {Box,Button,Stack,Typography,useMediaQuery} from '@mui/material';
import {useNavigate,useParams} from 'react-router-dom';
import {useStocks} from '../../hooks/useMockData';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {PageHeader} from '../../components/navigation/Navigation';
import {PriceDialog,PriceEditor} from './StockDialogs';
export function StockPricePage(){
 const {stockId}=useParams(),navigate=useNavigate(),tablet=useMediaQuery('(min-width:600px)'),{accountId}=useActiveAccount();
 const {data,isPending,isError,refetch}=useStocks(),stock=data?.find(s=>s.id===stockId);
 const close=()=>navigate(-1);
 return <Stack spacing="8px"><PageHeader embedded title="현재가 수정" variant="more" showAdd={false} onBack={close} backIcon={<Box component="span" aria-hidden sx={{fontSize:30}}>‹</Box>}/>
  {isPending?<Typography>조회 중입니다.</Typography>:isError&&!stock?<Button role="alert" onClick={()=>void refetch()}>종목 조회 실패 · 다시 시도</Button>:stock?tablet?<PriceDialog key={`${accountId}:${stock.id}`} stock={stock} onClose={close}/>:<PriceEditor key={`${accountId}:${stock.id}`} stock={stock} onClose={close}/>:<Typography>종목을 찾을 수 없습니다.</Typography>}
 </Stack>;
}
