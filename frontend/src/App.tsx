import {TradeDetailPage} from './pages/trade/TradeDetailPage';
import {useCallback,useRef,useState} from 'react';
import {Box,Dialog,DialogContent,DialogTitle,IconButton,useMediaQuery} from '@mui/material';
import {HeaderSlotContext} from './components/navigation/Navigation';
import {StockInputContext} from './pages/stocks/StockInputContext';
import {StockPricePage} from './pages/stocks/StockPricePage';
import { TargetArrivalPage } from './pages/dashboard/TargetArrivalCard';
import { Navigate, Route, Routes, useLocation, useNavigate, type Location } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { ValueAnalysisPage } from './pages/value/ValueAnalysisPage';
import { FinancialPage } from './pages/financial/FinancialPage';
import { CompoundPage } from './pages/compound/CompoundPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { StockListPage } from './pages/stocks/StockListPage';
import { StockDetailPage } from './pages/stocks/StockDetailPage';
import { LiveStockDetailPage } from './pages/stocks/LiveStockDetailPage';
import { LiveStockEditPage } from './pages/stocks/LiveStockEditPage';
import { StockAddPage } from './pages/stocks/StockAddPage';
import { StockEditPage } from './pages/stocks/StockEditPage';
import { TradePage } from './pages/trade/TradePage';
import { InvestmentProfitPage } from './pages/investment-profit/InvestmentProfitPage';
import { InvestmentPage } from './pages/investment/InvestmentPage';
import { AssetAnalysisPage } from './pages/assets/AssetAnalysisPage';
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
  const tablet=useMediaQuery('(min-width:600px)'),[inputTitle,setInputTitle]=useState(''),inputBusy=useRef(false);
  const setInputBusy=useCallback((busy:boolean)=>{inputBusy.current=busy;},[]);
  const suppliedBackground=(location.state as {backgroundLocation?:Location}|null)?.backgroundLocation;
  const params=new URLSearchParams(location.search),adding=location.pathname==='/stocks/add';
  const fallback={...location,pathname:adding?'/stocks':params.get('stock')?`/stocks/${params.get('stock')}`:'/stocks',search:adding?`?tab=${params.get('from')==='home'||params.get('type')==='holding'?'holding':'watchlist'}`:'',state:null};
  const background=suppliedBackground??fallback;
  const modal=tablet&&(adding||location.pathname==='/trade');
  const close=()=>{if(!inputBusy.current){if(suppliedBackground)navigate(-1);else navigate(background.pathname+background.search,{replace:true});}};
  const title=adding?inputTitle||`종목추가(${params.get('from')==='home'||params.get('type')==='holding'?'보유종목':'관심종목'})`:`${params.get('type')==='sell'?'매도':'매수'} ${params.has('edit')?'수정':'등록'}`;
  return (<>
    <Routes location={modal?background:location}>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="stocks" element={<StockListPage />} />
        <Route path="stocks/add" element={<StockAddPage />} />
        <Route path="stocks/:stockId/price" element={<StockPricePage />} />
        <Route path="stocks/:stockId/edit" element={liveApiEnabled ? <LiveStockEditPage /> : <StockEditPage />} />
        <Route path="stocks/:stockId/value" element={<ValueAnalysisPage />} />
        <Route path="stocks/:stockId/financials" element={<FinancialPage />} />
        <Route path="stocks/:stockId" element={liveApiEnabled ? <LiveStockDetailPage /> : <StockDetailPage />} />
        <Route path="journal/trade/:type/:tradeId" element={<TradeDetailPage/>}/><Route path="journal" element={<JournalPage />} />
        <Route path="assets" element={<AssetAnalysisPage />} />
        <Route path="detail/target-arrivals" element={<TargetArrivalPage />} />
        <Route path="detail/assets" element={<AssetOverviewPage />} />
        <Route path="detail/cash" element={liveApiEnabled ? <LiveCashPage /> : <CashPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="detail/settings" element={<SettingsPage />} />
        <Route path="detail/collection-monitoring" element={<CollectionMonitoringPage />} />
        <Route path="detail/collection-monitoring/:feature" element={<CollectionMonitoringPage />} />
        <Route path="detail/compound" element={<CompoundPage />} />
        <Route path="detail/financials" element={<FinancialPage />} />
        <Route path="detail/value" element={<ValueAnalysisPage />} />
        <Route path="detail/investment" element={<InvestmentPage />} />
        <Route path="detail/investment-profit" element={<InvestmentProfitPage />} />
        <Route path="detail/:detailType" element={<PlaceholderPage title="상세정보" description="선택한 홈 카드의 상세 화면은 다음 구현 단계에서 연결합니다." />} />
        <Route path="trade" element={<TradePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    {modal&&<Dialog open onClose={close} slotProps={{transition:{onEntered:()=>{const input=modalContent.current?.querySelector<HTMLInputElement>('input:not([disabled]):not([readonly])');if(!modalContent.current?.contains(document.activeElement)){input?.focus({preventScroll:true});if(input&&input.type!=='date')input.select();}}},paper:{className:'rox-home',sx:{m:'16px',width:'calc(100% - 32px)',maxWidth:location.pathname==='/trade'?816:370,maxHeight:'calc(100dvh - 32px)',borderRadius:'8px',bgcolor:'#0B1220',fontFamily:'RoxHomeInter, sans-serif',border:'1px solid #2E4263',backgroundImage:'none'}}}}><DialogTitle data-testid="stock-flow-modal-title" sx={{height:44,minHeight:44,flexShrink:0,boxSizing:'border-box',p:'8px',fontSize:16,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'space-between'}}>{title}<IconButton aria-label="입력 팝업 닫기" onClick={close} sx={{p:0}}><Box component="img" src="/stocks-v03/close.svg" alt="" sx={{width:16,height:16}}/></IconButton></DialogTitle><DialogContent ref={modalContent} data-testid="stock-flow-modal-body" sx={{p:'0 8px 8px !important',minHeight:0,overflowY:'auto',scrollbarWidth:'none'}}><StockInputContext.Provider value={{inDialog:true,setTitle:setInputTitle,setBusy:setInputBusy}}><HeaderSlotContext.Provider value={null}><Routes><Route path="stocks/add" element={<StockAddPage/>}/><Route path="trade" element={<TradePage/>}/></Routes></HeaderSlotContext.Provider></StockInputContext.Provider></DialogContent></Dialog>}
  </>);
}


