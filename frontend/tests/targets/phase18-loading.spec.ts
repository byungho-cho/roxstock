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
 const chartHeight=(await page.getByTestId('home-chart-region').boundingBox())!.height,holdingsTop=(await page.getByTestId('home-holdings-card').boundingBox())!.y;expect(chartHeight).toBe(page.viewportSize()!.width<600?87:171);
 expect(reads.filter(p=>p.endsWith('/recent-buys'))).toHaveLength(0);
 await expect.poll(()=>!!releasePrimary).toBe(true);releasePrimary();await expect(page.getByTestId('asset-trend-chart')).toBeVisible();const major=Date.now()-start;expect((await page.getByTestId('home-chart-region').boundingBox())!.height).toBe(chartHeight);expect((await page.getByTestId('home-holdings-card').boundingBox())!.y).toBe(holdingsTop);
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
 const cardPositions=async()=>{const trend=(await page.getByTestId('analysis-trend').boundingBox())!.y,performance=(await page.getByTestId('analysis-performance').boundingBox())!.y,compound=(await page.getByTestId('analysis-compound').boundingBox())!.y;return {performance:performance-trend,compound:compound-performance};};const positions=await cardPositions();
 let release!:()=>void,mode='empty',block=true;await page.route('**/api/accounts/*/asset-history**',async r=>{if(block){await new Promise<void>(resolve=>{release=resolve;});block=false;}return r.fulfill(mode==='error'?{status:503,json:{error:{message:'failure'}}}:{json:{data:[],summary:{}}});});
 await button.click();await expect.poll(()=>!!release).toBe(true);await expect(region).toHaveAttribute('aria-busy','true');expect((await region.boundingBox())!.height).toBe(height);expect((await button.boundingBox())!.y).toBe(top);expect(await cardPositions()).toEqual(positions);
 await expect(page.getByTestId('analysis-chart')).toHaveCount(0);release();await expect(region).toHaveAttribute('aria-busy','false');expect((await region.boundingBox())!.height).toBe(height);expect((await button.boundingBox())!.y).toBe(top);expect(await cardPositions()).toEqual(positions);
 mode='error';block=true;release=undefined!;await page.getByRole('button',{name:'6개월',exact:true}).click();await expect(region).toHaveAttribute('aria-busy','true');await expect.poll(()=>!!release).toBe(true);release();await expect(region.getByRole('alert')).toBeVisible({timeout:15000});expect((await region.boundingBox())!.height).toBe(height);expect((await button.boundingBox())!.y).toBe(top);expect(await cardPositions()).toEqual(positions);await page.screenshot({path:info.outputPath('analysis-error-fixed-height.png')});
});
test('settings menu paints during account wait; compound plans paint before portfolio calculation',async({page},info)=>{
 await fixture(page);let releaseAccount!:()=>void;
 await page.route('**/api/accounts',async r=>{await new Promise<void>(resolve=>{releaseAccount=resolve;});return r.fallback();});
 const settingsStart=Date.now();await page.goto('/detail/settings');await expect(page.getByTestId('settings-menu')).toContainText('계좌 관리',{timeout:15000});const settingsBasic=Date.now()-settingsStart;await expect.poll(()=>!!releaseAccount).toBe(true);releaseAccount();await page.unroute('**/api/accounts');
 let releaseAssets!:()=>void;const goal={id:'g',goalName:'성장 목표',annualTargetRate:'10',displayColor:'#5EA1F0',isDefault:true,isVisible:true,yearTarget:'110',finalTarget:'121',progress:null,rows:[{year:2026,asset:'110',contributed:'100'},{year:2027,asset:'121',contributed:'100'}]};
 await page.route('**/api/accounts/*/compound-plans*',async r=>{const url=new URL(r.request().url()),basic=url.searchParams.get('view')==='basic';if(!basic)await new Promise<void>(resolve=>{releaseAssets=resolve;});return r.fulfill({json:{data:{accountId:'1',currentAssets:basic?null:'120',currentYear:2026,asOf:'2026-10-07T03:00:00Z',pricingComplete:!basic,plans:[{id:'p',planName:'기본 계획',startYear:2026,endYear:2027,duration:2,status:'ACTIVE',initialAssetValue:'100',annualContributionAmount:'0',goals:[{...goal,progress:basic?null:'99.17'}]}]}}});});
 const compoundStart=Date.now();await page.goto('/detail/compound');await expect(page.getByText('기본 계획',{exact:false}).first()).toBeVisible();const compoundBasic=Date.now()-compoundStart;await expect.poll(()=>!!releaseAssets).toBe(true);await expect(page.getByLabel('현재 자산 계산 중').first()).toBeVisible();await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);releaseAssets();await expect(page.getByTestId('compound-current-assets').first()).toHaveText('120원');
 console.log(JSON.stringify({kind:'phase18-mock-independent',project:info.project.name,settingsBasicMs:settingsBasic,compoundBasicMs:compoundBasic,compoundAssetsMs:Date.now()-compoundStart,utc:new Date().toISOString()}));await page.screenshot({path:info.outputPath('compound-ready.png')});
});

test('settings menu and account list do not wait for deferred account editor code',async({page})=>{
 await fixture(page);let release!:()=>void,modules=0;
 await page.route('**/src/pages/more/MoreScreens.tsx*',async route=>{modules++;await new Promise<void>(r=>{release=r;});return route.fallback();});
 await page.goto('/detail/settings');await expect(page.getByTestId('settings-menu')).toContainText('계좌 관리');
 if(page.viewportSize()!.width<600)await page.getByTestId('settings-menu').getByText('계좌 관리',{exact:true}).click();
 await expect(page.getByTestId('account-card-1')).toBeVisible();expect(modules).toBe(0);
 await page.getByRole('button',{name:'계좌 추가',exact:true}).click();await expect.poll(()=>!!release).toBe(true);await expect(page.getByLabel('설정 상세 코드 불러오는 중')).toBeVisible();release();await expect(page.getByRole('button',{name:'추가',exact:true})).toBeVisible();
});
