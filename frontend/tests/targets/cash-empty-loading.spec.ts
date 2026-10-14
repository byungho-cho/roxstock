import {test,expect,type Page} from '@playwright/test';
async function setup(page:Page){
 await page.clock.setFixedTime(new Date('2026-10-15T03:00:00Z'));
 await page.route('**/api/**',r=>{const url=new URL(r.request().url()),p=url.pathname;
  if(p.startsWith('/api/pages/')||p==='/api/read-batch')return r.fulfill({status:404,json:{error:{message:'legacy fixture'}}});
  if(p==='/api/accounts')return r.fulfill({json:{data:[{id:'1',name:'검증',isActive:true,isDefault:true}]}});
  if(p.endsWith('/cash-overview'))return r.fulfill({json:{data:{account:{id:'1',currentBalance:'12000'},currentYearTax:{year:2026,amount:'100'},monthly:{deposit:'200',withdrawal:'100',dividend:'50'},yearly:{deposit:'200',withdrawal:'100',dividend:'50'},recentTransactions:[]}}});
  if(p.endsWith('/cash-transactions'))return r.fulfill({json:{data:[],meta:{total:0}}});
  if(p.endsWith('/asset-history'))return r.fulfill({json:{data:[{date:url.searchParams.get('from')??'2026-10-01',cashBalance:'10000'},{date:url.searchParams.get('to')??'2026-10-15',cashBalance:'12000'}]}});
  return r.fulfill({json:{data:[]}});
 });
}
test('cash code download and API wait show the same blank chart frame',async({page},info)=>{
 await setup(page);let releaseCode!:()=>void,releaseAccounts!:()=>void;
 await page.route('**/assets/LiveCashPage-*.js',async r=>{await new Promise<void>(resolve=>releaseCode=resolve);await r.continue();});
 await page.route('**/api/accounts',async r=>{await new Promise<void>(resolve=>releaseAccounts=resolve);await r.fallback();});
 await page.goto('/detail/cash',{waitUntil:'domcontentloaded'});
 await expect(page.getByTestId('cash-download-shell')).toBeVisible();await expect.poll(()=>!!releaseCode).toBe(true);
 await expect(page.locator('.MuiSkeleton-root,.MuiCircularProgress-root')).toHaveCount(0);
 await expect(page.getByTestId('cash-trend-chart')).toBeVisible();
 const chart=await page.getByTestId('cash-trend').boundingBox();await page.screenshot({path:info.outputPath('download.png')});
 await page.getByRole('button',{name:'이전 기간',exact:true}).click();
 releaseCode();await expect(page.getByTestId('cash-page')).toBeVisible();
 await expect(page.getByRole('button',{name:'기간 직접 선택'})).toHaveText('2026.09');
 expect(await page.getByTestId('cash-trend').boundingBox()).toEqual(chart);
 await expect(page.getByTestId('cash-balance-value')).toHaveText('');await expect(page.getByTestId('cash-history-total')).toHaveText('');
 await expect(page.getByText('내용이 없습니다.',{exact:true})).toHaveCount(0);await expect(page.locator('.MuiSkeleton-root,.MuiCircularProgress-root')).toHaveCount(0);
 await expect.poll(()=>!!releaseAccounts).toBe(true);releaseAccounts();
 await expect(page.getByTestId('cash-balance-value')).toHaveText('12,000원');await expect(page.getByTestId('cash-trend-line')).toBeAttached();
 expect(await page.getByTestId('cash-trend').boundingBox()).toEqual(chart);await page.screenshot({path:info.outputPath('ready.png')});
});
test('cash responses are independent; slow, failed and empty chart keep geometry',async({page})=>{
 await setup(page);let release!:()=>void;let fail=true,held=true;
 await page.route('**/api/accounts/*/asset-history*',async r=>{if(held)await new Promise<void>(resolve=>release=resolve);await r.fulfill(fail?{status:500,json:{error:{message:'fixture'}}}:{json:{data:[]}});});
 await page.goto('/detail/cash');await expect(page.getByTestId('cash-balance-value')).toHaveText('12,000원');await expect(page.getByTestId('cash-history')).toContainText('내용이 없습니다.');
 await expect(page.getByTestId('cash-trend-chart')).toBeVisible();const before=await page.getByTestId('cash-trend').boundingBox();
 await expect(page.locator('.MuiSkeleton-root,.MuiCircularProgress-root')).toHaveCount(0);await expect(page.getByTestId('cash-trend-line')).toHaveCount(0);
 // Fail without retries holding an unresolved follow-up response.
 held=false;release();
 await expect(page.getByText('추이 조회 실패 · 다시 시도',{exact:true})).toBeVisible({timeout:15000});expect(await page.getByTestId('cash-trend').boundingBox()).toEqual(before);
 fail=false;await page.getByText('추이 조회 실패 · 다시 시도',{exact:true}).click();await expect(page.getByTestId('cash-trend')).toContainText('내용이 없습니다.');expect(await page.getByTestId('cash-trend').boundingBox()).toEqual(before);
});
