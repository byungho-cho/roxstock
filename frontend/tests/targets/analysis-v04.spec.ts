import { test, expect, type Page } from '@playwright/test';
import { fixture } from './stock-input-fixture';
import { analysisRange, decimalValue } from '../../src/pages/assets/analysisPeriod';

async function setup(page: Page) {
  await fixture(page);
  let error = false, empty = false, missing = false;
  const reads: URL[] = [];
  await page.route('**/api/accounts', route => route.fulfill({ json: { data: ['a', 'b'].map((id, i) => ({ id, name: '계좌 ' + id, brokerName: '검사', cashBalance: '200000', isActive: true, isDefault: i === 0 })) } }));
  await page.route('**/api/accounts/*/dashboard', route => route.fulfill({ json: { data: { account: { id: 'a', name: '계좌', brokerName: '검사' }, cashBalance: '200000', stockValue: missing ? null : '800000', totalAssetValue: missing ? null : route.request().url().includes('/b/') ? '2000000' : '1000000', purchaseAmount: '700000', unrealizedProfitLoss: '100000', unrealizedReturnRate: '14', pricingComplete: !missing, latestPriceUpdatedAt: null, holdings: [] } } }));
  await page.route('**/api/accounts/*/asset-history**', route => {
    const url = new URL(route.request().url()); reads.push(url);
    if (error) return route.fulfill({ status: 500, json: { error: { message: '조회 검사 실패' } } });
    const from = url.searchParams.get('from') ?? '2020-01-01', to = url.searchParams.get('to')!;
    return route.fulfill({ json: { data: empty ? [] : [{ date: from, totalAssetValue: '800000', cashBalance: '200000', stockValue: '600000', change: null, changeRate: null }, { date: to, totalAssetValue: '1000000', cashBalance: '200000', stockValue: '800000', change: '200000', changeRate: '25' }], summary: { from: empty ? null : from, to: empty ? null : to, openingAssetValue: empty ? null : '800000', closingAssetValue: empty ? null : '1000000', depositAmount: '100000', withdrawalAmount: '0', profitLoss: empty ? null : '100000', returnRate: empty ? null : '12.5' } } });
  });
  return { reads, error: () => { error = true; }, success: () => { error = false; }, empty: () => { empty = true; }, missing: () => { missing = true; } };
}
const region = (page: Page, name = 'analysis-left') => page.viewportSize()!.width >= 600 ? page.locator(`[data-scroll-region="${name}"]`) : page.locator('main');

test('menu order, icons, screen references and home destinations stay distinct', async ({ page }) => {
  await setup(page); await page.goto('/more');
  const menu = page.getByTestId('more-menu');
  expect(await menu.getByTestId('more-shortcut').allTextContents()).toEqual(['홈', '종목목록', '매매일지', '예수금', '자산분석', '투자금', '투자손익', '가치분석', '재무제표', '복리계획', '모니터링', '설정']);
  for (const [name, number, icon] of [['예수금', '1300', 'cash'], ['자산분석', '1400', 'assets'], ['투자금', '1500', 'cash'], ['투자손익', '1600', 'investment-profit']]) {
    const button = menu.getByRole('button', { name, exact: true });
    await expect(button).toHaveAttribute('data-screen-number', number);
    await expect(button.locator('img')).toHaveAttribute('src', `/more-v03/${icon}.svg`);
  }
  await menu.getByRole('button', { name: '예수금', exact: true }).click(); await expect(page).toHaveURL(/\/detail\/cash/);
  await page.goto('/'); await page.getByTestId('home-trend-card').click(); await expect(page).toHaveURL(/\/assets$/);
  await page.getByRole('button', { name: '뒤로가기', exact: true }).click(); await expect(page).toHaveURL(/\/$/);
  await page.getByText('예수금', { exact: true }).first().click(); await expect(page).toHaveURL(/\/detail\/cash/);
});

test('period changes chart and performance together; title and buttons have independent destinations; context and scroll return', async ({ page }) => {
  const state = await setup(page); await page.goto('/assets');
  await expect(page.getByTestId('analysis-chart')).toBeVisible();
  await page.getByRole('button', { name: '3개월', exact: true }).click();
  await expect.poll(() => state.reads.at(-1)?.searchParams.get('from')).toBe(analysisRange('3m', new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())).from);
  await expect(page.getByTestId('analysis-trend-period')).toHaveText(await page.getByTestId('analysis-performance-period').textContent() ?? '');
  await page.getByTestId('analysis-chart').click(); await expect(page).toHaveURL(/\/assets$/);
  const body = region(page); const maximum = await body.evaluate(el => el.scrollHeight - el.clientHeight);
  await body.evaluate((el, top) => { el.scrollTop = top; }, Math.min(50, maximum));
  const title = page.getByTestId('analysis-trend-title'); await title.scrollIntoViewIfNeeded();
  const before = await body.evaluate(el => el.scrollTop);
  await title.click(); await expect(page).toHaveURL(/\/detail\/investment-profit\?/);
  const url = new URL(page.url()); expect(url.searchParams.get('period')).toBe('3m'); expect(url.searchParams.get('accountId')).toBe('a'); expect(url.searchParams.get('from')).toBeTruthy();
  await page.getByRole('button', { name: '이전 화면' }).click();
  await expect(page.getByRole('button', { name: '3개월', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBe(before);
  await body.evaluate(el => { el.scrollTop = 0; }); await page.getByTestId('analysis-total').click(); await expect(page).toHaveURL(/\/detail\/investment\?/);
  await page.goBack(); await expect(page.getByRole('button', { name: '3개월', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('four sizes keep geometry, separate scrolling, sticky bounds, overlay hiding and bottom clearance', async ({ page }, info) => {
  await setup(page); await page.goto('/assets'); await expect(page.getByTestId('analysis-chart')).toBeVisible();
  const total = (await page.getByTestId('analysis-total').boundingBox())!;
  expect(total.x).toBe(8);
  const overflow = await page.getByTestId('asset-analysis').locator('p').evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent)); expect(overflow).toEqual([]);
  console.log('ROX_ANALYSIS_IMAGE '+JSON.stringify({tag:'initial',project:info.project.name,image:(await page.screenshot({path:`test-results/targets/analysis-initial-${info.project.name}.png`})).toString('base64')}));
  if (page.viewportSize()!.width >= 600) {
    expect((await page.getByTestId('analysis-performance').boundingBox())!.x - total.x - total.width).toBe(8);
    await expect(page.locator('main')).toHaveCSS('overflow-y', 'hidden');
    const right = region(page, 'analysis-right'); const max = await right.evaluate(el => el.scrollHeight - el.clientHeight);
    if (max > 1) {
      const leftPosition = await region(page).evaluate(el => el.scrollTop);
      await right.evaluate(el => { el.scrollTop = 40; });
      expect(await region(page).evaluate(el => el.scrollTop)).toBe(leftPosition);
      expect((await page.getByTestId('analysis-sticky').boundingBox())!.y).toBeGreaterThanOrEqual(43);
      const bar = page.getByRole('scrollbar', { name: '자산분석 오른쪽 스크롤' }); await expect(bar).toHaveCSS('width', '4px');
      await expect(bar).toHaveCSS('opacity', '0', { timeout: 2500 });
      await right.evaluate(el => { el.scrollTop += 1; }); await expect(bar).toHaveCSS('opacity', '1');
    }
  }
  for (const body of page.viewportSize()!.width >= 600 ? [region(page), region(page, 'analysis-right')] : [region(page)]) {
    await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const clearance = await body.evaluate(el => { const last = el.lastElementChild; return { padding: getComputedStyle(el).paddingBottom, bottom: last?.getBoundingClientRect().bottom, viewport: el.getBoundingClientRect().bottom }; });
    expect(clearance.padding).toBe('80px');
  }
  console.log('ROX_ANALYSIS_IMAGE '+JSON.stringify({tag:'bottom',project:info.project.name,image:(await page.screenshot({path:`test-results/targets/analysis-bottom-${info.project.name}.png`})).toString('base64')}));
  const selected = page.locator('.MuiBottomNavigation-root:visible .Mui-selected'); await expect(selected).toContainText('자산분석');
});

test('real server period result is preserved, unknown breakdown and plan are not zero; empty/error/missing/account states differ', async ({ page }) => {
  const state = await setup(page); await page.goto('/assets');
  await expect(page.getByTestId('analysis-metric-기간 투자손익')).toContainText('100,000원');
  await expect(page.getByTestId('analysis-metric-평가손익')).toContainText('—');
  await expect(page.getByTestId('analysis-compound')).toContainText('기준 자산 연결이 필요');
  await page.evaluate(() => { localStorage.setItem('roxstock-selected-account-id', 'b'); window.dispatchEvent(new Event('roxstock-selected-account')); });
  await expect(page.getByTestId('analysis-total-value')).toHaveText('2,000,000원');
  await expect.poll(() => state.reads.at(-1)?.pathname).toContain('/b/');
  state.empty(); await page.getByRole('button', { name: '전체', exact: true }).click(); await expect(page.getByText('내용이 없습니다.', { exact: true })).toBeVisible();
  state.error(); await page.getByRole('button', { name: '6개월', exact: true }).click(); await expect(page.getByText('자산 이력 조회에 실패했습니다.', { exact: true })).toBeVisible({ timeout: 15000 });
  state.success(); await page.getByRole('button', { name: '다시 시도', exact: true }).click(); await expect(page.getByText('내용이 없습니다.', { exact: true })).toBeVisible();
  state.missing(); await page.reload(); await expect(page.getByTestId('analysis-total-value')).toHaveText('—'); await expect(page.getByText('시세 미수집 · 구성 계산 불가')).toBeVisible();
  expect(decimalValue(null)).toBeNaN(); expect(analysisRange('1m', '2026-03-31').from).toBe('2026-02-28');
});
