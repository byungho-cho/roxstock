import {test,expect,type Page} from '@playwright/test';
import {fixture} from './phase3-fixture';
// Phase26 intentionally lets the target card resize once its result is known; its loading/error/empty heights are checked in phase26.spec.ts.
const cards=['home-total-card','home-quick-cards','home-trend-card','home-holdings-card','recent-buys-card'];
async function geometry(page:Page){const top=(await page.getByTestId('home-shell').boundingBox())!.y;return Promise.all(cards.map(async id=>{const b=(await page.getByTestId(id).boundingBox())!;return {id,height:b.height,top:b.y-top};}));}
async function titles(page:Page){for(const name of ['평가자산','일별손익','주식평가액','예수금'])await expect(page.getByTestId('home-summary-area').getByText(name,{exact:true})).toBeVisible();for(const id of ['home-trend-card','home-holdings-card','target-arrival-card','recent-buys-card'])await expect(page.getByTestId(id).getByRole('heading')).toBeVisible();}
test('account wait paints every home shell and label without fake results',async({page},info)=>{
 await fixture(page);let release!:()=>void;
 await page.route('**/api/accounts',async r=>{await new Promise<void>(resolve=>{release=resolve;});return r.fallback();});
 await page.goto('/');await expect(page.getByTestId('home-shell')).toBeVisible();await titles(page);
 await expect(page.getByTestId('home-shell')).not.toContainText('내용이 없습니다.');await expect(page.getByTestId('home-summary-area')).not.toContainText('0원');
 const before=await geometry(page);await expect(page.locator('[data-loading-indicator="visible"]')).not.toHaveCount(0);await page.screenshot({path:info.outputPath('home-partial-loading.png')});
 release();await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);expect(await geometry(page)).toEqual(before);
 await page.screenshot({path:info.outputPath('home-ready.png')});
});
test('chart and targets paint before slow dashboard; recent remains a titled shell until primary settles',async({page})=>{
 await fixture(page);const reads:string[]=[];let release!:()=>void;
 await page.route('**/api/**',async r=>{
    // Legacy endpoint fixture: exercise rollback compatibility; tuning-01 covers the unified APIs.
    if(new URL(r.request().url()).pathname.startsWith('/api/pages/'))return r.fulfill({status:404,json:{error:{message:'Legacy API fixture'}}});
const p=new URL(r.request().url()).pathname;reads.push(p);if(p.endsWith('/dashboard'))await new Promise<void>(resolve=>{release=resolve;});return r.fallback();});
 await page.goto('/');await titles(page);await expect(page.getByTestId('asset-trend-chart')).toBeVisible();await expect(page.getByTestId('target-arrival-card')).toContainText('0건');
 await expect(page.getByTestId('home-total-card')).toHaveAttribute('aria-busy','true');expect(reads.filter(p=>p.endsWith('/recent-buys'))).toHaveLength(0);
 const before=await geometry(page);release();await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);expect(await geometry(page)).toEqual(before);
 // StrictMode can cancel the initial request, but this change adds no new API endpoints.
 expect([...new Set(reads.filter(p=>p.startsWith('/api/accounts/')).map(p=>p.split('/').at(-1)))] .sort()).toEqual(['asset-history','dashboard','recent-buys','target-arrivals']);
 const count=reads.length;await page.locator('.MuiBottomNavigation-root:visible').getByRole('button',{name:'더보기',exact:true}).click();await page.locator('.MuiBottomNavigation-root:visible').getByRole('button',{name:'홈',exact:true}).click();await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);expect(reads.length).toBe(count);await expect(page.locator('[data-loading-indicator]')).toHaveCount(0);
});
test('partial failure and retry are local and preserve shell geometry',async({page},info)=>{
 await fixture(page);let release!:()=>void,failed=true,first=true;
 await page.route('**/api/accounts/*/asset-history**',async r=>{if(failed){if(first){first=false;await new Promise<void>(resolve=>{release=resolve;});}return r.fulfill({status:503,json:{error:{message:'failed'}}});}return r.fallback();});
 await page.goto('/');await expect(page.getByTestId('home-total-card')).toContainText('165,000원');const before=await geometry(page);release();
 await expect(page.getByTestId('home-chart-region').getByRole('alert')).toBeVisible({timeout:15000});await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);expect(await geometry(page)).toEqual(before);await page.screenshot({path:info.outputPath('home-partial-error.png')});
 failed=false;await page.getByTestId('home-chart-region').getByRole('button',{name:'재시도',exact:true}).click();await expect(page.getByTestId('asset-trend-chart')).toBeVisible();expect(await geometry(page)).toEqual(before);
});
test('empty results are displayed only after completion; five-row bodies remain reserved',async({page})=>{
 await fixture(page,{history:[]});let release!:()=>void;
 await page.route('**/api/accounts/*/dashboard',async r=>{await new Promise<void>(resolve=>{release=resolve;});return r.fulfill({json:{data:{account:{id:'1'},totalAssetValue:'0',stockValue:'0',cashBalance:'0',purchaseAmount:'0',pricingComplete:true,holdings:[]}}});});
 await page.goto('/');await expect(page.getByTestId('home-total-card')).toHaveAttribute('aria-busy','true');await expect(page.getByTestId('home-holdings-card')).not.toContainText('내용이 없습니다.');const before=await geometry(page);release();await expect(page.getByTestId('home-holdings-card')).toContainText('내용이 없습니다.');await expect(page.getByTestId('home-total-card')).toContainText('0원');expect(await geometry(page)).toEqual(before);
});
test('account change clears old values and a late response cannot replace the new account',async({page})=>{
 await fixture(page);await page.clock.install();await page.goto('/');await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);
 let releaseOld!:()=>void,releaseNew!:()=>void;
 await page.route('**/api/accounts/*/dashboard',async r=>{const id=new URL(r.request().url()).pathname.split('/')[3];await new Promise<void>(resolve=>{if(id==='1')releaseOld=resolve;else releaseNew=resolve;});return id==='1'?r.fulfill({json:{data:{account:{id:'1'},totalAssetValue:'999999',stockValue:'999999',cashBalance:'0',purchaseAmount:'0',holdings:[]}}}):r.fallback();});
 await page.clock.runFor(301000);await expect.poll(()=>!!releaseOld).toBe(true);await expect(page.getByTestId('home-total-card')).toContainText('165,000원');
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});await expect.poll(()=>!!releaseNew).toBe(true);await expect(page.getByTestId('home-total-card')).not.toContainText('165,000원');await expect(page.getByTestId('home-holding')).toHaveCount(0);
 const before=await geometry(page);releaseNew();await expect(page.getByTestId('home-total-card')).toContainText('165,000원');releaseOld();await expect(page.getByTestId('home-total-card')).not.toContainText('999,999원');await expect(page.getByTestId('home-holdings-card')).toContainText('0종목');expect(await geometry(page)).toEqual(before);
});
test('fast completion removes indicators immediately without a minimum loading delay',async({page})=>{
 await fixture(page);await page.clock.install();await page.goto('/');await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);await expect(page.locator('[data-loading-indicator]')).toHaveCount(0);await titles(page);
});


test('dashboard and target failures do not block successful chart or deferred recent list',async({page})=>{
 await fixture(page);await page.route('**/api/accounts/*/dashboard',r=>r.fulfill({status:503,json:{error:{message:'dashboard unavailable'}}}));await page.route('**/api/accounts/*/target-arrivals',r=>r.fulfill({status:503,json:{error:{message:'target unavailable'}}}));
 await page.goto('/');await titles(page);await expect(page.getByTestId('asset-trend-chart')).toBeVisible();const before=await geometry(page);
 await expect(page.getByTestId('home-total-card')).toContainText('조회 실패',{timeout:15000});await expect(page.getByTestId('target-arrival-card')).toContainText('조회 실패');await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);await expect(page.getByTestId('home-holdings-card').getByRole('alert')).toBeVisible();expect(await geometry(page)).toEqual(before);
});
test('account API failure retains all card shells and exposes local retry without fake zeros',async({page})=>{
 await fixture(page);await page.route('**/api/accounts',r=>r.fulfill({status:503,json:{error:{message:'account unavailable'}}}));await page.goto('/');await titles(page);const before=await geometry(page);
 await expect(page.getByTestId('home-total-card')).toContainText('조회 실패',{timeout:15000});await expect(page.getByTestId('home-chart-region').getByRole('alert')).toBeVisible();await expect(page.getByTestId('home-shell')).not.toContainText('0원');await expect(page.locator('[data-loading-indicator]')).toHaveCount(0);expect(await geometry(page)).toEqual(before);
});
