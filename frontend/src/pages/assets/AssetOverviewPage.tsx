import {QueryErrorNotice} from '../../components/common/QueryErrorNotice';
import {CompositionCard,type ChartItem} from './CompositionCard';
import {useListNavigation,usePageMemory} from '../../hooks/navigation/usePageMemory';
import {DashboardTrend} from './DashboardTrend';
import '../dashboard/home-font.css';
import { Box, Snackbar, useMediaQuery } from '@mui/material';
import {useActiveAccount} from '../../hooks/useActiveAccount';
import { AssetAnalysisPage } from './AssetAnalysisPage';
import { PageHeader } from '../../components/navigation/Navigation';
import { assetComposition } from '../../data/mockData';
import { liveApiEnabled } from '../../data/liveData';
import { useDashboard } from '../../hooks/useMockData';
import type { DashboardSummary } from '../../types/models';

const palette = ['#FA6170', '#60A5FA', '#34D399', '#A78BFA', '#FBC02D', '#94A3B8'];

export function AssetOverviewPage() {
  const navigate=useListNavigation();
  const tablet = useMediaQuery('(min-width:600px)');
  const { data, isPending, isError, isFetching, refetch, historyData, historyPending, historyError, historyRefetch } = useDashboard({ pollPrices: true, deferTrend: true, includeTrend: !tablet });
  const {accountId, accounts}=useActiveAccount();
  const pending=isPending&&!isError&&!accounts.isError;
  const [mode, setMode] = usePageMemory<'cumulative' | 'ranked'>('asset-weight-mode','ranked',{adoptInitialAccount:true});
  const header = <PageHeader title="대시보드" variant="detail" backPath="/" showBackTablet showAdd={false} assetOverview backIcon={<Box component="span" sx={{ fontSize: 30, lineHeight: '30px' }}>‹</Box>} embedded action={<Box sx={{ width: 44, flexShrink: 0 }} />} />;
  const summary=data?.summary??unavailableSummary,holdings=data?.holdings??[];
  const today = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Seoul'}).format(new Date());
  const monthAgo = new Date(`${today}T00:00:00Z`);monthAgo.setUTCMonth(monthAgo.getUTCMonth() - 1);
  const from = monthAgo.toISOString().slice(0, 10);
  const trend = liveApiEnabled ? (historyData?.data ?? []).map(point => ({date: point.date, value: point.totalAssetValue == null ? NaN : Number(point.totalAssetValue)})) : (data?.trend ?? []).map(point => ({date: point.label, value: point.value}));
  const points = trend.filter(point => !/^\d{4}-\d{2}-\d{2}$/.test(point.date) || (point.date >= from && point.date <= today));
  const trendCard = <DashboardTrend key={accountId} points={points} pending={liveApiEnabled && historyPending && !accounts.isError && (!!accountId || accounts.isPending)} failed={historyError || accounts.isError} retry={() => {if(accounts.isError)void accounts.refetch();else void historyRefetch();}}/>;
  const composition = (liveApiEnabled
    ? summary.pricingComplete === false ? [] : holdings.filter(stock => Number.isFinite(stock.marketValue) && stock.marketValue! > 0).map(stock => ({ id: stock.id, percent: summary.stockValue > 0 ? stock.marketValue! / summary.stockValue * 100 : 0 }))
    : [...assetComposition]).sort((a, b) => b.percent - a.percent);
  // Keep six legend slots and five named weight rows; all remaining holdings contribute to 기타.
  const top = composition.filter(item => item.id !== 'other').slice(0, 5);
  const other = composition.filter(item => !top.some(selected => selected.id === item.id)).reduce((sum, item) => sum + item.percent, 0);
  const items: ChartItem[] = [...top, ...(other > 0 ? [{ id: 'other', percent: other }] : [])].map(({ id, percent }, index) => ({
    id, percent, color: palette[index], name: id === 'other' ? '기타' : holdings.find(stock => stock.id === id)?.name ?? '기타',
  }));
  return <>{header}<QueryErrorNotice active={isError} message={"최신 데이터 조회에 실패했습니다. 이전 값을 표시합니다."} inlineRetry={false}/>
    <Box className="rox-home" data-testid="asset-overview" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: '8px', alignItems: 'stretch' }}>
      <CompositionCard onHome={()=>navigate('/')} onStocks={()=>navigate('/stocks?tab=holding')} onStock={id=>navigate(`/stocks/${id}?detailTab=summary`,{state:{stockNavigation:{accountId,ids:items.filter(item=>item.id!=='other').map(item=>item.id),tab:'holding'}}})} trend={tablet ? null : trendCard} loading={pending} failed={isError||accounts.isError} retry={()=>{void refetch();if(accounts.isError)void accounts.refetch();}} allocationAvailable={!isError} summary={summary} items={items} mode={mode} updating={isFetching} onToggle={() => setMode(previous => previous === 'cumulative' ? 'ranked' : 'cumulative')} />
      {tablet && <AssetAnalysisPage dashboardPanel />}
    </Box>
  </>;
}


const unavailableSummary:DashboardSummary={totalAssets:NaN,stockValue:NaN,stockPurchaseAmount:NaN,cashBalance:NaN,dailyProfit:NaN,dailyProfitRate:NaN,stockMonthlyProfit:NaN,cashMonthlyProfit:NaN,totalProfit:NaN,totalProfitRate:NaN,collectedAt:'',pricingComplete:false};
