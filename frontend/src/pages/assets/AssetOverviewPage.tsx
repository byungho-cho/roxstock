import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {groupedComposition} from '../../utils/assetComposition';
import {CompositionCard,type ChartItem} from './CompositionCard';
import {useListNavigation,usePageMemory} from '../../hooks/navigation/usePageMemory';
import {DashboardTrend} from './DashboardTrend';
import '../dashboard/home-font.css';
import { Box, Button, Snackbar, useMediaQuery } from '@mui/material';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import { AssetAnalysisPage } from './AssetAnalysisPage';
import { PageHeader } from '../../components/navigation/Navigation';
import { assetComposition } from '../../data/mockData';
import { liveApiEnabled } from '../../data/liveData';
import { useDashboard } from '../../hooks/useMockData';
import type { DashboardSummary } from '../../types/models';



export function AssetOverviewPage() {
  const navigate=useListNavigation();
  const tablet = useMediaQuery('(min-width:600px)');
  const { data, isPending, isError, isFetching, refetch, historyData, historyPending, historyError, historyRefetch } = useDashboard({ pollPrices: true, deferTrend: true, investmentHistory: true, includeTrend: !tablet });
  const {accountId, accounts}=useActiveAccount();
  const pending=isPending&&!isError&&!accounts.isError;
  const [mode, setMode] = usePageMemory<'cumulative' | 'ranked'>('asset-weight-mode','ranked',{adoptInitialAccount:true});
  const [basis,setBasis]=usePageMemory<'valuation'|'investment'>('asset-display-basis','valuation',{adoptInitialAccount:true});
  const header = <PageHeader title="대시보드" variant="detail" backPath="/" showBackTablet showAdd={false} assetOverview backIcon={<Box component="span" sx={{ fontSize: 30, lineHeight: '30px' }}>‹</Box>} embedded action={<Button aria-label="대시보드 금액 기준 변경" onClick={()=>setBasis(value=>value==='valuation'?'investment':'valuation')} sx={{minWidth:62,minHeight:22,height:22,borderRadius:'11px',bgcolor:'#202B3E',color:'#60A5FA',fontSize:10,p:0}}>{basis==='valuation'?'평가금':'투자금'}</Button>} />;
  const summary=data?.summary??unavailableSummary,holdings=data?.holdings??[];
  const today = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul'}).format(new Date());
  const monthAgo = new Date(`${today}T00:00:00Z`);monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1);
  const from = monthAgo.toISOString().slice(0, 10);
  const trend = liveApiEnabled ? (historyData?.data ?? []).map(point => ({date: point.date, value: (basis==='investment'?point.investmentAmount:point.totalAssetValue) == null ? NaN : Number(basis==='investment'?point.investmentAmount:point.totalAssetValue)})) : (data?.trend ?? []).map(point => ({date: point.label, value: point.value}));
  const points = trend.filter(point => !/^\d{4}-\d{2}-\d{2}$/.test(point.date) || (point.date >= from && point.date <= today));
  const trendCard = <DashboardTrend basis={basis} key={accountId} points={points} pending={liveApiEnabled && historyPending && !accounts.isError && (!!accountId || accounts.isPending)} failed={historyError || accounts.isError} retry={() => {if(accounts.isError)void accounts.refetch();else void historyRefetch();}}/>;
  const composition = (liveApiEnabled
    ? summary.pricingComplete === false ? [] : holdings.filter(stock => Number.isFinite(stock.marketValue) && stock.marketValue! >= 0).map(stock => ({ id: stock.id, amount:stock.marketValue!, percent: summary.stockValue > 0 ? stock.marketValue! / summary.stockValue * 100 : 0 }))
    : [...assetComposition]).sort((a, b) => b.percent - a.percent);
  const items: ChartItem[] = groupedComposition(composition.map(row=>({...row,purchaseAmount:holdings.find(stock=>stock.id===row.id)?.purchaseAmount,purchasePercent:summary.stockPurchaseAmount>0&&Number.isFinite(holdings.find(stock=>stock.id===row.id)?.purchaseAmount)?holdings.find(stock=>stock.id===row.id)!.purchaseAmount!/summary.stockPurchaseAmount*100:undefined,amount:'amount' in row&&typeof row.amount==='number'?row.amount:summary.stockValue*row.percent/100,name:holdings.find(stock=>stock.id===row.id)?.name??`종목명 미확인 (${row.id})`})));
  return <>{header}<QueryErrorNotice active={isError} message={"최신 데이터 조회에 실패했습니다. 이전 값을 표시합니다."} inlineRetry={false}/>
    <Box className="rox-home" data-testid="asset-overview" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: '8px', alignItems: 'stretch' }}>
      <CompositionCard basis={basis} onHome={()=>navigate('/')} onStocks={()=>navigate('/stocks?tab=holding')} onStock={id=>navigate(`/stocks/${id}?detailTab=summary`,{state:{stockNavigation:{accountId,ids:items.filter(item=>item.id!=='other').map(item=>item.id),tab:'holding'}}})} trend={tablet ? null : trendCard} loading={pending} failed={isError||accounts.isError} retry={()=>{void refetch();if(accounts.isError)void accounts.refetch();}} allocationAvailable={!isError} summary={summary} items={items} mode={mode} updating={isFetching} onToggle={() => setMode(previous => previous === 'cumulative' ? 'ranked' : 'cumulative')} />
      {tablet && <AssetAnalysisPage dashboardPanel basis={basis} />}
    </Box>
  </>;
}


const unavailableSummary:DashboardSummary={totalAssets:NaN,stockValue:NaN,stockPurchaseAmount:NaN,cashBalance:NaN,dailyProfit:NaN,dailyProfitRate:NaN,stockMonthlyProfit:NaN,cashMonthlyProfit:NaN,totalProfit:NaN,totalProfitRate:NaN,collectedAt:'',pricingComplete:false};
