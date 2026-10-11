import {test,expect} from '@playwright/test';
import {fixture} from './phase3-fixture';

test('home priority cards finish before recent buys; recent delay is local; valid re-entry cache is immediate',async({page},info)=>{
 await fixture(page);const reads:string[]=[];let releasePrimary!:()=>void,releaseRecent!:()=>void;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;reads.push(path);
  if(path.endsWith('/asset-history'))await new Promise<void>(r=>{releasePrimary=r;});
  if(path.endsWith('/recent-buys'))await new Promise<void>(r=>{releaseRecent=r;});
  return route.fallback();
 });
 const start=Date.now();await page.goto('/');await expect(page.getByTestId('home-summary-area')).toContainText('165,000원');await expect(page.getByTestId('target-arrival-card')).toContainText('내용이 없습니다.');
 expect(reads.filter(p=>p.endsWith('/recent-buys'))).toHaveLength(0);
 await expect.poll(()=>!!releasePrimary).toBe(true);releasePrimary();await expect(page.getByTestId('asset-trend-chart')).toBeVisible();const major=Date.now()-start;
 await expect.poll(()=>!!releaseRecent).toBe(true);await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);await expect(page.getByTestId('recent-buy-lot')).toHaveCount(0);
 releaseRecent();await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);const total=Date.now()-start;
 const before=reads.length;await page.locator('.MuiBottomNavigation-root:visible').getByRole('button',{name:'더보기',exact:true}).click();await page.locator('.MuiBottomNavigation-root:visible').getByRole('button',{name:'홈',exact:true}).click();await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);expect(reads.length).toBe(before);
 console.log(JSON.stringify({kind:'phase18-mock-ui',project:info.project.name,majorMs:major,recentMs:total,totalMs:total,requests:before,utc:new Date().toISOString(),sha:process.env.GITHUB_SHA}));
 await page.screenshot({path:info.outputPath('home-ready.png')});
});
test('primary terminal failure also releases recent query',async({page})=>{
 await fixture(page);await page.route('**/api/accounts/*/dashboard',r=>r.fulfill({status:503,json:{error:{message:'failed'}}}));
 await page.goto('/');await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5,{timeout:15000});
});
test('analysis preserves normal chart height and period/button positions in pending, empty and failed states',async({page},info)=>{
 await fixture(page);await page.goto('/assets');await expect(page.getByTestId('analysis-chart')).toBeVisible();
 const region=page.getByTestId('analysis-chart-region'),button=page.getByRole('button',{name:'3개월',exact:true});const height=(await region.boundingBox())!.height;
 expect(height).toBe(224);const top=(await button.boundingBox())!.y;
 let release!:()=>void,mode='empty';await page.route('**/api/accounts/*/asset-history**',async r=>{await new Promise<void>(resolve=>{release=resolve;});return r.fulfill(mode==='error'?{status:503,json:{error:{message:'failure'}}}:{json:{data:[],summary:{}}});});
 await button.click();await expect.poll(()=>!!release).toBe(true);await expect(region).toHaveAttribute('aria-busy','true');expect((await region.boundingBox())!.height).toBe(height);expect((await button.boundingBox())!.y).toBe(top);
 await expect(page.getByTestId('analysis-chart')).toHaveCount(0);release();await expect(region).toHaveAttribute('aria-busy','false');expect((await region.boundingBox())!.height).toBe(height);expect((await button.boundingBox())!.y).toBe(top);
 mode='error';await page.getByRole('button',{name:'6개월',exact:true}).click();await expect(region).toHaveAttribute('aria-busy','true');release();await expect(region.getByRole('alert')).toBeVisible();expect((await region.boundingBox())!.height).toBe(height);expect((await button.boundingBox())!.y).toBe(top);await page.screenshot({path:info.outputPath('analysis-error-fixed-height.png')});
});
