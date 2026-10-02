import {useRef} from 'react';
import {Box,Dialog,DialogContent,DialogTitle,IconButton} from '@mui/material';
import {HeaderSlotContext} from './components/navigation/Navigation';
import { TargetArrivalPage } from './pages/dashboard/TargetArrivalCard';
import { Navigate, Route, Routes, useLocation, useNavigate, type Location } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { StockListPage } from './pages/stocks/StockListPage';
import { StockDetailPage } from './pages/stocks/StockDetailPage';
import { LiveStockDetailPage } from './pages/stocks/LiveStockDetailPage';
import { LiveStockEditPage } from './pages/stocks/LiveStockEditPage';
import { LiveStockInsightPage } from './pages/stocks/LiveStockInsightPage';
import { StockInsightPage } from './pages/stocks/StockInsightPage';
import { StockAddPage } from './pages/stocks/StockAddPage';
import { StockEditPage } from './pages/stocks/StockEditPage';
import { TradePage } from './pages/trade/TradePage';
import { AssetOverviewPage } from './pages/assets/AssetOverviewPage';
import { CashPage } from './pages/cash/CashPage';
import { LiveCashPage } from './pages/cash/LiveCashPage';
import { liveApiEnabled } from './data/liveData';
import { JournalPage } from './pages/journal/JournalPage';
import { MorePage } from './pages/more/MorePage';
import { SettingsPage } from './pages/more/SettingsPage';
import { CollectionMonitoringPage } from './pages/more/CollectionMonitoringPage';

export function App() {
  const location=useLocation(),navigate=useNavigate(),modalContent=useRef<HTMLDivElement>(null);
  const background=(location.state as {backgroundLocation?:Location}|null)?.backgroundLocation;
  const modal=!!background&&(location.pathname==='/stocks/add'||location.pathname==='/trade');
  const params=new URLSearchParams(location.search),title=location.pathname==='/stocks/add'?'종목 추가':`${params.get('type')==='sell'?'매도':'매수'} ${params.has('edit')?'수정':'등록'}`;
  return (<>
    <Routes location={modal?background:location}>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="stocks" element={<StockListPage />} />
        <Route path="stocks/add" element={<StockAddPage />} />
        <Route path="stocks/:stockId/edit" element={liveApiEnabled ? <LiveStockEditPage /> : <StockEditPage />} />
        <Route path="stocks/:stockId/value" element={liveApiEnabled ? <LiveStockInsightPage mode="value" /> : <StockInsightPage mode="value" />} />
        <Route path="stocks/:stockId/financials" element={liveApiEnabled ? <LiveStockInsightPage mode="financials" /> : <StockInsightPage mode="financials" />} />
        <Route path="stocks/:stockId" element={liveApiEnabled ? <LiveStockDetailPage /> : <StockDetailPage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="assets" element={<PlaceholderPage title="자산분석" description="자산 추이와 기간 성과 화면은 다음 구현 단계에서 연결합니다." />} />
        <Route path="detail/target-arrivals" element={<TargetArrivalPage />} />
        <Route path="detail/assets" element={<AssetOverviewPage />} />
        <Route path="detail/cash" element={liveApiEnabled ? <LiveCashPage /> : <CashPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="detail/settings" element={<SettingsPage />} />
        <Route path="detail/collection-monitoring" element={<CollectionMonitoringPage />} />
        <Route path="detail/collection-monitoring/:feature" element={<CollectionMonitoringPage />} />
        <Route path="detail/:detailType" element={<PlaceholderPage title="상세정보" description="선택한 홈 카드의 상세 화면은 다음 구현 단계에서 연결합니다." />} />
        <Route path="trade" element={<TradePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    {modal&&<Dialog open onClose={()=>navigate(-1)} slotProps={{transition:{onEntered:()=>{const input=modalContent.current?.querySelector<HTMLInputElement>('input:not([disabled]):not([readonly])');input?.focus({preventScroll:true});if(input&&input.type!=='date')input.select();}},paper:{sx:{m:'16px',width:'calc(100% - 32px)',maxWidth:location.pathname==='/trade'?386:370,maxHeight:'calc(100dvh - 32px)',borderRadius:'8px',bgcolor:'#0B1220',border:'1px solid #2E4263',backgroundImage:'none'}}}}><DialogTitle sx={{height:44,p:'8px 16px',fontSize:16,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'space-between'}}>{title}<IconButton aria-label="입력 팝업 닫기" onClick={()=>navigate(-1)} sx={{p:0}}><Box component="img" src="/stocks-v03/close.svg" alt=""/></IconButton></DialogTitle><DialogContent ref={modalContent} data-testid="stock-flow-modal-body" sx={{p:'0 8px 8px !important',minHeight:0,overflowY:'auto',scrollbarWidth:'none'}}><HeaderSlotContext.Provider value={null}><Routes><Route path="stocks/add" element={<StockAddPage/>}/><Route path="trade" element={<TradePage/>}/></Routes></HeaderSlotContext.Provider></DialogContent></Dialog>}
  </>);
}

