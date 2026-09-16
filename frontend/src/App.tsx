import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

export function App() {
  return <Routes><Route element={<AppLayout />}><Route index element={<DashboardPage />} /><Route path="portfolio" element={<PlaceholderPage title="포트폴리오" />} /><Route path="trade" element={<PlaceholderPage title="매매 등록" />} /><Route path="journal" element={<PlaceholderPage title="매매일지" />} /><Route path="more" element={<PlaceholderPage title="더보기" />} /></Route></Routes>;
}
