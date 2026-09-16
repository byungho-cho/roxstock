import { dashboardMock } from '../mocks/dashboard';
import type { DashboardData } from '../types/dashboard';

export async function getDashboard(): Promise<DashboardData> {
  await new Promise((resolve) => window.setTimeout(resolve, 250));
  return dashboardMock;
}
