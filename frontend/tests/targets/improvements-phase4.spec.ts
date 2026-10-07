import { test, expect, type Page, type Locator } from '@playwright/test';
import { fixture } from './phase3-fixture';

async function gesture(target: Locator, dx = 0, dy = 160) {
  await target.evaluate((el, {dx,dy}) => {
    const point = (x:number,y:number) => new Touch({identifier:1,target:el,clientX:x,clientY:y});
    for (const [type,x,y] of [['touchstart',180,100],['touchmove',180+dx,100+dy],['touchend',180+dx,100+dy]] as const)
      el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[point(x,y)],changedTouches:[point(x,y)]}));
  }, {dx,dy});
}
async function selectLast(page:Page, chart:Locator) {
  await chart.scrollIntoViewIfNeeded(); const r=(await chart.locator('svg').boundingBox())!;
  await page.mouse.move(r.x+r.width*.999,r.y+r.height*.5);
  const tooltip=chart.getByTestId('asset-trend-tooltip'); await expect(tooltip).toBeVisible();
  const t=(await tooltip.boundingBox())!;expect(t.x).toBeGreaterThanOrEqual(0);expect(t.x+t.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(chart.getByTestId('asset-trend-guide')).toHaveCount(1);
}

test('equal navigation columns, long name ellipsis, search variants and normal formulas',async({page},info)=>{
  const names=['한국타이어앤테크놀로지아주긴이름','삼성전자','현대차','아주긴이름다음종목한국타이어앤테크놀로지','SK하이닉스','깨끗한나라'];
  await fixture(page,{names});await page.goto('/stocks?tab=holding&selected=3');
  const search=page.getByRole('textbox',{name:'목록 종목 검색'}), list=page.locator('[data-testid="stock-list"] [data-scroll-item]:not([data-scroll-region="stock-right"] [data-scroll-item])');
  for(const query of ['ㅎㄷㅊ','ㅎㄷ','현대','000003']){await search.fill(query);await expect(list).toHaveCount(1);await expect(list).toContainText('현대차');}
  await search.fill('ㅅㅅㅈㅈ');await expect(list).toHaveCount(1);await expect(list).toContainText('삼성전자');
  await page.getByRole('button',{name:'검색어 지우기'}).click();await expect(list).toHaveCount(6);await expect(search).toHaveValue('');await expect(page.getByRole('combobox',{name:'정렬 기준'})).toContainText('평가금액');
  const formula=page.getByTestId('stock-quantity-formula').first();await expect(formula).toHaveCSS('font-weight','400');
  expect(await formula.locator('..').evaluate(e=>getComputedStyle(e).fontWeight)).toBe('600');
  if(info.project.name==='cover'){
    await page.goto('/stocks/3');const nav=page.getByTestId('stock-navigation');await expect(nav).toBeVisible();
    const boxes=await nav.locator(':scope > *').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,width:r.width};}));
    expect(boxes[0].width).toBeCloseTo(boxes[1].width,1);expect(boxes[2].width).toBeCloseTo(boxes[1].width,1);
    expect(boxes[1].x+boxes[1].width/2).toBeCloseTo(page.viewportSize()!.width/2,1);
    await expect(nav.getByRole('button').last()).toHaveCSS('text-overflow','ellipsis');
    expect(await nav.getByRole('button').last().evaluate(e=>e.scrollWidth>e.clientWidth)).toBe(true);await page.screenshot({path:info.outputPath('stock-navigation.png')});
    await nav.getByRole('button').last().click();await expect(page).toHaveURL(/stocks\/4/);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('stocks.png')});
});

test('displayed recent count grows once; holdings hint typography matches count',async({page},info)=>{
  await fixture(page);await page.goto('/');const recent=page.getByTestId('recent-buys-card');
  await expect(recent).toContainText('총 5건');await recent.getByRole('button',{name:'더보기'}).dblclick();await expect(recent.getByTestId('recent-buy-lot')).toHaveCount(9);await expect(recent).toContainText('총 9건');
  const hint=page.getByTestId('home-title-hint');await expect(hint).toHaveCSS('font-weight','400');await expect(hint).toHaveCSS('font-size','11px');
  const card=page.getByTestId('home-holdings-card');const count=card.getByText('6종목');
  expect(await hint.evaluate(e=>getComputedStyle(e).color)).toBe(await count.evaluate(e=>getComputedStyle(e).color));
  await page.screenshot({path:info.outputPath('home.png')});await card.getByRole('button',{name:'보유종목 (상세보기)'}).click();await expect(page).toHaveURL(/stocks\?tab=holding/);
});

test('closed-day whole row is gray; weekday zero remains neutral',async({page},info)=>{
  await fixture(page,{history:[['2026-10-02','100000'],['2026-10-03','100000'],['2026-10-04','100000'],['2026-10-05','100000'],['2026-10-06','100000'],['2026-10-07','100100']]});
  await page.goto('/detail/investment');const weekday=page.locator('[data-date="2026-10-06"]');await expect(weekday).toContainText('0원');await expect(weekday).toHaveAttribute('data-market-closed','false');
  const weekdayColor=await weekday.locator('.MuiTypography-root').last().evaluate(e=>getComputedStyle(e).color);
  for(const date of ['2026-10-03','2026-10-04','2026-10-05']){
    const row=page.locator(`[data-date="${date}"]`);await expect(row).toHaveAttribute('data-market-closed','true');
    const colors=await row.locator('.MuiTypography-root').evaluateAll(nodes=>nodes.map(e=>getComputedStyle(e).color));expect(new Set(colors).size).toBe(1);expect(colors[0]).not.toBe(weekdayColor);
  }
  await weekday.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('investment-closed-days.png')});
});

test('analysis shares chart, yellow dates and left ticks; both back paths restore period/account/scroll',async({page},info)=>{
  await fixture(page);await page.goto('/assets');await page.getByRole('button',{name:'전체',exact:true}).click();
  const chart=page.getByTestId('asset-trend-chart');await selectLast(page,chart);await expect(chart.getByTestId('asset-trend-tooltip')).toContainText('165,000원');
  await expect(chart.getByTestId('asset-trend-date')).toHaveText(['2024','2025','2026']);
  expect(await chart.getByTestId('asset-trend-date').first().evaluate(e=>getComputedStyle(e).color)).toBe(await page.getByTestId('analysis-performance-period').evaluate(e=>getComputedStyle(e).color));
  const svg=(await chart.locator('svg').boundingBox())!,tick=(await chart.getByTestId('asset-trend-chart-amount').first().boundingBox())!;
  const tip=(await chart.getByTestId('asset-trend-tooltip').boundingBox())!;expect(tip.x).toBeGreaterThan(tick.x+tick.width);
  expect(svg.height).toBe(200);expect(tick.x-svg.x).toBeLessThan(4);await expect(chart.getByTestId('asset-trend-line')).toHaveCount(1);
  await page.screenshot({path:info.outputPath('analysis.png')});
  const region=info.project.name==='cover'?page.locator('main'):page.locator('[data-scroll-region="analysis-left"]');
  await page.getByRole('button',{name:'자산추이 상세보기'}).scrollIntoViewIfNeeded();const saved=await region.evaluate(e=>e.scrollTop);
  await page.getByRole('button',{name:'자산추이 상세보기'}).click();await expect(page).toHaveURL(/chart=detail/);
  let dialog=page.getByRole('dialog');await expect(dialog).toContainText('기본 · 전체');await selectLast(page,dialog.getByTestId('asset-trend-chart'));const expandedTick=(await dialog.getByTestId('asset-trend-chart-amount').first().boundingBox())!,expandedTip=(await dialog.getByTestId('asset-trend-tooltip').boundingBox())!;expect(expandedTip.x).toBeGreaterThan(expandedTick.x+expandedTick.width);await page.screenshot({path:info.outputPath('analysis-detail.png')});
  await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'전체',exact:true})).toHaveAttribute('aria-pressed','true');await expect.poll(()=>region.evaluate(e=>e.scrollTop)).toBe(saved);
  await page.getByRole('button',{name:'자산추이 상세보기'}).click();await page.getByRole('button',{name:'자산 차트 상세 뒤로가기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect.poll(()=>region.evaluate(e=>e.scrollTop)).toBe(saved);
  await page.getByRole('button',{name:'1개월',exact:true}).click();await expect(chart.getByTestId('asset-trend-date').first()).toHaveText('09/07');
  await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
  await page.getByRole('button',{name:'자산추이 상세보기'}).click();await expect(page.getByRole('dialog')).toContainText('다른 · 1년');
});

test('missing snapshot is selectable as unavailable and breaks the line',async({page})=>{
  await fixture(page,{history:[['2026-09-07','100000'],['2026-09-20',null],['2026-10-07','120000']]});await page.goto('/assets');
  const chart=page.getByTestId('asset-trend-chart'),svg=chart.locator('svg');await chart.scrollIntoViewIfNeeded();const r=(await svg.boundingBox())!;
  await page.mouse.move(r.x+r.width*(4+13/30*252)/260,r.y+50);
  await expect(chart.getByTestId('asset-trend-tooltip')).toContainText('2026-09-20');await expect(chart.getByTestId('asset-trend-tooltip')).toContainText('—');await expect(chart.getByTestId('asset-trend-selection')).toHaveCount(0);
  const path=await chart.getByTestId('asset-trend-line').getAttribute('d');expect(path!.match(/M/g)).toHaveLength(2);expect(path).not.toContain('L');
});

test('top-only pull: one refresh, cached contents, failure cleanup, retry and horizontal/chart exclusion',async({page},info)=>{
  const f=await fixture(page);const reads:string[]=[];page.on('request',request=>{if(request.url().includes('/api/'))reads.push(new URL(request.url()).pathname);});
  await page.goto('/');await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);
  const main=page.locator('main'),dash=()=>reads.filter(p=>p.endsWith('/dashboard')).length;
  const before=dash();const scrollRegion=main;await scrollRegion.evaluate(e=>{if(e.scrollHeight===e.clientHeight)e.style.maxHeight='200px';e.scrollTop=40;});expect(await scrollRegion.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);await gesture(scrollRegion);expect(dash()).toBe(before);await scrollRegion.evaluate(e=>{e.scrollTop=0;e.style.maxHeight='';});
  await gesture(main,130,5);expect(dash()).toBe(before);await gesture(page.getByTestId('asset-trend-chart'));expect(dash()).toBe(before);
  f.hold();await gesture(main);await expect.poll(dash).toBe(before+1);await expect(page.getByTestId('main-loading-bar')).toHaveCount(1);await gesture(main);expect(dash()).toBe(before+1);await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);
  f.release();await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);
  f.fail();await gesture(main);await expect(page.getByText('새로고침에 실패했습니다. 기존 데이터를 표시합니다.')).toBeVisible({timeout:20000});await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);
  f.success();await gesture(main);await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);await expect(page.getByText('새로고침에 실패했습니다. 기존 데이터를 표시합니다.')).toHaveCount(0);
  expect(await main.evaluate(e=>getComputedStyle(e).overscrollBehaviorY)).toBe('contain');await page.screenshot({path:info.outputPath('refresh-complete.png')});
});

test('mobile Chromium trusted touch triggers one refresh and preserves fixed 44px chrome',async({page},info)=>{
  test.skip(info.project.name==='large','Touch behavior is checked in mobile browser projects.');
  const f=await fixture(page);let reads=0;page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/dashboard'))reads++;});
  await page.goto('/');await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);const before=reads;
  const cdp=await page.context().newCDPSession(page);f.hold();
  const pull=async()=>{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:70}]});
    for(const y of [90,120,150,190,220])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  await pull();await expect.poll(()=>reads).toBe(before+1);await expect(page.getByTestId('main-loading-bar')).toHaveCount(1);
  await pull();expect(reads).toBe(before+1);f.release();await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);await expect(page).toHaveURL(/\/$/);
  expect((await page.locator('.MuiToolbar-root').first().boundingBox())!.height).toBe(44);
  expect((await page.locator('.MuiBottomNavigation-root:visible').boundingBox())!.height).toBe(44);
  await page.screenshot({path:info.outputPath('mobile-refresh.png')});
});
