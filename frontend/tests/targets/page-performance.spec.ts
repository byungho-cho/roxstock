import { test, expect } from '@playwright/test';
import { fixture } from './stock-input-fixture';

test('home requests one month of compact trend points and renders the chart', async ({ page }) => {
  await fixture(page);
  await page.clock.install({ time: new Date('2026-10-11T03:00:00Z') });
  const requests: URL[] = [];
  await page.route('**/api/accounts/*/asset-history**', route => {
    requests.push(new URL(route.request().url()));
    return route.fulfill({ json: { data: [{ date: '2026-09-11', totalAssetValue: '100' }, { date: '2026-10-11', totalAssetValue: '200' }] } });
  });
  await page.route('**/api/accounts/*/dashboard', route => route.fulfill({ json: { data: {
    cashBalance: '200', purchaseAmount: '0', stockValue: '0', totalAssetValue: '200',
    holdings: [], pricingComplete: true,
  } } }));
  await page.route('**/api/accounts/*/target-arrivals**', route => route.fulfill({ json: { data: [], meta: { enabled: false, total: 0, unavailableCount: 0 } } }));
  await page.goto('/');
  await expect(page.getByTestId('home-trend-card').locator('svg').first()).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(Object.fromEntries(requests[0].searchParams)).toEqual({ from: '2026-09-11', to: '2026-10-11', view: 'trend' });
});

test('stock list requests compact trade summary and reuses it while switching tabs', async ({ page }) => {
  await fixture(page);
  const requests: URL[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('/trades')) requests.push(url);
  });
  await page.goto('/stocks?tab=holding');
  await expect(page.getByTestId('stock-list')).toHaveAttribute('data-restoration-ready', 'true');
  await page.getByRole('tab', { name: '거래종목' }).click();
  await expect(page.getByTestId('stock-list')).toHaveAttribute('data-restoration-ready', 'true');
  expect(requests.filter(url => !url.searchParams.has('securityId')).map(url => url.searchParams.get('view'))).toEqual(['stocks']);
});
