import {useQuery} from '@tanstack/react-query';
import {IconButton} from '@mui/material';
import {RefreshRounded} from '@mui/icons-material';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import {liveApiEnabled} from '../../data/liveData';
import {FairPriceCard} from '../value/FairPriceCard';
import {detailValues,seoulYear} from '../value/valueApi';
export function WatchFairPrices({stockId,onSelect}:{stockId:string;onSelect:()=>void}){
 const {accountId}=useActiveAccount(),year=seoulYear();
 const query=useQuery({queryKey:['valuePopup',accountId,stockId,year],enabled:liveApiEnabled,queryFn:({signal})=>detailValues(stockId,year,'annual',Math.max(2015,year-2),1,3,signal),staleTime:30000,refetchOnWindowFocus:false,refetchOnReconnect:false});
 const empty={security:{currentPrice:null},fairPrices:['0.7','0.8','0.9','1.0'].map(persistence=>({persistence,price:null}))};
 const data={security:query.data?.security??empty.security,fairPrices:empty.fairPrices.map(fair=>query.data?.fairPrices?.find(row=>row.persistence===fair.persistence)??fair)};
 return <div style={{position:'relative'}}><FairPriceCard data={data} compact tilesOnly onSelect={onSelect}/>{query.isError&&<IconButton aria-label="적정주가 조회 재시도" title="적정주가 조회 실패 · 다시 시도" onClick={()=>void query.refetch()} sx={{position:'absolute',right:0,top:0,width:16,height:16,p:0,bgcolor:'#111827',color:'#FBBF24'}}><RefreshRounded sx={{fontSize:13}}/></IconButton>}</div>;
}
