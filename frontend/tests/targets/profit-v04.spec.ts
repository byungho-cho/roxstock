import { expect, test, type Page } from '@playwright/test';
import { amount, calculateProfit, rate, won } from '../../src/pages/investment-profit/profitData';
import type { TradeDto } from '../../src/data/roxstockApi';

const security = (id: number) => ({ id: String(id), symbol: String(id), name: `종목${String(id).padStart(2, '0')}`, marketType: 'KOSPI' as const });
const trades: TradeDto[] = Array.from({ length: 14 }, (_, i) => [
  { id: `b${i}`, type: 'BUY' as const, buyTradeId: `b${i}`, tradedAt: '2024-01-01T00:00:00Z', security: security(i), quantity: '10', unitPrice: '100', amount: '1000', realizedProfitLoss: null, memo: null },
  { id: `s${i}`, type: 'SELL' as const, buyTradeId: `b${i}`, tradedAt: '2026-09-30T15:00:00Z', security: security(i), quantity: '10', unitPrice: '90', amount: i === 0 ? '750' : i === 2 ? '1000' : '900', realizedProfitLoss: i === 0 ? '250' : i === 2 ? '0' : '-100', memo: null },
]).flat();
trades.push({ ...trades[1], id: 'older', tradedAt: '2025-12-31T14:59:59Z', amount: '600', realizedProfitLoss: '100' });
const dividends = Array.from({ length: 111 }, (_, i) => ({ id: `d${i}`, transactionType: 'DIVIDEND' as const, transactionDate: `2026-${String(i % 9 + 1).padStart(2, '0')}-01T00:00:00Z`, amount: '1', signedAmount: '1', balanceAfter: '1', memo: null, dividend: { id: `d${i}`, securityId: '0', securityName: '종목00', grossAmount: '2', netAmount: '1' } }));
type Mode = 'normal' | 'empty' | 'error' | 'missing' | 'large' | 'changing';
async function fixture(page: Page, initial: Mode = 'normal') {
  let mode = initial, hold = false; const releases: (() => void)[] = [], offsets: number[] = [];
  await page.clock.install({ time: new Date('2026-10-05T00:00:00Z') });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = url.pathname;
    if (path === '/api/accounts') return route.fulfill({ json: { data: [{ id: '1', name: '기본', isDefault: true, isActive: true }, { id: '2', name: '빈 계좌', isActive: true }] } });
    if (path.endsWith('/investment-capital')) return route.fulfill({json:{data:[{year:2026,date:'2026-10-01',investmentAmount:'13500',status:'AVAILABLE'},{year:2025,date:'2025-12-31',investmentAmount:'500',status:'AVAILABLE'}]}});
    if (path.endsWith('/trades')) {
      if (hold && path.includes('/1/')) await new Promise<void>(resolve => releases.push(resolve));
      if (mode === 'error') return route.fulfill({ status: 503, json: { error: { message: '조회 실패' } } });
      const records = mode === 'empty' || path.includes('/2/') ? [] : trades.map(row => mode === 'missing' && row.type === 'SELL' ? { ...row, realizedProfitLoss: null } : mode === 'large' && row.type === 'SELL' ? { ...row, amount: '999999999999999.99999999', realizedProfitLoss: '99999999999999.99999999' } : row);
      return route.fulfill({ json: { data: records, summary: {}, daily: [] } });
    }
    if (path.endsWith('/cash-transactions')) {
      expect(url.searchParams.get('types')).toBe('DIVIDEND');
      const offset = Number(url.searchParams.get('offset')); offsets.push(offset);
      const rows = mode === 'empty' || path.includes('/2/') ? [] : dividends;
      return route.fulfill({ json: { data: rows.slice(offset, offset + 100), meta: { total: rows.length + (mode === 'changing' && offset ? 1 : 0), limit: 100, offset } } });
    }
    return route.fulfill({ json: { data: [] } });
  });
  return { offsets, mode: (next: Mode) => { mode = next; }, hold: () => { hold = true; }, release: () => { hold = false; releases.splice(0).forEach(resolve => resolve()); } };
}
async function ready(page: Page) { await page.goto('/detail/investment-profit'); await expect(page.getByTestId('profit-total')).toHaveText('-739원'); }

test('exact realized-cost aggregation, net dividends, KST boundary and weighted returns', ({}, info) => {
  test.skip(info.project.name !== 'cover-370x465', 'Pure calculation needs one execution.');
  const data = calculateProfit(trades, dividends, '2026-10-05');
  expect(data.stocks).toHaveLength(14); expect(won(data.totals.total)).toBe('-739원');
  expect(data.years.reduce((sum, row) => sum + row.totals.total!, 0n)).toBe(data.totals.total);
  expect(data.stocks.reduce((sum, row) => sum + row.totals.total!, 0n)).toBe(data.totals.total);
  expect(data.years.find(row => row.id === '2026')!.events.find(row => row.kind === 'SELL')!.date).toBe('2026-10-01');
  const stock = data.stocks[0]; expect(won(stock.totals.total)).toBe('461원'); expect(rate(stock.totals.total, stock.totals.cost)).toBe('+46.1%');
  expect(stock.events.filter(row => row.kind === 'DIVIDEND')).toHaveLength(111);
  expect(rate(0n, 0n)).toBe('—'); expect(rate(1n, -1n)).toBe('—'); expect(won(amount('999999999999999.99999999'))).toBe('1,000,000,000,000,000원');
  expect(amount('0.00000001')).toBe(1n);
});
test('all stock results include losses and synchronize cumulative/detail sums', async ({ page }, info) => {
  const f = await fixture(page); await ready(page); expect(f.offsets).toContain(100);
  await page.getByRole('button', { name: '종목별', exact: true }).click();
  await expect(page.getByTestId('profit-count')).toHaveText('총 14개'); await expect(page.getByTestId('profit-list-row')).toHaveCount(14);
  const loss = page.getByTestId('profit-list-row').filter({ hasText: '종목01' }); await expect(loss).toContainText('-100원'); await expect(loss).toContainText('-10.0%');
  expect(await loss.getByTestId('profit-list-rate').evaluate(node => getComputedStyle(node).color)).toBe('rgb(96, 165, 250)');
  await page.getByTestId('profit-list-row').filter({ hasText: '종목00' }).click();
  await expect(page.getByTestId('profit-detail-summary')).toContainText('+461원');
  await expect(page.getByTestId('profit-selected')).toHaveText('종목00');
  await page.getByRole('button', { name: /다음 상세/ }).click(); await expect(page.getByTestId('profit-selected')).toHaveText('종목02');
  if (page.viewportSize()!.width >= 600) await expect(page.getByTestId('profit-list-row').filter({hasText:'종목02'})).toHaveAttribute('aria-pressed', 'true');
});
test('year navigation wraps and cover back restores account tab and list position', async ({ page }, info) => {
  await fixture(page); await ready(page); const tablet = page.viewportSize()!.width >= 600;
  if (!tablet) await page.getByTestId('profit-list-row').filter({ hasText: '2026' }).click();
  await page.getByRole('button', { name: /다음 상세/ }).click();
  if (tablet) { await expect(page.getByTestId('profit-detail-empty')).toHaveText('내역이 없습니다.'); await expect(page.getByTestId('profit-navigation')).toHaveCount(0); await page.getByTestId('profit-list-row').filter({ hasText: '2025' }).click(); }
  else { await expect(page.getByTestId('profit-selected')).toHaveText('2010년'); await page.getByRole('button', { name: /이전 상세/ }).click(); await expect(page.getByTestId('profit-selected')).toHaveText('2026년'); await page.getByRole('button', { name: '뒤로가기' }).click(); }
  await page.getByRole('button', { name: '종목별', exact: true }).click();
  const region = tablet ? page.locator('[data-scroll-region="profit-left"]') : page.locator('main');
  await region.evaluate(node => { node.scrollTop = 150; }); const before = await region.evaluate(node => node.scrollTop);
  await page.getByTestId('profit-list-row').filter({ hasText: '종목07' }).click();
  if (!tablet) { await page.goBack(); await expect(page.getByRole('button', { name: '종목별', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect.poll(() => region.evaluate(node => node.scrollTop)).toBe(before); }
  else { await expect(page.getByTestId('profit-selected')).toHaveText('종목07'); expect(await region.evaluate(node => node.scrollTop)).toBe(before); }
});
test('requested geometry percent alignment independent scrolling and safe clearance', async ({ page }, info) => {
  await fixture(page); await ready(page); const tablet = page.viewportSize()!.width >= 600;
  await page.getByRole('button', { name: '종목별', exact: true }).click();
  const geometry = await page.evaluate(() => {
    const main = document.querySelector('main')!, tabs = document.querySelector('[data-testid="profit-tabs"]')!, list = document.querySelector('[data-testid="profit-list"]')!;
    const nav = [...document.querySelectorAll('.MuiBottomNavigation-root')].find(node => getComputedStyle(node).display !== 'none')!;
    const percent = document.querySelector('[data-testid="profit-cumulative-rate"]')!, rowPercent = document.querySelector('[data-testid="profit-total"]')!;
    return { padding: [getComputedStyle(main).paddingTop, getComputedStyle(main).paddingLeft], header: document.querySelector('header')!.getBoundingClientRect().height,
      tabsLeft: tabs.getBoundingClientRect().left, listLeft: list.getBoundingClientRect().left, tabsRight: tabs.getBoundingClientRect().right, listRight: list.getBoundingClientRect().right,
      rateRight: percent.getBoundingClientRect().right, rowRateRight: rowPercent.getBoundingClientRect().right,
      overflow: document.documentElement.scrollWidth > innerWidth, clipped: [...document.querySelectorAll('[data-testid="profit-page"] .MuiTypography-root')].filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent),
      font: Math.min(...[...document.querySelectorAll('[data-testid="profit-page"] .MuiTypography-root')].map(node => parseFloat(getComputedStyle(node).fontSize))), nav: nav.getBoundingClientRect().height };
  });
  expect(geometry.padding).toEqual(['0px', '8px']); expect(geometry.header).toBe(44); expect(geometry.nav).toBe(44); expect(geometry.tabsLeft).toBe(geometry.listLeft); expect(geometry.tabsRight).toBe(geometry.listRight);
  expect(Math.abs(geometry.rateRight - geometry.rowRateRight)).toBeLessThan(1); expect(geometry.overflow).toBe(false); expect(geometry.clipped).toEqual([]); expect(geometry.font).toBeGreaterThanOrEqual(10);
  await page.getByTestId('profit-list-row').filter({ hasText: '종목00' }).click();
  const region = tablet ? page.locator('[data-scroll-region="profit-right"]') : page.locator('main');
  await region.evaluate(node => { node.scrollTop = node.scrollHeight; });
  const gap = await page.getByTestId('profit-compact').last().evaluate((node, tablet) => (tablet ? node.closest('[data-scroll-region]')! : document.querySelector('main')!).getBoundingClientRect().bottom - node.getBoundingClientRect().bottom, tablet);
  expect(gap).toBeGreaterThanOrEqual(79);
  if (tablet) { const scroll = await page.locator('[data-scroll-region="profit-left"]').evaluate(node => node.scrollTop); await region.evaluate(node => { node.scrollTop = 0; }); expect(await page.locator('[data-scroll-region="profit-left"]').evaluate(node => node.scrollTop)).toBe(scroll); }
  await expect(page.locator('.MuiBottomNavigation-root:visible').getByRole('button', { name: '자산분석', exact: true })).toHaveClass(/Mui-selected/);
});
test('stored profit does not poll/focus-refresh; account switch rejects the old response', async ({ page }) => {
 const f=await fixture(page);await ready(page);
 const reads=f.offsets.length;await page.clock.fastForward(600000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 expect(f.offsets.length).toBe(reads);await expect(page.getByTestId('profit-total')).toHaveText('-739원');
 f.hold();await page.reload();
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
 await expect(page.getByTestId('profit-empty')).toHaveText('내용이 없습니다.');f.release();await expect(page.getByTestId('profit-total')).toHaveCount(0);
});
test('empty missing failed and changing-pagination results remain distinct', async ({ page }, info) => {
  const f = await fixture(page, 'empty'); await page.goto('/detail/investment-profit'); await expect(page.getByTestId('profit-empty')).toHaveText('내용이 없습니다.');
  if (page.viewportSize()!.width >= 600) { await expect(page.getByTestId('profit-detail-empty')).toHaveText('내역이 없습니다.'); await expect(page.getByTestId('profit-detail').getByRole('button')).toHaveCount(0); }
  f.mode('missing'); await page.reload(); await expect(page.getByTestId('profit-total')).toHaveText('—'); await expect(page.getByTestId('profit-cumulative-rate')).toHaveText('누적 수익률 —');
  f.mode('error'); await page.reload(); await expect(page.getByRole('alert').first()).toContainText('조회에 실패'); await expect(page.getByTestId('profit-empty')).toHaveCount(0);
  f.mode('changing'); const changedPage=page.waitForResponse(r=>r.url().includes('/cash-transactions')&&new URL(r.url()).searchParams.get('offset')==='100'); await page.getByRole('button', { name: '재시도' }).first().click(); expect((await (await changedPage).json()).meta.total).toBe(112); await expect(page.getByRole('alert').first()).toBeVisible(); await expect(page.getByTestId('profit-total')).toHaveCount(0);
  f.mode('normal'); await page.getByRole('button', { name: '재시도' }).first().click(); await expect(page.getByTestId('profit-total')).toHaveText('-739원');
});
test('long amounts never invade adjacent columns', async ({ page }) => {
  await fixture(page, 'large'); await page.goto('/detail/investment-profit'); await expect(page.getByTestId('profit-total')).not.toHaveText('—');
  const clipped = await page.getByTestId('profit-page').locator('.MuiTypography-root').evaluateAll(nodes => nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.textContent)); expect(clipped).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
