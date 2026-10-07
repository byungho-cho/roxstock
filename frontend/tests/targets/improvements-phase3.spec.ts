import { test, expect, type Page } from '@playwright/test';

import { fixture } from './phase3-fixture';

async function noOverflow(page:Page) { expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); }
async function selectChart(page:Page,chart=page.getByTestId('asset-trend-chart').first()) {
  await chart.scrollIntoViewIfNeeded();const svg=chart.locator('svg'),r=(await svg.boundingBox())!;
  await page.mouse.move(r.x+r.width*.1,r.y+r.height*.5);await page.mouse.down();await page.mouse.move(r.x+r.width*.98,r.y+r.height*.5);await page.mouse.up();
  const tooltip=chart.getByTestId('asset-trend-tooltip');await expect(tooltip).toBeVisible();
  const t=(await tooltip.boundingBox())!;expect(t.x).toBeGreaterThanOrEqual(0);expect(t.x+t.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test('stock card labels, grouped amount/rate ordering and query-only clear',async({page},info)=>{
  await fixture(page);await page.goto('/stocks?tab=holding');
  const search=page.getByRole('textbox',{name:'목록 종목 검색'});await expect(search).toBeVisible();
  await page.getByRole('combobox',{name:'정렬 기준'}).click();await page.getByRole('option',{name:'손익률',exact:true}).click();
  const names=()=>page.locator('[data-testid="stock-list"] [data-scroll-item]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-scroll-item')));
  // Card and table representations share the same ordering, including missing last.
  const list=page.locator('[data-testid="stock-list"] [data-scroll-item]');
  await expect.poll(()=>list.allTextContents()).toHaveLength(6);
  const texts=await list.allTextContents();expect(texts.map(t=>t.match(/종목\d/)?.[0])).toEqual(['종목1','종목2','종목3','종목4','종목5','종목6']);
  await page.getByRole('button',{name:'내림차순 · 오름차순으로 변경'}).click();
  expect((await list.allTextContents()).map(t=>t.match(/종목\d/)?.[0])).toEqual(['종목2','종목1','종목3','종목5','종목4','종목6']);
  await search.fill('종목1');await expect(list).toHaveCount(1);await page.getByRole('button',{name:'검색어 지우기'}).click();await expect(search).toHaveValue('');await expect(list).toHaveCount(6);await expect(page.getByRole('button',{name:'검색어 지우기'})).toHaveCount(0);
  await expect(page.getByRole('combobox',{name:'정렬 기준'})).toContainText('손익률');
  if(info.project.name==='cover'){await expect(list.first()).toContainText('손익');expect(await list.first().getByText(/손익　/).evaluate(e=>getComputedStyle(e).fontWeight)).toBe('600');}
  await noOverflow(page);await page.screenshot({path:info.outputPath('stocks.png')});
});

test('home month count, local month expansion, holdings navigation and asset chart',async({page},info)=>{
  await fixture(page);await page.goto('/');const recent=page.getByTestId('recent-buys-card');
  await expect(recent).toContainText('총 5건');await expect(recent.getByTestId('recent-buy-lot')).toHaveCount(5);
  await recent.getByRole('button',{name:'더보기'}).dblclick();await expect(recent.getByTestId('recent-buy-lot')).toHaveCount(9);await expect(page).toHaveURL(/\/$/);await expect(recent).toContainText('총 9건');
  await page.waitForTimeout(210);await recent.getByRole('button',{name:'더보기'}).click();await expect(recent.getByTestId('recent-buy-lot')).toHaveCount(10);
  await page.waitForTimeout(210);await recent.getByRole('button',{name:'더보기'}).click();await expect(recent.getByTestId('recent-buy-lot')).toHaveCount(11);await expect(recent.getByRole('button',{name:'더보기'})).toHaveCount(0);
  await expect(recent.getByText(/시세·거래 데이터 판정 불가/)).toHaveCount(0);
  await selectChart(page);await expect(page.getByTestId('asset-trend-tooltip')).toContainText('165,000원');
  expect(await page.getByTestId('asset-trend-chart').locator('svg').evaluate(e=>e.getBoundingClientRect().height)).toBe(info.project.name==='cover'?64:148);
  await page.screenshot({path:info.outputPath('home-chart.png')});
  const title=page.getByRole('button',{name:'보유종목 (상세보기)'});await title.click();await expect(page).toHaveURL(/stocks\?tab=holding/);await page.goBack();await expect(page).toHaveURL(/\/$/);
  await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});await expect(page.getByTestId('recent-buy-lot')).toHaveCount(0);await expect(recent).toContainText('총 0건');
  await noOverflow(page);
});

test('analysis order, full-year dates and month dates; chart exposes detail link',async({page},info)=>{
  await fixture(page);await page.goto('/assets');await expect(page.getByTestId('analysis-performance')).toBeVisible();
  const expected=['기간 시작자산','기간 종료자산','기간 투자손익','투자수익률','총입금','총출금','순입출금','평가손익','실현손익','배당수익','수수료·세금'];
  await expect.poll(()=>page.locator('[data-testid^="analysis-metric-"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-testid')?.replace('analysis-metric-','')))).toEqual(expected);
  expect(await page.getByTestId('analysis-performance-period').evaluate(e=>getComputedStyle(e).fontWeight)).toBe('700');
  await expect(page.getByTestId('analysis-trend').getByText('상세보기 ›')).toHaveCount(1);
  await page.getByRole('button',{name:'전체',exact:true}).click();await expect(page.getByTestId('asset-trend-date')).toHaveText(['2024','2025','2026']);await selectChart(page);
  expect(await page.getByTestId('asset-trend-chart').locator('svg').evaluate(e=>e.getBoundingClientRect().height)).toBe(200);
  await page.screenshot({path:info.outputPath('analysis-all.png')});
  await page.getByRole('button',{name:'1개월',exact:true}).click();await expect(page.getByTestId('asset-trend-date').first()).toHaveText('09/07');await selectChart(page);
  await noOverflow(page);await page.screenshot({path:info.outputPath('analysis-month.png')});
});

test('asset chart touch drag stays on screen and vertical touch scroll remains native',async({page},info)=>{
  await fixture(page);await page.goto('/assets');
  const chart=page.getByTestId('asset-trend-chart');await chart.scrollIntoViewIfNeeded();
  const svg=chart.locator('svg');expect(await svg.evaluate(e=>getComputedStyle(e).touchAction)).toBe('pan-y');
  const cdp=await page.context().newCDPSession(page),r=(await svg.boundingBox())!;
  const x=r.x+r.width*.7,y=Math.min(r.y+80,page.viewportSize()!.height-70);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-70,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(chart.getByTestId('asset-trend-tooltip')).toBeVisible();await expect(chart.getByTestId('asset-trend-guide')).toHaveCount(1);await expect(chart.getByTestId('asset-trend-guide')).toHaveAttribute('d',/ V154$/);await expect(chart.getByTestId('asset-trend-selection')).toBeVisible();await expect(page).toHaveURL(/\/assets$/);
  const region=info.project.name==='cover'?page.locator('main'):page.locator('[data-scroll-region="analysis-left"]');
  if(info.project.name!=='large'){
    const before=await region.evaluate(e=>e.scrollTop);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-60}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>region.evaluate(e=>e.scrollTop)).toBeGreaterThan(before);
  }
  await noOverflow(page);await page.screenshot({path:info.outputPath('asset-touch.png')});
});

test('current-year remaining lot profit, historical year, browser/detail return and native scroll',async({page},info)=>{
  const f=await fixture(page);await page.goto('/assets');await page.getByTestId('analysis-total').click();
  await expect(page.getByTestId('investment-trading-profit')).toHaveText('+1,300원');await expect(page.getByTestId('investment-current')).toContainText('올해 평가손익 +1.3%');
  await page.getByTestId('investment-quarters').getByRole('button',{name:'2분기'}).click();
  const chart=page.getByTestId('investment-chart');await chart.scrollIntoViewIfNeeded();await expect(chart.getByTestId('investment-legend')).toBeVisible();
  await page.screenshot({path:info.outputPath('investment-summary.png')});
  const saved=await page.locator('main').evaluate(e=>e.scrollTop);
  await page.getByRole('button',{name:'상세보기 ›',exact:true}).click();await expect(page).toHaveURL(/chart=detail/);await expect(page.getByRole('dialog')).toBeVisible();await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(/detail\/investment/);
  await expect(page.getByTestId('investment-quarters').getByRole('button',{name:'2분기'})).toHaveAttribute('aria-pressed','true');expect(await page.locator('main').evaluate(e=>e.scrollTop)).toBe(saved);
  await page.getByRole('button',{name:'상세보기 ›',exact:true}).click();await page.getByRole('button',{name:'차트 상세 뒤로가기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'이전 연도',exact:true}).click();await expect(page.getByTestId('investment-current')).toContainText('2025년 누적 매매손익');await expect(page.getByTestId('investment-trading-profit')).toHaveText('+200원');
  f.missing();await page.getByRole('button',{name:'다음 연도',exact:true}).click();
  // Invalidate the cached current-year response by a full reload.
  await page.reload();await expect(page.getByTestId('investment-trading-profit')).toHaveText('—');await expect(page.getByTestId('investment-profit-basis')).toContainText('시세 미수집');
  await noOverflow(page);await page.screenshot({path:info.outputPath('investment.png')});
});

test('one top loading bar spans concurrent foreground queries, failure and navigation; refresh remains quiet',async({page},info)=>{
  const f=await fixture(page);f.hold();await page.goto('/assets');await expect(page.getByTestId('main-loading-bar')).toHaveCount(1);expect((await page.getByTestId('main-loading-bar').boundingBox())!.height).toBe(3);
  f.release();await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);
  f.hold();await page.getByRole('button',{name:'전체',exact:true}).click();await expect(page.getByTestId('main-loading-bar')).toHaveCount(1);f.fail();f.release();await expect(page.getByRole('button',{name:'다시 시도',exact:true})).toBeVisible();await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);
  f.success();await page.getByRole('button',{name:'다시 시도',exact:true}).click();await expect(page.getByTestId('asset-trend-chart')).toBeVisible();
  await page.goto('/');await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);
  await page.clock.install({time:new Date('2026-10-07T03:00:00Z')});f.hold();await page.clock.fastForward(60_000);await page.waitForTimeout(200);await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);
  // A request from an unmounted screen must not keep the next screen's bar active.
  await page.locator('.MuiBottomNavigation-root').getByRole('button',{name:'종목목록',exact:true}).click();await expect(page).toHaveURL(/stocks/);
  f.release();await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);
  expect(await page.locator('main').evaluate(e=>getComputedStyle(e).overscrollBehaviorY)).toBe('contain');
  await noOverflow(page);await page.screenshot({path:info.outputPath('loading-complete.png')});
});
