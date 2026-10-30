import {useQuery} from '@tanstack/react-query';
import {Button} from '@mui/material';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {liveApiEnabled} from '../../data/liveData';
import {FairPriceCard} from '../value/FairPriceCard';
import {detailValues,seoulYear} from '../value/valueApi';
export function WatchFairPrices({stockId,onSelect}:{stockId:string;onSelect:()=>void}){
 const {accountId}=useActiveAccount(),year=seoulYear();
 const query=useQuery({queryKey:['valuePopup',accountId,stockId,year],enabled:liveApiEnabled,queryFn:({signal})=>detailValues(stockId,year,'annual',Math.max(2015,year-2),1,3,signal),staleTime:30000,refetchOnWindowFocus:false,refetchOnReconnect:false});
 const empty={security:{currentPrice:null},fairPrices:['0.7','0.8','0.9','1.0'].map(persistence=>({persistence,price:null}))};
 return <div onClick={event=>event.stopPropagation()}><FairPriceCard data={query.data??empty} compact tilesOnly onSelect={onSelect}/>{query.isError&&<Button size="small" onClick={()=>void query.refetch()} sx={{fontSize:10,p:0,minHeight:18}}>적정주가 조회 재시도</Button>}</div>;
}
