import { expect, test, type Page } from '@playwright/test';
const stamp = '2026-10-01T03:10:00Z';
const holdings = [
  {securityId:'1',name:'현대자동차',quantity:'700',averagePurchasePrice:'448344',purchaseAmount:'313840800',currentPrice:'519000',marketValue:'363300000',unrealizedProfitLoss:'49459200',unrealizedReturnRate:'15.8'},
  {securityId:'2',name:'기아',quantity:'250',averagePurchasePrice:'531000',purchaseAmount:'132750000',currentPrice:'514000',marketValue:'128500000',unrealizedProfitLoss:'-4250000',unrealizedReturnRate:'-3.2'},
  {securityId:'3',name:'삼성전자',quantity:'1000',averagePurchasePrice:'96400',purchaseAmount:'96400000',currentPrice:'96400',marketValue:'96400000',unrealizedProfitLoss:'0',unrealizedReturnRate:'0'},
];
export async function homeFixture(page: Page, targetCount = 0) {
  let second = false; let fail = false; let unavailable = false; let hold = false;
  let release: (() => void) | undefined;
  await page.clock.install({ time: new Date('2026-10-01T03:10:00Z') });
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname; second = path.includes('/2/');
    if (path === '/api/accounts') return route.fulfill({json:{data:[{id:'1',name:'기본',brokerName:'CI',isActive:true,isDefault:true,cashBalance:'203200000'},{id:'2',name:'다른 계좌',brokerName:'CI',isActive:true,cashBalance:'0'}]}});
    if (fail && /target-arrivals|buy-lots/.test(path)) return route.fulfill({status:503,json:{error:{message:'조회 오류'}}});
    if (hold && path.endsWith('/target-arrivals')) await new Promise<void>(resolve => {release = resolve;});
    if(path.endsWith('/dashboard')) return route.fulfill({json:{data:{account:{id:second?'2':'1'},cashBalance:'203200000',purchaseAmount:'542990800',stockValue:'651000000',totalAssetValue:'854200000',unrealizedProfitLoss:'49459200',unrealizedReturnRate:'15.8',dailyProfit:'12840000',dailyProfitRate:'1.5',stockMonthlyProfit:'20000000',cashMonthlyProfit:'20000000',pricingComplete:true,latestPriceUpdatedAt:stamp,holdings:second?[]:holdings.map(h=>({...h,symbol:'005380',marketType:'KOSPI',priceUpdatedAt:stamp,priceChangeRate:'0'}))}}});
    if(path.endsWith('/asset-history')) return route.fulfill({json:{data:Array.from({length:31},(_,i)=>({date:`2026-09-${String(i+1).padStart(2,'0')}`,totalAssetValue:String(800000000+i*1800000+Math.sin(i)*2500000)})),summary:{}}});
    if(path.endsWith('/target-arrivals')) return route.fulfill({json:{data:second?[]:Array.from({length:targetCount},(_,i)=>({lotId:String(i+1),securityId:'1',symbol:'005380',name:'현대차',buyDate:'2026-09-11',holdingDays:20,remainingQuantity:'10',unitPrice:'180000',currentPrice:'200000',returnRate:'11.1',profitLoss:'200000',priceUpdatedAt:stamp})),meta:{accountId:second?'2':'1',total:second?0:targetCount,enabled:true,conditionsVersion:0,unavailableCount:unavailable?1:0,calculatedAt:stamp,priceAsOf:stamp}}});
    if(path.endsWith('/buy-lots')) return route.fulfill({json:{data:second?[]:Array.from({length:8},(_,i)=>({id:String(8-i),boughtAt:`2026-09-${String(30-i).padStart(2,'0')}T03:00:00Z`,buyDate:`2026-09-${30-i}`,holdingDays:i+1,security:{id:'1',symbol:'005380',name:i===4?'한국투자글로벌반도체장기종목':['삼성전자','현대차','현대차','SK하이닉스'][i%4]},quantity:'10',remainingQuantity:i===0?'0':'10',soldQuantity:i===0?'10':'0',unitPrice:'150000',currentPrice:unavailable?null:'200000',returnRate:unavailable?null:i===3?'-4':'33.33333',profitLoss:unavailable?null:i===3?'-20000':'500000',priceUpdatedAt:unavailable?null:stamp,valuationStatus:unavailable?'UNAVAILABLE':'AVAILABLE',sellTrades:[]}))}});
    return route.fulfill({json:{data:[]}});
  });
  return {fail:()=>{fail=true;},unavailable:()=>{unavailable=true;},hold:()=>{hold=true;},release:()=>{hold=false;release?.();}};
}

test('v0.4 example: three holdings, zero targets, eight buys; fixed panels and one scrolling body', async ({page},info) => {
  await homeFixture(page); await page.goto('/');
  const targets=page.getByTestId('target-arrival-card'),recent=page.getByTestId('recent-buys-card'),held=page.getByTestId('home-holdings-card');
  await expect(targets.getByText('내용이 없습니다.')).toBeVisible(); await expect(recent.getByTestId('recent-buy-lot')).toHaveCount(5); await expect(held.getByTestId('home-holding')).toHaveCount(3);
  await expect(recent.getByText('8건')).toBeVisible(); await expect(recent.getByText('26.09.30 (1일)')).toBeVisible();
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,header:document.querySelector('header')!.getBoundingClientRect().height,nav:[...document.querySelectorAll('.MuiBottomNavigation-root')].find(n=>getComputedStyle(n).display!=='none')!.getBoundingClientRect().height,panels:[...document.querySelectorAll('[data-testid$="-card"], [data-testid="home-summary-area"]')].map(n=>({id:n.getAttribute('data-testid'),rect:n.getBoundingClientRect().toJSON(),scroll:getComputedStyle(n).overflowY})),scrolls:[...document.querySelectorAll('main *')].filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY))}));
  const spacing = await page.evaluate(() => {
    const main = document.querySelector('main')!;
    const title = document.querySelector('header h1')!;
    const card = document.querySelector('[data-testid="home-summary-area"]')!;
    const cells = [...document.querySelectorAll('[data-testid="home-holding"] > div > div')];
    return { paddingTop: getComputedStyle(main).paddingTop, paddingLeft: getComputedStyle(main).paddingLeft,
      paddingRight: getComputedStyle(main).paddingRight, titleLeft: title.getBoundingClientRect().left,
      cardLeft: card.getBoundingClientRect().left, cardTop: card.getBoundingClientRect().top,
      clipped: cells.filter((cell, i) => i % 6 !== 0 && cell.scrollWidth > cell.clientWidth + 1).map(cell => cell.textContent) };
  });
  expect(spacing).toMatchObject({ paddingTop: '0px', paddingLeft: '16px', paddingRight: '16px', titleLeft: 8, cardLeft: 16, cardTop: 44, clipped: [] });
  expect(layout.overflow).toBe(false);expect(layout.header).toBe(44);expect(layout.nav).toBe(44);expect(layout.scrolls).toHaveLength(0);
  const assets=await page.locator('.MuiBottomNavigation-root:visible img').evaluateAll(nodes=>nodes.map(node=>({width:(node as HTMLImageElement).naturalWidth,height:(node as HTMLImageElement).naturalHeight,render:node.getBoundingClientRect().toJSON()})));
  expect(await page.locator('.MuiBottomNavigation-root:visible').getByRole('button',{name:'홈',exact:true}).evaluate(node=>getComputedStyle(node).color)).toBe('rgb(251, 191, 36)');
  expect(assets).toHaveLength(5);for(const asset of assets){expect(asset.width).toBe(18);expect(asset.height).toBe(18);expect(asset.render.width).toBe(18);expect(asset.render.height).toBe(18);}
  for(const p of layout.panels.filter(p=>p.id!=='home-summary-area' && p.id!=='home-trend-card')){if(info.project.name.startsWith('tablet'))expect(p.rect.height).toBe(290);else expect(p.rect.height).toBeLessThan(290);}
  if(info.project.name.startsWith('tablet')){
    const summary=layout.panels.find(p=>p.id==='home-summary-area')!,t=layout.panels.find(p=>p.id==='target-arrival-card')!,h=layout.panels.find(p=>p.id==='home-holdings-card')!,r=layout.panels.find(p=>p.id==='recent-buys-card')!;
    expect(summary.rect.height).toBe(290);expect(summary.rect.y).toBe(t.rect.y);expect(h.rect.y).toBe(r.rect.y);expect(h.rect.x).toBe(summary.rect.x);expect(t.rect.x).toBe(r.rect.x);
  }
  const colors=await held.getByTestId('home-holding').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('div > div')].filter(n=>n.textContent && n.childElementCount===0).map(n=>getComputedStyle(n).color)));
  expect(colors[0]).toContain('rgb(248, 113, 113)');expect(colors[1]).toContain('rgb(96, 165, 250)');expect(colors[2]).toContain('rgb(248, 250, 252)');
  await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.fonts.check('16px RoxHomeInter'))).toBe(true);
  await page.screenshot({path:info.outputPath('home-v04-top.png')});
  for(const [card,name] of [[held,'holdings'],[targets,'targets'],[recent,'recent']] as const){await card.scrollIntoViewIfNeeded();await card.screenshot({path:info.outputPath(`home-v04-${name}.png`)});}
  await page.locator('main').evaluate(n=>n.scrollTop=n.scrollHeight);await page.screenshot({path:info.outputPath('home-v04-bottom.png')});
  const safety=await recent.evaluate(n=>({bottom:n.getBoundingClientRect().bottom,mainBottom:document.querySelector('main')!.getBoundingClientRect().bottom}));expect(safety.mainBottom-safety.bottom).toBeGreaterThanOrEqual(79);
  const before=await recent.getByTestId('home-card-footer').boundingBox();await recent.getByRole('button',{name:'더보기',exact:true}).click();await expect(page).toHaveURL(/journal\?filter=buy/);expect(before).not.toBeNull();
});

test('refresh retains list and scroll; unavailable/errors differ from empty; account switch clears all prior rows',async({page})=>{
  const f=await homeFixture(page,6);await page.goto('/');const card=page.getByTestId('target-arrival-card');await expect(card.getByTestId('target-lot')).toHaveCount(5);
  await page.locator('main').evaluate(n=>n.scrollTop=180);const top=await page.locator('main').evaluate(n=>n.scrollTop);
  f.hold();await page.clock.fastForward(60_000);await expect(card.getByText(/갱신 중/)).toBeVisible();await expect(card.getByTestId('target-lot')).toHaveCount(5);expect(await page.locator('main').evaluate(n=>n.scrollTop)).toBe(top);f.release();await expect(card.getByText(/갱신 중/)).toHaveCount(0);
  f.unavailable();await page.clock.fastForward(60_000);await expect(card.getByText(/판정 불가 1건/)).toBeVisible();await expect(card.getByText('내용이 없습니다.')).toHaveCount(0);
  f.fail();await page.clock.fastForward(60_000);await page.clock.fastForward(10_000);await expect(card.getByText('조회 실패 · 이전 결과')).toBeVisible();await expect(card.getByTestId('target-lot')).toHaveCount(5);
  await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});await expect(card.getByTestId('target-lot')).toHaveCount(0);await expect(page.getByTestId('recent-buy-lot')).toHaveCount(0);await expect(page.getByTestId('home-holding')).toHaveCount(0);
});
