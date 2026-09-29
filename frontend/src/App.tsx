import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { StockListPage } from './pages/stocks/StockListPage';
import { StockDetailPage } from './pages/stocks/StockDetailPage';
import { LiveStockDetailPage } from './pages/stocks/LiveStockDetailPage';
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

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="stocks" element={<StockListPage />} />
        <Route path="stocks/add" element={<StockAddPage />} />
        <Route path="stocks/:stockId/edit" element={liveApiEnabled ? <PlaceholderPage title="종목 정보" description="종목 재무정보 수정 API가 준비되지 않았습니다." /> : <StockEditPage />} />
        <Route path="stocks/:stockId/value" element={liveApiEnabled ? <PlaceholderPage title="가치지표" description="가치지표 조회 API가 준비되지 않았습니다." /> : <StockInsightPage mode="value" />} />
        <Route path="stocks/:stockId/financials" element={liveApiEnabled ? <PlaceholderPage title="재무정보" description="재무정보 조회 API가 준비되지 않았습니다." /> : <StockInsightPage mode="financials" />} />
        <Route path="stocks/:stockId" element={liveApiEnabled ? <LiveStockDetailPage /> : <StockDetailPage />} />
        <Route path="journal" element={<JournalPage />} />
        <Route path="assets" element={<PlaceholderPage title="자산분석" description="자산 추이와 기간 성과 화면은 다음 구현 단계에서 연결합니다." />} />
        <Route path="detail/assets" element={<AssetOverviewPage />} />
        <Route path="detail/cash" element={liveApiEnabled ? <LiveCashPage /> : <CashPage />} />
        <Route path="more" element={<MorePage />} />
        <Route path="detail/settings" element={<SettingsPage />} />
        <Route path="detail/:detailType" element={<PlaceholderPage title="상세정보" description="선택한 홈 카드의 상세 화면은 다음 구현 단계에서 연결합니다." />} />
        <Route path="trade" element={<TradePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
