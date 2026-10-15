import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {Box,Button,Stack} from '@mui/material';
import {useListNavigation} from '../../hooks/navigation/usePageMemory';
import {AssetQuickCards,TotalAssetCard} from '../../components/common/AssetSummaryCards';
import {PerformanceCard} from '../../components/common/PerformanceCard';
import type {DashboardSummary} from '../../types/models';
export const unavailableSummary:DashboardSummary={totalAssets:NaN,stockValue:NaN,stockPurchaseAmount:NaN,cashBalance:NaN,dailyProfit:NaN,dailyProfitRate:NaN,stockMonthlyProfit:NaN,cashMonthlyProfit:NaN,totalProfit:NaN,totalProfitRate:NaN,collectedAt:'',pricingComplete:false};
export function HomeSummaryCards({summary,pending,allocationAvailable=true,failed=false,retry=()=>{}}:{summary?:DashboardSummary;pending:boolean;allocationAvailable?:boolean;failed?:boolean;retry?:()=>void}){const navigate=useListNavigation();return (<Stack data-testid="home-summary-area" spacing="8px" sx={{ minWidth: 0, minHeight: { sm: 290 }, gridArea: { sm: 'summary' } }}>
      <Box data-testid="home-total-card" aria-busy={pending} sx={{height:76,position:'relative'}}><TotalAssetCard summary={summary ?? unavailableSummary} home loading={pending}/>{(failed)&&<QueryErrorNotice message="조회 실패" onRetry={()=>{retry();}}/>}</Box>
      <Box data-testid="home-quick-cards" aria-busy={pending} sx={{height:68}}><AssetQuickCards allocationAvailable={allocationAvailable} summary={summary ?? unavailableSummary} home loading={pending}/></Box>
      <PerformanceCard onClick={()=>navigate('/detail/investment')} summary={summary ?? unavailableSummary} profit={summary?.pricingComplete === false ? NaN : summary?.totalProfit ?? NaN} rate={summary?.pricingComplete === false || !((summary?.stockPurchaseAmount ?? 0) > 0) ? NaN : summary?.totalProfitRate ?? NaN} loading={pending}/>

    </Stack>);}
