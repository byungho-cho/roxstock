import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';

import { Box, Button, ButtonBase, Card, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { useListNavigation } from '../../hooks/navigation/usePageMemory';
import { storedQueryOptions } from '../../data/storedQueryOptions';
import { colors } from '../../styles/tokens';
import { useSeoulYear } from '../compound/useCompoundPlans';
import { seoulToday } from '../investment/investmentData';
import { groups, loadProfit, totals, won } from '../investment-profit/profitData';
import { StockProfitMetrics } from '../investment-profit/ProfitSummaryMetrics';
import { stockProfitPath, yearProfitPath, profitEntryState } from '../investment-profit/profitNavigation';
export { stockProfitPath, profitEntryState } from '../investment-profit/profitNavigation';
const heading={fontSize:14,fontWeight:700};
const hint={fontSize:10,fontWeight:400,color:'#9CA3AF'};
const card={borderRadius:'8px',border:'1px solid '+colors.border,bgcolor:colors.surface};
export function useStockProfit(stockId:string,enabled=true) {
 const client=useQueryClient(),{accountId}=useActiveAccount(),today=seoulToday(),year=useSeoulYear();
 const query=useQuery({...storedQueryOptions,queryKey:['investment-profit-summary',accountId,stockId,year],queryFn:({signal})=>loadProfit(accountId!,today,signal,{client,includeCapital:false,aggregate:true,securityId:stockId}),enabled:enabled&&!!accountId,retry:false});
 return query;
}
export function StockProfitSummary({stockId}:{stockId:string}) {
 const go=useListNavigation(),query=useStockProfit(stockId);
 const open=(url:string)=>go(url,{state:profitEntryState});
 if(!query.data&&query.isError)return <QueryErrorNotice message="손익 조회 실패 · 다시 시도" onRetry={()=>query.refetch()}/>;
 const pending=!query.data;
 const stock=query.data?.stocks.find(row=>row.id===stockId),years=groups(stock?.events??[],'year');
 return <>
  {query.isError&&<QueryErrorNotice message="손익 조회에 실패했습니다." onRetry={()=>void query.refetch()}/>}
  <Card sx={card}><ButtonBase data-testid="stock-profit-summary" data-scroll-item="stock-profit-summary" onClick={()=>open(stockProfitPath(stockId))} sx={{display:'block',width:'100%',p:'8px 16px',textAlign:'left'}}><Stack direction="row" sx={{justifyContent:'space-between',alignItems:'center',mb:1}}><Typography sx={heading}>거래 요약</Typography><Typography sx={hint}>(상세보기)</Typography></Stack><Box aria-busy={pending} data-restoration-ready={!pending}>{pending?['매수총액','매도총액','매매손익','배당포함 총손익'].map(label=><Typography key={label} sx={{fontSize:12,lineHeight:'20px',minHeight:24}}>{label}</Typography>):<StockProfitMetrics totals={stock?.totals??totals([])}/>}</Box></ButtonBase></Card>
  <Card data-testid="stock-annual-profit" sx={{...card,p:'8px 16px'}}><ButtonBase data-testid="stock-annual-heading" data-scroll-item="stock-annual-heading" onClick={()=>open(yearProfitPath(undefined,stockId))} sx={{display:'flex',width:'100%',justifyContent:'space-between',minHeight:32,textAlign:'left'}}><Typography sx={heading}>연도별 손익</Typography><Typography sx={hint}>(상세보기)</Typography></ButtonBase>
   {pending?<Box aria-busy="true" sx={{height:50}}/>:years.length?years.map(row=><ButtonBase key={row.id} data-testid="stock-annual-row" data-year={row.id} data-scroll-item={'profit-year-'+row.id} onClick={()=>open(yearProfitPath(row.id,stockId))} sx={{display:'grid',gridTemplateColumns:'52px minmax(0,1fr)',gap:'4px',width:'100%',minHeight:32,textAlign:'left',borderBottom:'1px solid '+colors.border}}><Typography sx={{fontSize:12}}>{row.id}년</Typography><Typography sx={{fontSize:12,textAlign:'right',color:row.totals.total==null||row.totals.total===0n?colors.textPrimary:row.totals.total>0n?colors.marketRise:colors.marketFall}}>{won(row.totals.total,true)}</Typography></ButtonBase>):<Box sx={{py:2,color:colors.textMuted,fontSize:12}}>내용이 없습니다.</Box>}
  </Card>
 </>;
}
