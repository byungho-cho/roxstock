import { expect, test, type Page } from '@playwright/test';
const now = '2026-06-15T03:00:00Z';
const stamp = (date: string) => `${date}T14:00:00Z`;
async function fixture(page: Page, initial: 'normal' | 'empty' | 'missing' | 'error' | 'large' | 'zero' | 'edited' | 'pagination-error' = 'normal') {
  let mode = initial, held = false;
  const releases: (() => void)[] = [];
  await page.clock.install({ time: new Date(now) });
  const transfers = [
    { id: '1', transactionType: 'DEPOSIT', transactionDate: '2025-01-01T00:00:00Z', amount: '100000000.1234', createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' },
    { id: '2', transactionType: 'DEPOSIT', transactionDate: '2026-04-01T00:00:00Z', amount: '20000000.1234', createdAt: '2026-04-01T00:00:00Z', updatedAt: '2026-04-01T00:00:00Z' },
    { id: '3', transactionType: 'DIVIDEND', transactionDate: '2026-06-01T00:00:00Z', amount: '1000000', dividend: { grossAmount: '1200000', netAmount: '1000000' }, createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-01T00:00:00Z' },
    ...Array.from({ length: 99 }, (_, i) => ({ id: String(i + 4), transactionType: 'WITHDRAWAL', transactionDate: '2026-01-01T00:00:00Z', amount: '0.0001', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })),
  ];
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (path === '/api/accounts') return route.fulfill({ json: { data: [{ id: '1', name: '기본', isActive: true, isDefault: true, cashBalance: '0' }, { id: '2', name: '빈 계좌', isActive: true, cashBalance: '0' }] } });
    if (path.endsWith('/asset-history')) {
      if (held && path.includes('/1/')) await new Promise<void>(resolve => releases.push(resolve));
      if (mode === 'error') return route.fulfill({ status: 503, json: { error: { message: '조회 오류' } } });
      const year = Number(url.searchParams.get('from')!.slice(0, 4));
      const start = new Date(`${year}-01-01T00:00:00Z`);
      const snapshots = Array.from({ length: year === 2026 ? 181 : 365 }, (_, i) => {
        const date = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
        return { date, totalAssetValue: mode === 'missing' ? null : mode === 'large' ? '999999999999999.4999' : String(130000000 + i * 1000), updatedAt: stamp(date) };
      });
      return route.fulfill({ json: { data: mode === 'empty' || path.includes('/2/') ? [] : snapshots, summary: {} } });
    }
    if (path.endsWith('/cash-transactions')) {
      const offset = Number(url.searchParams.get('offset'));
      const entries = transfers.slice(offset, offset + 100).map(row => ({ ...row, amount: mode === 'zero' ? '0' : mode === 'large' && row.id === '1' ? '400000000000000.1234' : row.amount, updatedAt: mode === 'edited' && row.id === '1' ? '2026-06-16T00:00:00Z' : row.updatedAt }));
      return route.fulfill({ json: { data: entries, meta: { total: transfers.length + (mode === 'pagination-error' && offset ? 1 : 0), limit: 100, offset } } });
    }
    return route.fulfill({ json: { data: [] } });
  });
  return { setMode: (next: typeof initial) => { mode = next; }, hold: () => { held = true; }, release: () => { held = false; releases.splice(0).forEach(resolve => resolve()); } };
}
async function ready(page: Page) { await page.goto('/detail/investment'); await expect(page.getByTestId('investment-value')).toHaveText('130,165,000원'); }
test('year and quarter filter share chart/table, include boundaries and keep summary', async ({ page }) => {
  await fixture(page); await ready(page);
  await expect(page.getByTestId('investment-metric-0')).toHaveText('—');
  await expect(page.getByTestId('investment-metric-1')).toHaveText('120,000,000원');
  await expect(page.getByTestId('investment-metric-2')).toHaveText('1,000,000원');
  const summary = await page.getByTestId('investment-current').textContent();
  const periods = page.getByTestId('investment-quarters');
  await expect(periods.getByRole('button', { name: '3분기' })).toBeDisabled();
  await expect(periods.getByRole('button', { name: '4분기' })).toBeDisabled();
  await periods.getByRole('button', { name: '1분기' }).click();
  const q1 = await page.getByTestId('investment-row').evaluateAll(rows => rows.map(row => row.getAttribute('data-date')));
  expect(q1[0]).toBe('2026-03-31'); expect(q1.at(-1)).toBe('2026-01-01');
  await periods.getByRole('button', { name: '2분기' }).click();
  const q2 = await page.getByTestId('investment-row').evaluateAll(rows => rows.map(row => row.getAttribute('data-date')));
  expect(q2[0]).toBe('2026-06-15'); expect(q2.at(-1)).toBe('2026-04-01');
  expect((await page.getByTestId('investment-chart').getAttribute('data-dates'))!.split(',')).toEqual([...q2].reverse());
  expect(await page.getByTestId('investment-current').textContent()).toBe(summary);
});
test('past-year quarters enabled, unavailable quarter resets, year wrap and swipe', async ({ page }) => {
  await fixture(page); await ready(page);
  const periods = page.getByTestId('investment-quarters');
  await page.getByRole('button', { name: '이전 연도' }).click();
  await expect(page.getByTestId('investment-year')).toContainText('2025년');
  await expect(periods.getByRole('button', { name: '4분기' })).toBeEnabled();
  await periods.getByRole('button', { name: '4분기' }).click();
  await expect(page.getByTestId('investment-row').first()).toHaveAttribute('data-date', '2025-12-31');
  await page.getByRole('button', { name: '다음 연도' }).click();
  await expect(periods.getByRole('button', { name: '전체', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '다음 연도' }).click();
  await expect(page.getByTestId('investment-year')).toContainText('2010년');
  await page.getByTestId('investment-year').evaluate(node => {
    const start = new Touch({ identifier: 1, target: node, clientX: 50, clientY: 50 });
    const end = new Touch({ identifier: 1, target: node, clientX: 150, clientY: 55 });
    node.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [start], changedTouches: [start] }));
    node.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [end] }));
  });
  await expect(page.getByTestId('investment-year')).toContainText('2026년');
});
test('requested layout, independent scrolling, row spacing, safe clearance and no clipped values', async ({ page }, info) => {
  await fixture(page); await ready(page);
  const tablet = info.project.name.startsWith('tablet');
  const geometry = await page.evaluate(() => {
    const main = document.querySelector('main')!, left = document.querySelector('[data-scroll-region="investment-left"]')!, right = document.querySelector('[data-scroll-region="investment-right"]')!;
    const nav = [...document.querySelectorAll('.MuiBottomNavigation-root')].find(node => getComputedStyle(node).display !== 'none')!;
    const rows = [...document.querySelectorAll('[data-testid="investment-row"]')];
    return { padding: [getComputedStyle(main).paddingTop, getComputedStyle(main).paddingLeft], header: document.querySelector('header')!.getBoundingClientRect().height, nav: nav.getBoundingClientRect().height,
      outerScroll: main.scrollHeight > main.clientHeight, leftScroll: left.scrollHeight > left.clientHeight, rightScroll: right.scrollHeight > right.clientHeight,
      gap: right.getBoundingClientRect().left - left.getBoundingClientRect().right, row: rows[0].getBoundingClientRect().height, rowGap: rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom,
      clipped: [...document.querySelectorAll('[data-testid="investment-page"] .MuiTypography-root')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent), overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(geometry.padding).toEqual(['0px', '8px']); expect(geometry.header).toBe(44); expect(geometry.nav).toBe(44);
  expect(geometry.row).toBe(20); expect(geometry.rowGap).toBe(8); expect(geometry.clipped).toEqual([]); expect(geometry.overflow).toBe(false);
  expect(geometry.outerScroll).toBe(!tablet); expect(geometry.rightScroll).toBe(tablet);
  if (tablet) { expect(geometry.gap).toBe(8); if (info.project.use.viewport!.height === 396) expect(geometry.leftScroll).toBe(true); }
  const region = tablet ? page.locator('[data-scroll-region="investment-right"]') : page.locator('main');
  await region.evaluate(node => { node.scrollTop = node.scrollHeight; });
  const clearance = await page.getByTestId('investment-history').evaluate((node, tablet) => {
    const region = tablet ? node.closest('[data-scroll-region]')! : document.querySelector('main')!;
    return region.getBoundingClientRect().bottom - node.getBoundingClientRect().bottom;
  }, tablet);
  expect(clearance).toBeGreaterThanOrEqual(79);
  await expect(page.locator('.MuiBottomNavigation-root:visible').getByRole('button', { name: '자산분석', exact: true })).toHaveClass(/Mui-selected/);
  const assets = await page.locator('[data-testid="investment-year"] img, .MuiBottomNavigation-root:visible img').evaluateAll(nodes => nodes.map(node => { const img = node as HTMLImageElement; return { valid: img.complete && img.naturalWidth > 0, width: img.getBoundingClientRect().width }; }));
  expect(assets.every(asset => asset.valid)).toBe(true); expect(assets.slice(0, 2).every(asset => asset.width === 32)).toBe(true);
});
test('account switch cannot display a delayed prior-account response', async ({ page }) => {
  const f = await fixture(page); await ready(page); f.hold();
  await page.getByRole('button', { name: '이전 연도' }).click();
  await page.evaluate(() => { localStorage.setItem('roxstock-selected-account-id', '2'); window.dispatchEvent(new Event('roxstock-selected-account')); });
  await expect(page.getByTestId('investment-history')).toContainText('내용이 없습니다.'); f.release();
  await expect(page.getByTestId('investment-value')).toHaveText('—');
  await expect(page.getByTestId('investment-row')).toHaveCount(0);
  await expect(page.getByTestId('investment-quarters').getByRole('button', { name: '2분기' })).toBeEnabled();
});
test('refresh/failure retains successful baseline and retry recovers', async ({ page }) => {
  const f = await fixture(page); await ready(page); const previous = await page.getByTestId('investment-current').textContent();
  f.hold(); await page.clock.fastForward(300_000);
  await expect(page.getByText('갱신 중…')).toBeVisible(); expect(await page.getByTestId('investment-current').textContent()).toBe(previous);
  f.setMode('error'); f.release();
  await expect(page.getByRole('alert')).toContainText('이전 데이터를 표시합니다.');
  expect(await page.getByTestId('investment-current').textContent()).toBe(previous);
  await expect(page.getByTestId('investment-row')).toHaveCount(166);
  f.setMode('normal'); await page.getByRole('button', { name: '재시도' }).click(); await expect(page.getByRole('alert')).toHaveCount(0);
});
test('empty, missing and failed results remain distinct', async ({ page }) => {
  const f = await fixture(page, 'empty'); await page.goto('/detail/investment');
  await expect(page.getByTestId('investment-history')).toContainText('내용이 없습니다.');
  await expect(page.getByTestId('investment-quarters').getByRole('button', { name: '2분기' })).toBeEnabled();
  f.setMode('missing'); await page.reload(); await expect(page.getByTestId('investment-row')).toHaveCount(166);
  await expect(page.getByTestId('investment-value')).toHaveText('—'); await expect(page.getByTestId('investment-history')).not.toContainText('내용이 없습니다.');
  f.setMode('error'); await page.reload(); await expect(page.getByRole('alert')).toContainText('조회에 실패했습니다.');
  await expect(page.getByTestId('investment-history')).not.toContainText('내용이 없습니다.'); await expect(page.getByTestId('investment-value')).toHaveText('—');
});
test('large amounts, zero denominator, edited historical principal and changing pagination', async ({ page }) => {
  const f = await fixture(page, 'large'); await page.goto('/detail/investment');
  await expect(page.getByTestId('investment-value')).toHaveText('999,999,999,999,999원');
  const clipped = await page.locator('[data-testid="investment-page"] .MuiTypography-root').evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent));
  expect(clipped).toEqual([]);
  f.setMode('zero'); await page.reload(); await expect(page.getByTestId('investment-metric-1')).toHaveText('0원');
  await expect(page.getByTestId('investment-current')).toContainText('투자금 대비 —');
  f.setMode('edited'); await page.reload(); await expect(page.getByTestId('investment-value')).toHaveText('130,165,000원');
  await expect(page.getByTestId('investment-metric-1')).toHaveText('—');
  await expect(page.getByTestId('investment-metric-2')).toHaveText('1,000,000원');
  f.setMode('normal'); await page.reload(); await expect(page.getByTestId('investment-metric-1')).toHaveText('120,000,000원');
  f.setMode('pagination-error'); await page.clock.fastForward(300_000);
  await expect(page.getByRole('alert')).toContainText('이전 데이터를 표시합니다.');
  await expect(page.getByTestId('investment-metric-1')).toHaveText('120,000,000원');
});
