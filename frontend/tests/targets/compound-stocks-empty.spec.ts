import {test,expect} from '@playwright/test';
import {fixture} from './phase3-fixture';
for(const item of [{url:'/stocks',module:'StockListPage',shell:'종목목록'},{url:'/detail/compound',module:'CompoundPage',shell:'복리계획'}])test(`${item.module}: code and account waits keep fixed content without loading effects`,async({page},info)=>{
 await fixture(page);let releaseCode!:()=>void,releaseAccount!:()=>void;
 await page.route(`**/assets/${item.module==='StockListPage'?'LiveStockDetailPage':item.module}-*.js`,async r=>{await new Promise<void>(resolve=>releaseCode=resolve);await r.continue();});
 await page.route('**/api/accounts',async r=>{await new Promise<void>(resolve=>releaseAccount=resolve);await r.fallback();});
 await page.goto(item.url,{waitUntil:'domcontentloaded'});await expect(page.getByRole('heading',{name:item.shell,exact:true})).toBeVisible();await expect.poll(()=>!!releaseCode).toBe(true);
 await expect(page.locator('.MuiSkeleton-root,.MuiCircularProgress-root')).toHaveCount(0);await expect(page.locator('main')).not.toContainText('0원');await expect(page.getByText('내용이 없습니다.',{exact:true})).toHaveCount(0);
 await page.screenshot({path:info.outputPath('download.png')});
 if(item.module==='StockListPage'){await page.getByRole('textbox',{name:'목록 종목 검색'}).fill('ㅅㅅ');await page.getByRole('tab',{name:'관심종목'}).click();}
 if(item.module==='StockListPage'){await expect(page.getByTestId('stock-loading-row')).toHaveCount(0);await expect(page.getByTestId('stock-loading-table-row')).toHaveCount(0);await expect(page.getByRole('table')).toHaveCount(0);}
 releaseCode();await expect(page.locator('.MuiSkeleton-root,.MuiCircularProgress-root')).toHaveCount(0);
 if(item.module==='CompoundPage')await expect(page.getByTestId('compound-empty-frame')).toBeVisible();else{await expect(page.getByTestId('stock-list')).toBeVisible();await expect(page.getByRole('textbox',{name:'목록 종목 검색'})).toHaveValue('ㅅㅅ');await expect(page.getByRole('tab',{name:'관심종목'})).toHaveAttribute('aria-selected','true');}
 await expect.poll(()=>!!releaseAccount).toBe(true);releaseAccount();await expect(page.locator('.MuiSkeleton-root,.MuiCircularProgress-root')).toHaveCount(0);
});
test('compound plans display before asset response; current amounts stay blank',async({page})=>{
 await fixture(page);let release!:()=>void;let held=true;
 const goal={id:'g',goalName:'기본 목표',annualTargetRate:'10',displayColor:'#5EA1F0',isDefault:true,isVisible:true,yearTarget:'110',finalTarget:'121',progress:null,rows:[{year:2026,asset:'110',contributed:'100'}]};
 await page.route('**/api/accounts/*/compound-plans*',async r=>{const basic=new URL(r.request().url()).searchParams.get('view')==='basic';if(!basic&&held)await new Promise<void>(resolve=>release=resolve);await r.fulfill({json:{data:{accountId:'1',currentAssets:basic?null:'120',currentYear:2026,asOf:basic?null:'2026-10-07T03:00:00Z',pricingComplete:!basic,plans:[{id:'p',planName:'기본 계획',startYear:2026,endYear:2027,duration:2,status:'ACTIVE',initialAssetValue:'100',annualContributionAmount:'0',goals:[{...goal,progress:basic?null:'99.17'}]}]}}});});
 await page.goto('/detail/compound');await expect(page.getByTestId('compound-plan-p')).toBeVisible();await expect(page.getByTestId('compound-current-assets').first()).toHaveText('');
 await expect(page.locator('.MuiSkeleton-root,.MuiCircularProgress-root')).toHaveCount(0);await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);
 await expect(page.getByRole('meter')).toHaveCount(0); const before=await page.getByTestId('compound-plan-p').boundingBox();await expect.poll(()=>!!release).toBe(true);held=false;release();await expect(page.getByTestId('compound-current-assets').first()).toHaveText('120원');await expect(page.getByRole('meter').first()).toBeVisible();expect(await page.getByTestId('compound-plan-p').boundingBox()).toEqual(before);
});

test('stock cards and table mount only after the selected account data arrives',async({page},info)=>{
 await fixture(page);let held=true;const release:Array<()=>void>=[];
 await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;if(path.startsWith('/api/pages/'))return route.fulfill({status:404,json:{error:{message:'Legacy API fixture'}}});if(held&&/^\/api\/accounts\/[^/]+\//.test(path))await new Promise<void>(resolve=>release.push(resolve));return route.fallback();});
 await page.goto('/stocks');await expect(page.getByTestId('stock-list')).toBeVisible();await expect.poll(()=>release.length).toBeGreaterThan(0);await expect(page.getByTestId('stock-list-pending')).toHaveCount(1);await expect(page.locator('[data-testid^="stock-card-"],[data-testid="stock-loading-row"],[data-testid="stock-loading-table-row"]')).toHaveCount(0);await expect(page.getByRole('table')).toHaveCount(0);await expect(page.getByTestId('stock-list')).not.toContainText('내용이 없습니다.');await expect(page.getByTestId('stock-list')).not.toContainText('총 0개');await expect(page.getByRole('textbox',{name:'목록 종목 검색'})).toBeVisible();await page.screenshot({path:info.outputPath('stocks-blank.png')});
 held=false;release.splice(0).forEach(resolve=>resolve());if(page.viewportSize()!.width>=600)await expect(page.getByRole('row',{name:'종목1 상세보기',exact:true})).toBeVisible();else await expect(page.getByTestId('stock-card-1')).toBeVisible();await expect(page.getByTestId('stock-list-pending')).toHaveCount(0);
});
