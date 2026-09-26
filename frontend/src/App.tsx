import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { StockListPage } from './pages/stocks/StockListPage';
import { StockDetailPage } from './pages/stocks/StockDetailPage';
import { StockInsightPage } from './pages/stocks/StockInsightPage';
import { StockAddPage } from './pages/stocks/StockAddPage';
import { StockEditPage } from './pages/stocks/StockEditPage';
import { TradePage } from './pages/trade/TradePage';
import { AssetOverviewPage } from './pages/assets/AssetOverviewPage';

export function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="stocks" element={<StockListPage />} />
        <Route path="stocks/add" element={<StockAddPage />} />
        <Route path="stocks/:stockId/edit" element={<StockEditPage />} />
        <Route path="stocks/:stockId/value" element={<StockInsightPage mode="value" />} />
        <Route path="stocks/:stockId/financials" element={<StockInsightPage mode="financials" />} />
        <Route path="stocks/:stockId" element={<StockDetailPage />} />
        <Route path="journal" element={<PlaceholderPage title="매매일지" description="월간 달력과 날짜별 거래 화면은 다음 구현 단계에서 연결합니다." />} />
        <Route path="assets" element={<PlaceholderPage title="자산분석" description="자산 추이와 기간 성과 화면은 다음 구현 단계에서 연결합니다." />} />
        <Route path="detail/assets" element={<AssetOverviewPage />} />
        <Route path="more" element={<PlaceholderPage title="더보기" description="계좌·예수금·시세수집·설정 메뉴는 다음 구현 단계에서 연결합니다." />} />
        <Route path="detail/:detailType" element={<PlaceholderPage title="상세정보" description="선택한 홈 카드의 상세 화면은 다음 구현 단계에서 연결합니다." />} />
        <Route path="trade" element={<TradePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
