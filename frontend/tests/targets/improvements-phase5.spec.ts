import { test, expect, type Page, type Locator } from '@playwright/test';
import { fixture } from './phase3-fixture';
async function selectLast(page:Page,chart:Locator){await chart.scrollIntoViewIfNeeded();const r=(await chart.locator('svg').boundingBox())!;await page.mouse.move(r.x+r.width*.999,r.y+r.height*.5);await expect(chart.getByTestId('asset-trend-tooltip')).toBeVisible();}
test('analysis shares chart, neutral dates and bottom controls and left ticks; both back paths restore period/account/scroll',async({page},info)=>{
  await fixture(page);await page.goto('/assets');await page.getByRole('button',{name:'전체',exact:true}).click();
  const chart=page.getByTestId('asset-trend-chart');await selectLast(page,chart);await expect(chart.getByTestId('asset-trend-tooltip')).toContainText('165,000원');
  await expect(chart.getByTestId('asset-trend-date')).toHaveText(['2024','2025','2026']);
  expect(await chart.getByTestId('asset-trend-date').first().evaluate(e=>getComputedStyle(e).color)).toBe(await chart.getByTestId('asset-trend-chart-amount').first().evaluate(e=>getComputedStyle(e).color));
  const controls=page.getByRole('button',{name:'1개월',exact:true});
  expect((await controls.boundingBox())!.y).toBeGreaterThan((await chart.getByTestId('asset-trend-date').first().boundingBox())!.y);
  await expect(page.getByTestId('analysis-trend-title')).toContainText('자산추이(상세보기)');
  const svg=(await chart.locator('svg').boundingBox())!,tick=(await chart.getByTestId('asset-trend-chart-amount').first().boundingBox())!;
  const tip=(await chart.getByTestId('asset-trend-tooltip').boundingBox())!;expect(tip.x).toBeGreaterThan(tick.x+tick.width);
  expect(svg.height).toBe(200);expect(tick.x-svg.x).toBeLessThan(4);await expect(chart.getByTestId('asset-trend-line')).toHaveCount(1);
  await page.getByTestId('analysis-trend').evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:info.outputPath('analysis.png')});
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


test('home header navigates to analysis without changing account; chart does not navigate',async({page})=>{
  await fixture(page);await page.goto('/');const card=page.getByTestId('home-trend-card');
  await expect(card).toContainText('자산추이 (상세보기)');
  await selectLast(page,card.getByTestId('asset-trend-chart'));await expect(page).toHaveURL(/\/$/);
  await card.getByRole('button',{name:'자산추이 (상세보기)'}).click();await expect(page).toHaveURL(/\/assets$/);
  await page.getByRole('button',{name:'자산추이 상세보기'}).click();await expect(page.getByRole('dialog')).toContainText('기본 · 1년');
});

test('pull indicator descends, cancels, spins once and cleans up success/failure',async({page},info)=>{
  const f=await fixture(page);let reads=0;page.on('request',r=>{if(new URL(r.url()).pathname.endsWith('/dashboard'))reads++;});
  await page.goto('/');await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);const before=reads,main=page.locator('main'),icon=page.getByTestId('pull-refresh-indicator');
  const touch=async(type:string,dy=0)=>main.evaluate((el,{type,dy})=>{const t=new Touch({identifier:1,target:el,clientX:180,clientY:70+dy});el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t],changedTouches:[t]}));},{type,dy});
  await touch('touchstart');await touch('touchmove',60);await expect(icon).toHaveCSS('opacity','1');await expect(icon).toHaveAttribute('data-refreshing','false');await page.screenshot({path:info.outputPath('pulling.png')});
  await touch('touchend');await expect(icon).toHaveCSS('opacity','0');expect(reads).toBe(before);
  f.hold();await touch('touchstart');await touch('touchmove',160);await touch('touchend');await expect.poll(()=>reads).toBe(before+1);await expect(icon).toHaveAttribute('data-refreshing','true');await expect(icon.locator('svg')).toHaveCSS('animation-name','rox-refresh-spin');
  const r=(await icon.boundingBox())!;expect(r.y).toBeGreaterThanOrEqual(44);await page.screenshot({path:info.outputPath('refreshing.png')});
  await touch('touchstart');await touch('touchmove',160);await touch('touchend');expect(reads).toBe(before+1);f.release();await expect(icon).toHaveCSS('opacity','0');await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);
  f.fail();await touch('touchstart');await touch('touchmove',160);await touch('touchend');await expect(page.getByText('새로고침에 실패했습니다. 기존 데이터를 표시합니다.')).toBeVisible({timeout:20000});await expect(icon).toHaveCSS('opacity','0');await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);
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
  await pull();await expect.poll(()=>reads).toBe(before+1);await expect(page.getByTestId('main-loading-bar')).toHaveCount(1);await expect(page.getByTestId('pull-refresh-indicator')).toHaveAttribute('data-refreshing','true');
  await pull();expect(reads).toBe(before+1);f.release();await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);await expect(page).toHaveURL(/\/$/);
  expect((await page.locator('.MuiToolbar-root').first().boundingBox())!.height).toBe(44);
  expect((await page.locator('.MuiBottomNavigation-root:visible').boundingBox())!.height).toBe(44);
  await page.screenshot({path:info.outputPath('mobile-refresh.png')});
});

test('stocks and journal show the shared icon without shifting content',async({page})=>{
  await fixture(page);
  for(const path of ['/stocks','/journal']){
    await page.goto(path);await expect(page.locator('main')).toBeVisible();await expect(page.getByRole('heading',{level:1})).toBeVisible();
    const main=page.locator('main'),box=(await main.boundingBox())!;
    await main.evaluate(el=>{for(const [type,y] of [['touchstart',80],['touchmove',140]] as const){const t=new Touch({identifier:1,target:el,clientX:180,clientY:y});el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:[t],changedTouches:[t]}));}});
    await expect(page.getByTestId('pull-refresh-indicator')).toHaveCSS('opacity','1');expect((await main.boundingBox())!.y).toBe(box.y);
    await main.evaluate(el=>el.dispatchEvent(new TouchEvent('touchcancel',{bubbles:true,touches:[]})));await expect(page.getByTestId('pull-refresh-indicator')).toHaveCSS('opacity','0');
  }
});
