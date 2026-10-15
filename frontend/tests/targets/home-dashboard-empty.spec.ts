import {test,expect,type Page} from '@playwright/test';
import {fixture} from './phase3-fixture';
async function cardGeometry(page:Page){return page.getByTestId('asset-composition-card').evaluate(el=>{const r=el.getBoundingClientRect();return {width:r.width,height:r.height,x:r.x,y:r.y+(document.querySelector('main')?.scrollTop??0)};});}
async function geometry(page:Page){return Promise.all(['home-total-card','home-quick-cards','asset-performance-card'].map(async id=>({id,...await page.getByTestId(id).boundingBox()})));}
for(const entry of [{path:'/',module:'DashboardPage',root:'home-shell'},{path:'/detail/assets',module:'AssetOverviewPage',root:'asset-overview'}])test(entry.module+' download and account waits keep fixed blank frames',async({page},info)=>{
 await fixture(page);let code!:()=>void,account!:()=>void;
 await page.route('**/assets/'+entry.module+'-*.js',async r=>{await new Promise<void>(resolve=>code=resolve);await r.continue();});await page.route('**/api/accounts',async r=>{await new Promise<void>(resolve=>account=resolve);await r.fallback();});
 await page.goto(entry.path+(entry.path==='/'?'':'?period=6m'),{waitUntil:'domcontentloaded'});const root=page.getByTestId(entry.root);await expect(root).toHaveAttribute('data-code-loading','true');await expect(page.locator('.MuiCircularProgress-root')).toHaveCount(0);
 const area=entry.path==='/'?page.getByTestId('home-summary-area'):root;await expect(area.locator('.MuiSkeleton-root')).toHaveCount(0);await expect(area).not.toContainText('0원');await expect(area).not.toContainText('내용이 없습니다.');
 const before=entry.path==='/'?await geometry(page):await cardGeometry(page);
 if(entry.path==='/'){for(const id of ['home-holdings-card','recent-buys-card','target-arrival-card']){await expect(page.getByTestId(id).getByRole('heading')).toBeVisible();await expect(page.getByTestId(id).locator('[data-loading-indicator="visible"]').first()).toBeVisible();}}
 else {await page.getByRole('button',{name:'종목별 비중 차트 방식 변경'}).click();if(info.project.name.includes('tablet')){await expect(page.getByRole('button',{name:'6개월',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'3개월',exact:true}).click();}}
 await page.locator('main').evaluate(e=>e.scrollTop=0);await page.screenshot({path:info.outputPath('download.png')});code();await expect(root).not.toHaveAttribute('data-code-loading');await expect(area.locator('.MuiSkeleton-root')).toHaveCount(0);expect(entry.path==='/'?await geometry(page):await cardGeometry(page)).toEqual(before);
 await expect.poll(()=>!!account).toBe(true);account();
 if(entry.path==='/'){await expect(page.getByTestId('home-total-card')).toContainText('165,000원');expect(await geometry(page)).toEqual(before);}
 else {await expect(page.getByTestId('composition-total')).toHaveText('165,000원');await expect(page.getByRole('button',{name:'종목별 비중 차트 방식 변경'})).toHaveText('누적형');expect(await cardGeometry(page)).toEqual(before);if(info.project.name.includes('tablet'))await expect(page.getByRole('button',{name:'3개월',exact:true})).toHaveAttribute('aria-pressed','true');}
 await page.locator('main').evaluate(e=>e.scrollTop=0);await page.screenshot({path:info.outputPath('ready.png')});
});
test('dashboard responses paint independently while summary is slow',async({page},info)=>{
 await fixture(page);let release!:()=>void;await page.route('**/api/accounts/*/dashboard',async r=>{await new Promise<void>(resolve=>release=resolve);await r.fallback();});await page.goto('/detail/assets');const card=page.getByTestId('asset-composition-card');await expect(card).toHaveAttribute('aria-busy','true');await expect(card).not.toContainText('0원');await expect(page.getByTestId('asset-overview').locator('.MuiSkeleton-root')).toHaveCount(0);const before=await cardGeometry(page);
 if(info.project.name.includes('tablet'))await expect(page.getByTestId('analysis-metrics-region')).toContainText('165,000원');else await expect(page.getByTestId('dashboard-trend-region')).toHaveAttribute('aria-busy','true');await expect.poll(()=>!!release).toBe(true);release();await expect(card).toHaveAttribute('aria-busy','false');await expect(card).toContainText('165,000원');expect(await cardGeometry(page)).toEqual(before);
});
test('dashboard failure retry and empty response retain reserved heights',async({page})=>{
 const f=await fixture(page);f.fail();await page.goto('/detail/assets');const card=page.getByTestId('asset-composition-card');await expect(card).toHaveAttribute('aria-busy','true');const before=await cardGeometry(page);await expect(card.getByRole('alert')).toContainText('조회 실패',{timeout:15000});expect(await cardGeometry(page)).toEqual(before);await expect(page.getByTestId('asset-overview').locator('.MuiSkeleton-root')).toHaveCount(0);
 f.success();await card.getByRole('button',{name:'다시 시도',exact:true}).click();await expect(card).toContainText('165,000원');expect(await cardGeometry(page)).toEqual(before);
 await page.route('**/api/accounts/*/dashboard',r=>r.fulfill({json:{data:{totalAssetValue:'0',stockValue:'0',cashBalance:'0',purchaseAmount:'0',pricingComplete:true,holdings:[]}}}));await page.reload();await expect(card.getByRole('status').first()).toContainText('내용이 없습니다.');await expect(page.getByTestId('composition-total')).toHaveText('0원');expect(await cardGeometry(page)).toEqual(before);
});
