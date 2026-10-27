const SecurityDataPage=lazy(()=>import('./pages/more/SecurityDataPage').then(m=>({default:m.SecurityDataPage})));
import {AdminPage,AdminUsers,AdminUserDetail,AdminToolPage} from './pages/admin/AdminPage';
import {PushLifecycle} from './notifications/PushLifecycle';
import {useAuth} from './auth/AuthGate';
const NewsCollectionSettings=lazy(()=>import('./pages/news/NewsCollectionSettings').then(m=>({default:m.NewsCollectionSettings})));
const NewsCollectionStatus=lazy(()=>import('./pages/news/NewsCollectionStatus').then(m=>({default:m.NewsCollectionStatus})));
const StockNewsPage=lazy(()=>import('./pages/news/StockNewsPage').then(m=>({default:m.StockNewsPage})));
const StockNewsDetailPage=lazy(()=>import('./pages/news/StockNewsPage').then(m=>({default:m.StockNewsDetailPage})));
const CollectionBugReports=lazy(()=>import('./pages/more/CollectionBugReports').then(m=>({default:m.CollectionBugReports})));
const InvestorTrendsPage=lazy(()=>import('./pages/investor/InvestorTrendsPage').then(m=>({default:m.InvestorTrendsPage})));
const SecurityManagementPage=lazy(()=>import('./pages/more/SecurityManagementPage').then(m=>({default:m.SecurityManagementPage})));
import { StockInputContext } from './pages/stocks/StockInputContext';
import { RouteContent } from './components/common/RouteLoading';
import {lazy,useCallback,useRef,useState} from 'react';
import {Box,Dialog,DialogContent,DialogTitle,IconButton,useMediaQuery} from '@mui/material';
import {HeaderSlotContext} from './components/navigation/Navigation';
import { Navigate, Outlet, Route, Routes, useLocation, useNavigate, type Location } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { liveApiEnabled } from './data/liveData';

const TradeDetailPage = lazy(() => import('./pages/trade/TradeDetailPage').then(module => ({ default: module.TradeDetailPage })));

const StockPricePage = lazy(() => import('./pages/stocks/StockPricePage').then(module => ({ default: module.StockPricePage })));
const TargetArrivalPage = lazy(() => import('./pages/dashboard/TargetArrivalCard').then(module => ({ default: module.TargetArrivalPage })));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage').then(module => ({ default: module.DashboardPage })));
const ValueAnalysisPage = lazy(() => import('./pages/value/ValueAnalysisPage').then(module => ({ default: module.ValueAnalysisPage })));
const FinancialPage = lazy(() => import('./pages/financial/FinancialPage').then(module => ({ default: module.FinancialPage })));
const CompoundPage = lazy(() => import('./pages/compound/CompoundPage').then(module => ({ default: module.CompoundPage })));
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage').then(module => ({ default: module.PlaceholderPage })));
const StockListPage = lazy(() => import('./pages/stocks/StockListPage').then(module => ({ default: module.StockListPage })));
const StockDetailPage = lazy(() => import('./pages/stocks/StockDetailPage').then(module => ({ default: module.StockDetailPage })));
const LiveStockDetailPage = lazy(() => import('./pages/stocks/LiveStockDetailPage').then(module => ({ default: module.LiveStockDetailPage })));
const LiveStockEditPage = lazy(() => import('./pages/stocks/LiveStockEditPage').then(module => ({ default: module.LiveStockEditPage })));
const StockAddPage = lazy(() => import('./pages/stocks/StockAddPage').then(module => ({ default: module.StockAddPage })));
const StockEditPage = lazy(() => import('./pages/stocks/StockEditPage').then(module => ({ default: module.StockEditPage })));
const TradePage = lazy(() => import('./pages/trade/TradePage').then(module => ({ default: module.TradePage })));
const InvestmentProfitPage = lazy(() => import('./pages/investment-profit/InvestmentProfitPage').then(module => ({ default: module.InvestmentProfitPage })));
const InvestmentPage = lazy(() => import('./pages/investment/InvestmentPage').then(module => ({ default: module.InvestmentPage })));
const AssetAnalysisPage = lazy(() => import('./pages/assets/AssetAnalysisPage').then(module => ({ default: module.AssetAnalysisPage })));
const AssetOverviewPage = lazy(() => import('./pages/assets/AssetOverviewPage').then(module => ({ default: module.AssetOverviewPage })));
const CashPage = lazy(() => import('./pages/cash/CashPage').then(module => ({ default: module.CashPage })));
const LiveCashPage = lazy(() => import('./pages/cash/LiveCashPage').then(module => ({ default: module.LiveCashPage })));
const JournalPage = lazy(() => import('./pages/journal/JournalPage').then(module => ({ default: module.JournalPage })));
import {MorePage} from './pages/more/MorePage';
import {SettingsPage} from './pages/more/SettingsPage';
const CollectionMonitoringPage = lazy(() => import('./pages/more/CollectionMonitoringPage').then(module => ({ default: module.CollectionMonitoringPage })));

function AdminAccess(){const {user}=useAuth();return user?.role==='ADMIN'?<Outlet/>:<Navigate to="/more" replace/>;}
function MonitoringAccess(){const {user}=useAuth();return !liveApiEnabled||user?.role==='ADMIN'?<Outlet/>:<Navigate to="/more" replace/>;}

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
  return (<><PushLifecycle/>
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
        <Route element={<AdminAccess/>}><Route path="detail/security-data" element={<SecurityDataPage/>}/><Route path="detail/admin" element={<AdminPage/>}/><Route path="detail/admin/backup" element={<AdminToolPage tool="backup"/>}/><Route path="detail/admin/collection" element={<AdminToolPage tool="collection"/>}/><Route path="detail/admin/users" element={<AdminUsers/>}/><Route path="detail/admin/users/:subjectId" element={<AdminUserDetail/>}/><Route path="detail/news-collection-settings" element={<NewsCollectionSettings/>}/><Route path="detail/security-management" element={<SecurityManagementPage/>}/></Route><Route path="detail/stock-news" element={<StockNewsPage/>}/>
        <Route path="detail/stock-news/:newsId" element={<StockNewsDetailPage/>}/>
        <Route path="detail/investor-trends" element={<InvestorTrendsPage/>} />
        <Route path="detail/assets" element={<AssetOverviewPage />} />
        <Route path="detail/cash" element={liveApiEnabled ? <LiveCashPage /> : <CashPage />} />
        <Route path="more" element={<MorePage />} />

        <Route path="detail/settings" element={<SettingsPage />} />
        <Route path="detail/collection-monitoring" element={<MonitoringAccess/>}>
          <Route index element={<CollectionMonitoringPage/>}/>
          <Route path="stock-news" element={<NewsCollectionStatus/>}/>
          <Route path="bug-reports" element={<CollectionBugReports/>}/>
          <Route path=":feature/:stream" element={<CollectionMonitoringPage/>}/>
          <Route path=":feature" element={<CollectionMonitoringPage/>}/>
        </Route>
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
    {modal&&<Dialog open disableAutoFocus={!!location.state?.notificationTrade} onClose={close} slotProps={{transition:{onEntered:()=>{if(location.state?.notificationTrade)return;const input=modalContent.current?.querySelector<HTMLInputElement>('input:not([disabled]):not([readonly])');if(!modalContent.current?.contains(document.activeElement)){input?.focus({preventScroll:true});if(input&&input.type!=='date')input.select();}}},paper:{className:'rox-home',sx:{m:location.pathname==='/trade'?0:'16px',width:location.pathname==='/trade'?370:'calc(100% - 32px)',maxWidth:location.pathname==='/trade'?'100vw':370,height:location.pathname==='/trade'?364:undefined,maxHeight:'calc(100dvh - 32px)',borderRadius:'8px',bgcolor:'#0B1220',fontFamily:'RoxHomeInter, sans-serif',border:'1px solid #2E4263',backgroundImage:'none'}}}}><DialogTitle data-testid="stock-flow-modal-title" sx={{height:44,minHeight:44,flexShrink:0,boxSizing:'border-box',p:'8px',fontSize:16,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'space-between'}}>{title}<IconButton aria-label="입력 팝업 닫기" onClick={close} sx={{p:0}}><Box component="img" src="/stocks-v03/close.svg" alt="" sx={{width:16,height:16}}/></IconButton></DialogTitle><DialogContent ref={modalContent} data-testid="stock-flow-modal-body" sx={{p:'0 8px 8px !important',minHeight:0,overflowY:'auto',scrollbarWidth:'none'}}><StockInputContext.Provider value={{inDialog:true,setTitle:setInputTitle,setBusy:setInputBusy}}><HeaderSlotContext.Provider value={null}><RouteContent><Routes><Route path="stocks/add" element={<StockAddPage/>}/><Route path="trade" element={<TradePage/>}/></Routes></RouteContent></HeaderSlotContext.Provider></StockInputContext.Provider></DialogContent></Dialog>}
  </>);
}


