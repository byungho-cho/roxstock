import { Box, Button, ButtonBase, Card, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useActiveAccount } from '../../hooks/useActiveAccount';
import { useListNavigation } from '../../hooks/navigation/usePageMemory';
import { storedQueryOptions } from '../../data/storedQueryOptions';
import { colors } from '../../styles/tokens';
import { seoulToday } from '../investment/investmentData';
import { loadProfit, totals, won } from '../investment-profit/profitData';
import { StockProfitMetrics } from '../investment-profit/ProfitSummaryMetrics';
import { stockProfitPath, yearProfitPath, profitEntryState } from '../investment-profit/profitNavigation';
export { stockProfitPath, profitEntryState } from '../investment-profit/profitNavigation';
const heading={fontSize:14,fontWeight:700};
const hint={fontSize:10,fontWeight:400,color:'#9CA3AF'};
const card={borderRadius:'8px',border:'1px solid '+colors.border,bgcolor:colors.surface};
export function StockProfitSummary({stockId}:{stockId:string}) {
 const {accountId}=useActiveAccount(),go=useListNavigation(),today=seoulToday();
 const query=useQuery({...storedQueryOptions,queryKey:['investment-profit',accountId,Number(today.slice(0,4))],queryFn:({signal})=>loadProfit(accountId!,today,signal),enabled:!!accountId,retry:false});
 const open=(url:string)=>go(url,{state:profitEntryState});
 if(!query.data)return query.isError?<Button role="alert" onClick={()=>query.refetch()}>손익 조회 실패 · 다시 시도</Button>:<Skeleton data-restoration-ready="false" height={180}/>;
 const stock=query.data.stocks.find(row=>row.id===stockId);
 return <>
  {query.isError&&<Button role="alert" onClick={()=>query.refetch()}>손익 갱신 실패 · 다시 시도</Button>}
  <Card sx={card}><ButtonBase data-testid="stock-profit-summary" data-scroll-item="stock-profit-summary" onClick={()=>open(stockProfitPath(stockId))} sx={{display:'block',width:'100%',p:'14px 16px',textAlign:'left'}}><Stack direction="row" sx={{justifyContent:'space-between',alignItems:'center',mb:1}}><Typography sx={heading}>거래 요약</Typography><Typography sx={hint}>(상세보기)</Typography></Stack><StockProfitMetrics totals={stock?.totals??totals([])}/></ButtonBase></Card>
  <Card data-testid="stock-annual-profit" sx={{...card,p:'14px 16px'}}><ButtonBase data-testid="stock-annual-heading" data-scroll-item="stock-annual-heading" onClick={()=>open(yearProfitPath())} sx={{display:'flex',width:'100%',justifyContent:'space-between',minHeight:32,textAlign:'left'}}><Typography sx={heading}>연도별 손익</Typography><Typography sx={hint}>(상세보기)</Typography></ButtonBase>
   {query.data.years.length?query.data.years.map(row=><ButtonBase key={row.id} data-testid="stock-annual-row" data-year={row.id} data-scroll-item={'profit-year-'+row.id} onClick={()=>open(yearProfitPath(row.id))} sx={{display:'grid',gridTemplateColumns:'52px minmax(0,1fr)',gap:'4px',width:'100%',minHeight:32,textAlign:'left',borderBottom:'1px solid '+colors.border}}><Typography sx={{fontSize:12}}>{row.id}년</Typography><Typography sx={{fontSize:12,textAlign:'right',color:row.totals.total==null||row.totals.total===0n?colors.textPrimary:row.totals.total>0n?colors.marketRise:colors.marketFall}}>{won(row.totals.total,true)}</Typography></ButtonBase>):<Box sx={{py:2,color:colors.textMuted,fontSize:12}}>내용이 없습니다.</Box>}
  </Card>
 </>;
}
