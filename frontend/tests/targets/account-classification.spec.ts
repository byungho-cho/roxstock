import {test,expect,type Page} from '@playwright/test';
async function fixture(page:Page){
 let fail=false;let selected='WATCHLIST';const writes:Array<Record<string,unknown>>=[];
 await page.route('**/api/**',async route=>{const u=new URL(route.request().url()),p=u.pathname,m=route.request().method(),account=u.searchParams.get('accountId');
  const security={id:'1',name:'분류검증종목',symbol:'990001',marketType:'KOSPI',securityType:'STOCK',listType:account==='2'?'RECOMMENDED':selected,manualListType:selected,watchlistItemId:account==='2'?'2':'1',hasTradeHistory:false,currentPrice:'1000',previousClosePrice:'1000',valuation:null};
  if(m!=='GET'){const body=route.request().postDataJSON();writes.push(body);await new Promise(r=>setTimeout(r,120));if(fail)return route.fulfill({status:409,json:{error:{message:'검증 저장 실패'}}});selected=body.listType;return route.fulfill({json:{data:{...security,listType:selected}}});}
  if(p==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'검증 계좌 1',brokerName:'CI',cashBalance:'1000',isActive:true,isDefault:true},{id:'2',name:'검증 계좌 2',brokerName:'CI',cashBalance:'1000',isActive:true}]}});
  if(p==='/api/securities'){expect(account).toBeTruthy();return route.fulfill({json:{data:[security]}});}
  if(p.endsWith('/holdings')||p.endsWith('/buy-lots'))return route.fulfill({json:{data:[]}});
  if(p.endsWith('/trades'))return route.fulfill({json:{data:[],summary:{buyAmount:'0',sellAmount:'0',realizedProfitLoss:'0'},daily:[]}});
  return route.fulfill({json:{data:[]}});
 });return {writes,fail:()=>fail=true,success:()=>fail=false};
}
async function search(page:Page){await page.goto('/stocks/add?type=watchlist');await page.getByRole('textbox',{name:'전체 종목 검색'}).fill('분류검증');const row=page.getByTestId('security-search-result');await expect(row).toBeVisible();return row;}
test('registered categories change, manual holding creates no trade, failure preserves selection and refresh persists',async({page})=>{
 const f=await fixture(page);const row=await search(page);await expect(row.getByRole('button')).toBeEnabled();await row.getByRole('button').click();const dialog=page.getByRole('dialog').last();await dialog.getByRole('button',{name:'추천종목',exact:true}).click();f.fail();await dialog.getByRole('button',{name:'등록',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('검증 저장 실패');await expect(dialog.getByRole('button',{name:'추천종목',exact:true})).toHaveAttribute('aria-pressed','true');f.success();await dialog.getByRole('button',{name:'등록',exact:true}).dblclick();await expect(page).toHaveURL(/tab=recommended/);expect(f.writes).toHaveLength(2);expect(f.writes[1]).toMatchObject({accountId:'1',listType:'RECOMMENDED'});await page.reload();await expect(page.getByRole('button',{name:'분류검증종목 가치지표'})).toBeVisible();
 const again=await search(page);await again.getByRole('button').click();const category=page.getByRole('dialog').last();await category.getByRole('button',{name:'보유종목',exact:true}).click();await category.getByRole('button',{name:'등록',exact:true}).click();await expect(page).toHaveURL(/tab=holding/);expect(f.writes).toHaveLength(3);expect(f.writes[2]).toMatchObject({accountId:'1',listType:'HOLDING'});await page.reload();await expect(page.getByRole('button',{name:'분류검증종목 가치지표'})).toBeVisible();
});
test('account change resets pending category form and search queries use the new account',async({page})=>{
 await fixture(page);const row=await search(page);await row.getByRole('button').click();await expect(page.getByRole('dialog')).toBeVisible();await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
 await expect(page.getByRole('dialog')).toHaveCount(0);await page.getByRole('textbox',{name:'전체 종목 검색'}).fill('분류검증');await expect(page.getByTestId('security-search-result').getByRole('button')).toHaveText('추천종목');
});

test('late successful save from previous account does not navigate or replace the current form',async({page})=>{
 const f=await fixture(page);const row=await search(page);await row.getByRole('button').click();const dialog=page.getByRole('dialog').last();await dialog.getByRole('button',{name:'추천종목',exact:true}).click();
 const response=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().includes('/api/watchlist-items/'));
 await dialog.getByRole('button',{name:'등록',exact:true}).click();
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
 await response;await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(/stocks\/add/);expect(f.writes[0]).toMatchObject({accountId:'1',listType:'RECOMMENDED'});
 await page.getByRole('textbox',{name:'전체 종목 검색'}).fill('분류검증');await expect(page.getByTestId('security-search-result').getByRole('button')).toHaveText('추천종목');
});
