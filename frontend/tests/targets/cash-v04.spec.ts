import { expect, test, type Page } from '@playwright/test';
import { cashRange, cashSegments } from '../../src/pages/cash/cashData';

async function setup(page: Page) {
  await page.clock.setFixedTime(new Date('2026-10-04T03:00:00Z'));
  const reads: URL[] = [], writes: Array<{ path: string; method: string; body: Record<string, string> }> = [];
  let fail = '', empty = false, writeFail = false;
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (request.method() !== 'GET') {
      writes.push({ path, method: request.method(), body: request.postDataJSON() ?? {} });
      return route.fulfill({ status: writeFail ? 500 : 200, json: writeFail ? { error: { message: '저장 실패 · 다시 시도' } } : { data: { id: 'new', cashBalanceAdjusted: false } } });
    }
    reads.push(url);
    if (fail && path.endsWith(fail)) return route.fulfill({ status: 500, json: { error: { message: '조회 실패' } } });
    if (path === '/api/accounts') return route.fulfill({ json: { data: ['a', 'b'].map(id => ({ id, name: `계좌 ${id}`, brokerName: '증권', cashBalance: id === 'a' ? '203200000' : '2000000', isDefault: id === 'a', isActive: true })) } });
    if (path.endsWith('/cash-overview')) return route.fulfill({ json: { data: { account: { id: path.includes('/b/') ? 'b' : 'a', name: '계좌', currentBalance: path.includes('/b/') ? '2000000' : '203200000', updatedAt: '2026-10-04T03:00:00Z' }, monthly: { deposit: '20000000', withdrawal: '2000000', dividend: '100000', netChange: '18100000' }, yearly: { deposit: '240000000', withdrawal: '24000000', dividend: '1200000', netChange: '217200000' }, recentTransactions: [] } } });
    if (path.endsWith('/cash-transactions')) {
      const from = url.searchParams.get('from')!, to = url.searchParams.get('to')!, previous = from < '2026-10-01';
      const types = ['DIVIDEND', 'SELL', 'BUY', 'DEPOSIT', 'WITHDRAWAL'];
      const data = empty ? [] : Array.from({ length: previous ? 126 : 123 }, (_, i) => ({ id: String(1000 - i), transactionType: types[i % 5], transactionDate: `${i < 123 ? to.slice(0, 7) : from.slice(0, 7)}-02T03:00:00Z`, amount: '846000', signedAmount: i % 5 === 2 || i % 5 === 4 ? '-846000' : '846000', balanceAfter: '203200000', memo: '기존 메모', dividend: i % 5 === 0 ? { id: 'd', securityId: '2', securityName: '삼성전자', grossAmount: '1000000', netAmount: '846000' } : null }));
      const offset = Number(url.searchParams.get('offset')), limit = Number(url.searchParams.get('limit'));
      return route.fulfill({ json: { data: data.slice(offset, offset + limit), meta: { total: data.length, offset, limit } } });
    }
    if (path.endsWith('/asset-history')) {
      const from = url.searchParams.get('from')!;
      const data = empty ? [] : [1, 2, 3, 4, 7].map((day, i) => ({ date: `${from.slice(0, 7)}-${String(day).padStart(2, '0')}`, cashBalance: i === 2 ? null : String(200000000 + i * 100000), totalAssetValue: '600000000', stockValue: '400000000', change: null, changeRate: null }));
      return route.fulfill({ json: { data, summary: { profitLoss: null, returnRate: null } } });
    }
    if (path === '/api/securities') return route.fulfill({ json: { data: [{ id: '2', name: '삼성전자', symbol: '005930', marketType: 'KOSPI' }, { id: '3', name: '삼성SDI', symbol: '006400', marketType: 'KOSPI' }], meta: { total: 2 } } });
    return route.fulfill({ status: 404, json: { error: { message: '검사 범위 밖' } } });
  });
  return { reads, writes, fail: (path: string) => { fail = path; }, empty: () => { empty = true; }, writeFail: () => { writeFail = true; }, success: () => { fail = ''; writeFail = false; } };
}
const tablet = (page: Page) => page.viewportSize()!.width >= 600;
const region = (page: Page, side = 'right') => page.locator(`[data-scroll-region="cash-${tablet(page) ? side : 'body'}"]`);
async function ready(page: Page) { await page.goto('/detail/cash'); await expect(page.getByTestId('cash-history-total')).toHaveText('총 123개'); }
async function closeInput(page: Page) { await page.getByRole('button', { name: tablet(page) ? '입력 팝업 뒤로가기' : '뒤로가기', exact: true }).click(); }

test('account and period scope synchronizes history total and stored trend; calendar expansion has no missing rows', async ({ page }) => {
  const state = await setup(page); await ready(page);
  await expect(page.getByTestId('cash-history-row')).toHaveCount(123);
  expect(state.reads.filter(url => url.pathname.endsWith('/cash-transactions')).map(url => url.searchParams.get('offset'))).toEqual(['0', '100']);
  await expect(page.getByTestId('cash-trend-segment')).toHaveCount(3);
  await page.getByRole('button', { name: '이전 1개월 불러오기' }).click();
  await expect(page.getByTestId('cash-history-total')).toHaveText('총 126개');
  const ids = await page.getByTestId('cash-history-row').evaluateAll(els => els.map(el => (el as HTMLElement).dataset.scrollItem)); expect(new Set(ids).size).toBe(126);
  await page.getByRole('button', { name: '이전 기간', exact: true }).click();
  await expect(page.getByRole('button', { name: '기간 직접 선택' })).toHaveText('2026.09');
  await expect.poll(() => state.reads.filter(url => url.pathname.endsWith('/asset-history')).at(-1)?.searchParams.get('from')).toBe('2026-09-01');
  await expect.poll(() => state.reads.filter(url => url.pathname.endsWith('/cash-transactions')).at(-1)?.searchParams.get('to')).toBe('2026-09-30');
  await page.evaluate(() => { localStorage.setItem('roxstock-selected-account-id', 'b'); window.dispatchEvent(new Event('roxstock-selected-account')); });
  await expect(page.getByTestId('cash-balance-value')).toHaveText('2,000,000원');
  await expect.poll(() => state.reads.filter(url => url.pathname.endsWith('/asset-history')).at(-1)?.pathname).toContain('/b/');
  expect(cashRange('month', '2024-02', 2024)).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  expect(cashRange('year', '2026-10', 2026, 1)).toEqual({ from: '2025-12-01', to: '2026-12-31' });
  expect(cashSegments([{ date: '2026-10-01', cashBalance: null }] as never)).toEqual([]);
});

test('card geometry, amount baseline, type colors, independent scrolling, overlay fade and final clearance', async ({ page }, info) => {
  await setup(page); await ready(page);
  const assetRoots = await page.evaluate(async () => Promise.all(['edit', 'calendar', 'search', 'search-clear'].map(async name => new DOMParser().parseFromString(await (await fetch('/cash-v04/' + name + '.svg')).text(), 'image/svg+xml').documentElement.tagName))); expect(assetRoots).toEqual(['svg', 'svg', 'svg', 'svg']);
  await expect.poll(() => page.locator('img[src^="/cash-v04/"]').evaluateAll(els => els.every(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0))).toBe(true);
  if (info.project.name === 'tablet-725x396') console.log('ROX_CASH_IMAGE ' + (await page.screenshot()).toString('base64'));
  expect((await page.getByTestId('cash-balance').boundingBox())!.x).toBe(8);
  expect((await page.getByTestId('cash-balance').boundingBox())!.y).toBe(44);
  expect((await page.getByTestId('cash-balance').boundingBox())!.height).toBe(96);
  expect((await page.getByTestId('cash-trend').boundingBox())!.height).toBeGreaterThanOrEqual(82);
  const heading = (await page.getByTestId('cash-amount-heading').boundingBox())!, amount = (await page.getByTestId('cash-row-amount').first().boundingBox())!;
  expect(heading.x + heading.width).toBeCloseTo(amount.x + amount.width, 1);
  await expect(page.getByTestId('cash-history-row').first()).toHaveCSS('height', '20px');
  await expect(page.getByTestId('cash-history-row').first().locator('p').first()).toHaveCSS('color', 'rgb(248, 113, 113)');
  await expect(page.getByTestId('cash-history-row').nth(2).locator('p').first()).toHaveCSS('color', 'rgb(96, 165, 250)');
  const clipped = await page.getByTestId('cash-page').locator('p').evaluateAll(els => els.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => el.textContent)); expect(clipped).toEqual([]);
  if (tablet(page)) {
    const left = (await page.getByTestId('cash-balance').boundingBox())!, right = (await page.getByTestId('cash-history').boundingBox())!; expect(right.x - left.x - left.width).toBe(8);
    const top = await region(page, 'left').evaluate(el => el.scrollTop); await region(page).evaluate(el => { el.scrollTop = 60; }); expect(await region(page, 'left').evaluate(el => el.scrollTop)).toBe(top);
    await expect(page.locator('.MuiBottomNavigation-root:visible .MuiBottomNavigationAction-root')).toHaveCount(9);
    await expect(page.locator('.MuiBottomNavigation-root:visible .MuiBottomNavigationAction-root.Mui-selected')).toContainText('예수금');
  }
  const body = region(page); await body.evaluate(el => { el.scrollTop = 50; });
  const bar = page.getByRole('scrollbar', { name: tablet(page) ? '예수금 오른쪽 스크롤' : '예수금 본문 스크롤' });
  await expect(bar).toHaveCSS('width', '4px'); await expect(bar).toHaveCSS('opacity', '0', { timeout: 2500 });
  const width = await body.evaluate(el => el.clientWidth); await body.evaluate(el => { el.scrollTop += 1; }); await expect(bar).toHaveCSS('opacity', '1'); expect(await body.evaluate(el => el.clientWidth)).toBe(width);
  for (const scroll of tablet(page) ? [region(page, 'left'), region(page)] : [body]) {
    await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(scroll).toHaveCSS('padding-bottom', '80px');
    const gap = await scroll.evaluate(el => el.getBoundingClientRect().bottom - el.lastElementChild!.getBoundingClientRect().bottom); expect(gap).toBeGreaterThanOrEqual(79);
  }
});

test('cover regular input/tablet popup reuses small forms, first focus and Enter; edit and delete leave balance unchanged', async ({ page }) => {
  const state = await setup(page); await ready(page);
  await page.getByRole('button', { name: '예수금 등록', exact: true }).click();
  await expect(page.getByLabel('거래일자', { exact: true })).toBeFocused();
  expect(await page.locator('[role="dialog"]:visible').count()).toBe(tablet(page) ? 1 : 0);
  expect(await page.getByRole('textbox', { name: '금액', exact: true }).evaluate(el => el.parentElement!.parentElement!.getBoundingClientRect().height)).toBe(36);
  await page.getByLabel('거래일자', { exact: true }).press('Enter'); await expect(page.getByRole('textbox', { name: '금액', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: '금액', exact: true }).fill('1000'); await page.getByRole('textbox', { name: '금액', exact: true }).press('Enter');
  await expect(page.getByRole('textbox', { name: '메모', exact: true })).toBeFocused(); await page.getByRole('textbox', { name: '메모', exact: true }).fill('신규 입금'); await page.getByRole('textbox', { name: '메모', exact: true }).press('Enter');
  await expect(page.getByTestId('cash-form')).not.toBeVisible();
  expect(state.writes[0]).toMatchObject({ path: '/api/cash-transactions', method: 'POST', body: { accountId: 'a', transactionType: 'DEPOSIT', amount: '1000', memo: '신규 입금' } });
  await page.getByRole('button', { name: '입금 내역 수정', exact: true }).first().click();
  await page.getByRole('textbox', { name: '금액', exact: true }).focus();
  const selection = await page.getByRole('textbox', { name: '금액', exact: true }).evaluate(el => { const i = el as HTMLInputElement; return [i.selectionStart, i.selectionEnd, i.value.length]; }); expect(selection[0]).toBe(0); expect(selection[1]).toBe(selection[2]);
  await page.getByRole('textbox', { name: '금액', exact: true }).fill('500'); await page.getByRole('button', { name: '변경', exact: true }).click();
  await expect(page.getByTestId('cash-form')).not.toBeVisible(); expect(state.writes.at(-1)?.method).toBe('PATCH'); await expect(page.getByTestId('cash-balance-value')).toHaveText('203,200,000원');
  await page.getByRole('button', { name: '입금 내역 수정', exact: true }).first().click(); await page.getByRole('button', { name: '삭제', exact: true }).click();
  await page.locator('[role="dialog"]').last().getByRole('button', { name: '삭제', exact: true }).click(); await expect(page.getByTestId('cash-form')).not.toBeVisible(); expect(state.writes.at(-1)?.method).toBe('DELETE'); await expect(page.getByTestId('cash-balance-value')).toHaveText('203,200,000원');
  expect(state.writes.some(write => /buy-trades|sell-trades/.test(write.path))).toBe(false);
});

test('dividend search matches only query text and preserves form draft; gross tax and net use existing payload', async ({ page }) => {
  const state = await setup(page); await ready(page); await page.getByRole('button', { name: '예수금 등록', exact: true }).click();
  await page.getByRole('button', { name: '배당', exact: true }).click(); await page.getByRole('textbox', { name: '메모', exact: true }).fill('배당 메모');
  await page.getByRole('button', { name: '배당 종목 선택' }).click(); await expect(page.getByRole('textbox', { name: '배당 종목 검색', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: '배당 종목 검색', exact: true }).fill('삼성'); await page.getByRole('textbox', { name: '배당 종목 검색', exact: true }).press('Enter');
  await expect(page.getByText('‘삼성’ 검색 결과 2개', { exact: true })).toBeVisible();
  await expect(page.getByTestId('cash-search-result').first()).toHaveCSS('height', '52px');
  await expect(page.getByTestId('cash-search-result').first().locator('span')).toHaveText('삼성');
  await page.getByTestId('cash-search-result').first().click(); await expect(page.getByRole('button', { name: '배당 종목 선택' })).toContainText('삼성전자'); await expect(page.getByRole('textbox', { name: '메모', exact: true })).toHaveValue('배당 메모');
  await page.getByRole('textbox', { name: '세전 배당', exact: true }).fill('1000000'); await page.getByRole('textbox', { name: '세금', exact: true }).fill('154000'); await expect(page.getByRole('textbox', { name: '세후 배당', exact: true })).toHaveValue('846,000');
  await page.getByRole('textbox', { name: '메모', exact: true }).press('Enter'); await expect(page.getByTestId('cash-form')).not.toBeVisible();
  expect(state.writes.at(-1)).toMatchObject({ path: '/api/dividends', method: 'POST', body: { accountId: 'a', securityId: '2', grossAmount: '1000000', netAmount: '846000', memo: '배당 메모' } });
});

test('period and balance popups retain query and scroll; failed reads/writes retry and normal empty stays distinct', async ({ page }) => {
  test.setTimeout(45000);
  const state = await setup(page); await ready(page);
  await region(page).evaluate(el => { el.scrollTop = 40; }); const top = await region(page).evaluate(el => el.scrollTop);
  await page.getByRole('button', { name: '기간 직접 선택' }).click(); await expect(page.getByRole('button', { name: '10월', exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(page.getByRole('button', { name: '11월', exact: true })).toBeDisabled();
  const buttons = await page.locator('[role="dialog"]').getByRole('button').filter({ hasText: /^[1-9]\d?월$/ }).evaluateAll(els => els.map(el => el.getBoundingClientRect().width)); expect(Math.max(...buttons) - Math.min(...buttons)).toBeLessThan(1);
  await page.getByRole('button', { name: '취소', exact: true }).click(); expect(await region(page).evaluate(el => el.scrollTop)).toBe(top);
  await region(page, 'left').evaluate(el => { el.scrollTop = 0; }); await page.getByRole('button', { name: '현재 예수금 편집' }).click(); await expect(page.getByRole('textbox', { name: '현재 예수금', exact: true })).toBeFocused();
  state.writeFail(); await page.getByRole('textbox', { name: '현재 예수금', exact: true }).fill('2000'); await page.getByRole('textbox', { name: '현재 예수금', exact: true }).press('Enter'); await expect(page.getByText('저장 실패 · 다시 시도', { exact: true })).toBeVisible();
  state.success(); await page.getByRole('textbox', { name: '현재 예수금', exact: true }).press('Enter'); await expect(page.getByRole('textbox', { name: '현재 예수금', exact: true })).not.toBeVisible(); expect(state.writes.at(-1)?.body).toMatchObject({ amount: '2000' });
  state.fail('/asset-history'); await page.getByRole('button', { name: '이전 기간', exact: true }).click(); await expect(page.getByText('추이 조회 실패 · 다시 시도', { exact: true })).toBeVisible({ timeout: 15000 });
  state.success(); state.empty(); await page.getByText('추이 조회 실패 · 다시 시도', { exact: true }).click(); await expect(page.getByTestId('cash-trend')).toContainText('내용이 없습니다.');
  await page.getByRole('button', { name: '이전 기간', exact: true }).click(); await expect(page.getByTestId('cash-history-total')).toHaveText('총 0개'); await expect(page.getByTestId('cash-history')).toContainText('내용이 없습니다.');
  if (!tablet(page)) { await page.getByRole('button', { name: '예수금 등록', exact: true }).click(); await page.goBack(); await expect(page.getByTestId('cash-history')).toBeVisible(); await expect(page.getByRole('button', { name: '기간 직접 선택' })).toHaveText('2026.08'); }
});
