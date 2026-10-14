import {test,expect,type Page} from '@playwright/test';
import {fixture} from './phase28-fixture';
async function geometry(page:Page){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await page.locator('header').boundingBox())!.height).toBe(44);
 expect((await page.getByRole('navigation',{name:'하단 메뉴'}).boundingBox())!.height).toBe(44);
 expect(await page.locator('main').evaluate(main=>Array.from(main.querySelectorAll('*')).filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+1).length)).toBe(0);
}
async function captureCard(page:Page,card:ReturnType<Page['getByTestId']>,path:string){
 const viewport=page.viewportSize()!;const height=(await card.boundingBox())!.height;
 await page.setViewportSize({width:viewport.width,height:Math.max(viewport.height,Math.ceil(height)+110)});
 await card.scrollIntoViewIfNeeded();await card.screenshot({path});await page.setViewportSize(viewport);
}
test('home performance is compact with unchanged amounts and two previous-day lines',async({page},info)=>{
 await fixture(page);await page.goto('/');const card=page.getByTestId('asset-performance-card');await expect(card).toContainText('500원');
 const measured=await card.evaluate(n=>({height:n.getBoundingClientRect().height,padding:[getComputedStyle(n).paddingTop,getComputedStyle(n).paddingBottom],gap:getComputedStyle(n).gap,lines:Array.from(n.children).map(e=>e.getBoundingClientRect().height)}));
 expect(measured).toEqual({height:158,padding:['8px','8px'],gap:'4px',lines:[20,20,20,20,44]});
 const day=card.getByTestId('asset-previous-day');await expect(day).toContainText('+50원');await expect(day).toContainText('2.0%');
 expect(await day.locator('.MuiStack-root').evaluate(n=>({gap:getComputedStyle(n).gap,heights:Array.from(n.children).map(e=>e.getBoundingClientRect().height)}))).toEqual({gap:'4px',heights:[20,20]});
 await expect(card.getByTestId('performance-heading')).toContainText('50.0%');await expect(card.getByTestId('performance-row').nth(0)).toContainText('1,000원');await expect(card.getByTestId('performance-row').nth(2)).toContainText('1,500원');
 await expect(card.getByTestId('performance-row').nth(1).getByText('500원')).toHaveCSS('color','rgb(248, 113, 113)');
 await expect(page.getByTestId('home-trend-card')).toHaveCount(0);await geometry(page);
 console.log(JSON.stringify({kind:'phase29-home-measurement',project:info.project.name,...measured}));await page.screenshot({path:info.outputPath('home-after.png')});await captureCard(page,card,info.outputPath('performance-after.png'));
});
test('dashboard orders donut trend weights and footer without independent cards or duplicate reads',async({page},info)=>{
 const f=await fixture(page,{trend:true});await page.goto('/detail/assets');const card=page.getByTestId('asset-composition-card');await expect(card.getByTestId('asset-trend-chart')).toBeVisible();
 await expect(page.getByTestId('asset-overview').getByTestId('asset-performance-card')).toHaveCount(0);await expect(page.getByTestId('asset-overview').getByText('예수금',{exact:true})).toHaveCount(0);
 await expect(card.getByTestId('asset-weight-row')).toHaveCount(3);await expect(card.getByTestId('asset-legend-row')).toHaveCount(3);
 const order=await card.evaluate(n=>['asset-donut','dashboard-trend','asset-weights','composition-updated-at'].map(id=>n.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect().toJSON()));
 for(let i=1;i<order.length;i++)expect(order[i].top).toBeGreaterThanOrEqual(order[i-1].bottom);
 const trend=card.getByTestId('dashboard-trend');await expect(trend).toHaveCSS('border-top-width','1px');await expect(trend).toHaveCSS('border-bottom-width','1px');
 expect(await trend.getByTestId('asset-trend-date').allTextContents()).not.toContain('09/01');await expect(trend).toContainText('1개월');
 const reads=f.reads.filter(p=>p.includes('/asset-history?'));expect(reads).toHaveLength(1);expect(reads[0]).toContain('from=2026-09-13');expect(reads[0]).toContain('to=2026-10-13');expect(reads[0]).toContain('view=trend');
 await page.locator('main').evaluate(n=>n.scrollTop=0);await page.screenshot({path:info.outputPath('dashboard-after.png')});await captureCard(page,card,info.outputPath('composition-after.png'));
 if(page.viewportSize()!.width>=600){const held=page.getByTestId('asset-holdings-card');expect((await held.getByTestId('home-card-footer').boundingBox())!.y).toBeGreaterThanOrEqual((await held.getByTestId('home-holding').last().boundingBox())!.y+(await held.getByTestId('home-holding').last().boundingBox())!.height);}
 await card.getByRole('button',{name:'종목별 비중 차트 방식 변경'}).click();await expect(card).toContainText('누적형');await expect(card.getByTestId('asset-weight-row')).toHaveCount(3);await geometry(page);
 await trend.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('dashboard-chart-after.png')});
 await trend.getByRole('button',{name:'자산추이 (상세보기)'}).click();await expect(page).toHaveURL(/\/assets$/);await page.goBack();await expect(page).toHaveURL(/\/detail\/assets$/);
 expect(f.reads.filter(p=>p.includes('/asset-history?')&&p.includes('view=trend'))).toHaveLength(1);
});
test('chart touch tooltip stays visible closes and follows selected account',async({page},info)=>{
 await fixture(page,{trend:true});await page.goto('/detail/assets');const chart=page.getByTestId('asset-trend-chart');await chart.scrollIntoViewIfNeeded();const svg=chart.locator('svg');await expect(svg).toHaveCSS('touch-action','pan-y');
 const r=(await svg.boundingBox())!,cdp=await page.context().newCDPSession(page),y=r.y+r.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width*.2,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width*.98,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const tip=chart.getByTestId('asset-trend-tooltip');await expect(tip).toContainText('2,500원');const t=(await tip.boundingBox())!;expect(t.x).toBeGreaterThanOrEqual(0);expect(t.x+t.width).toBeLessThanOrEqual(page.viewportSize()!.width);expect(t.y+t.height).toBeLessThanOrEqual(page.viewportSize()!.height);await page.screenshot({path:info.outputPath('chart-tooltip-after.png')});
 await page.keyboard.press('Escape');await expect(tip).toHaveCount(0);
 await page.mouse.click(r.x+r.width*.98,y);await expect(tip).toContainText('2,500원');await page.getByRole('heading',{name:'대시보드',exact:true}).click();await expect(tip).toHaveCount(0);
 const oldPath=await svg.locator('path').last().getAttribute('d');await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});await expect(chart).toBeVisible();await expect(chart.locator('svg path').last()).not.toHaveAttribute('d',oldPath!);await expect(chart.getByTestId('asset-trend-date').last()).toContainText('10/13');await chart.scrollIntoViewIfNeeded();const r2=(await chart.locator('svg').boundingBox())!;await page.mouse.click(r2.x+r2.width*.98,r2.y+r2.height/2);await expect(tip).toContainText('7,000원');await expect(tip).not.toContainText('2,500원');
});
test('history loading empty and failure preserve weights and stable composition geometry',async({page},info)=>{
 const f=await fixture(page,{trend:true});f.history.mode='hold';await page.goto('/detail/assets');const card=page.getByTestId('asset-composition-card'),region=card.getByTestId('dashboard-trend-region');await expect(region).toHaveAttribute('aria-busy','true');await expect(card.getByTestId('asset-weight-row')).toHaveCount(3);const height=(await card.boundingBox())!.height;
 f.history.mode='empty';f.releaseHistory();await expect(region).toHaveAttribute('aria-busy','false');await expect(region).toContainText('내용이 없습니다.');expect((await card.boundingBox())!.height).toBe(height);await geometry(page);await page.screenshot({path:info.outputPath('chart-empty-after.png')});
 f.history.mode='error';await page.reload();await expect(region.getByRole('alert')).toContainText('조회 실패',{timeout:15000});await expect(card.getByTestId('asset-weight-row')).toHaveCount(3);expect((await card.boundingBox())!.height).toBe(height);
 f.history.mode='ready';await region.getByRole('button',{name:'재시도'}).click();await expect(card.getByTestId('asset-trend-chart')).toBeVisible();expect((await card.boundingBox())!.height).toBe(height);
});
test('capture previous main for comparable home and dashboard screens',async({page},info)=>{
 test.skip(!process.env.PHASE29_BASELINE_URL,'baseline preview is provided in CI');await fixture(page,{trend:true});
 for(const [name,path,ready] of [['home','/','asset-performance-card'],['dashboard','/detail/assets','asset-composition-card']] as const){await page.goto(process.env.PHASE29_BASELINE_URL+path);await expect(page.getByTestId(ready)).toBeVisible();await page.screenshot({path:info.outputPath(name+'-before.png')});await captureCard(page,page.getByTestId(ready),info.outputPath(name==='home'?'performance-before.png':'composition-before.png'));}
});
