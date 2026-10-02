import {test,expect,type Page} from '@playwright/test';
async function fixture(page:Page){
 let fail=false,saved=false;const writes:Array<Record<string,unknown>>=[];const reads:string[]=[];
 const security={id:'1',name:'삼성SDI',symbol:'006400',marketType:'KOSPI',securityType:'STOCK',listType:null,watchlistItemId:null,currentPrice:null,previousClosePrice:null,valuation:null};
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url()),p=u.pathname,m=route.request().method(),account=u.searchParams.get('accountId');
  if(m!=='GET'){const body=route.request().postDataJSON();writes.push(body);await new Promise(r=>setTimeout(r,200));if(fail)return route.fulfill({status:409,json:{error:{message:'검증 저장 실패'}}});saved=true;return route.fulfill({json:{data:{...security,...body,watchlistItemId:'1'}}});}
  if(p==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'검증 계좌 1',brokerName:'CI',cashBalance:'1000',isActive:true,isDefault:true},{id:'2',name:'검증 계좌 2',brokerName:'CI',cashBalance:'1000',isActive:true}]}});
  if(p==='/api/securities'){expect(account).toBeTruthy();reads.push(account!);if(u.searchParams.get('excludeRegistered')==='true')return route.fulfill({json:{data:account==='2'?[]:Array.from({length:8},(_,i)=>({...security,id:String(i+1),name:i?'삼성검증'+i:security.name,symbol:String(6400+i).padStart(6,'0')}))}});
   return route.fulfill({json:{data:saved?[{...security,listType:'HOLDING',watchlistItemId:'1',hasTradeHistory:false}]:[]}});}
  if(p.endsWith('/holdings')||p.endsWith('/buy-lots'))return route.fulfill({json:{data:[]}});
  if(p.endsWith('/trades'))return route.fulfill({json:{data:[],summary:{buyAmount:'0',sellAmount:'0',realizedProfitLoss:'0'},daily:[]}});
  return route.fulfill({json:{data:[]}});
 });return {writes,reads,fail:()=>fail=true,success:()=>fail=false};
}
async function search(page:Page){await page.goto('/stocks/add?type=holding&from=home');const input=page.getByRole('textbox',{name:'전체 종목 검색'});await expect(input).toBeFocused();await input.fill('삼성');await input.press('Enter');await expect(page.getByTestId('security-search-result')).toHaveCount(8);return page.getByTestId('security-search-result').first();}
test('full-screen search exceeds six results, failure retains state and duplicate click saves once',async({page},info)=>{
 const f=await fixture(page);const row=await search(page);
 await expect(page.getByRole('heading',{name:'종목추가(보유종목)'})).toBeVisible();
 await expect(page.getByRole('button',{name:'전체',exact:true})).toHaveCount(0);
 await expect(page.getByText('KOSPI',{exact:false}).first()).toBeVisible();
 await page.screenshot({path:info.outputPath('stock-add-search.png')});await row.click();const dialog=page.getByRole('dialog');
 await expect(dialog.getByText('삼성SDI',{exact:true})).toBeVisible();await expect(dialog.getByText('006400 · KOSPI')).toBeVisible();
 const box=await dialog.boundingBox();const viewport=page.viewportSize()!;expect(Math.abs(box!.x+box!.width/2-viewport.width/2)).toBeLessThan(1);expect(Math.abs(box!.y+box!.height/2-viewport.height/2)).toBeLessThan(1);
 if(viewport.width<600)expect(box!.x).toBe(32);
 await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity','1');await page.screenshot({path:info.outputPath('stock-add-confirm.png')});
 f.fail();await dialog.getByRole('button',{name:'추가',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('검증 저장 실패');await expect(page.getByRole('textbox',{name:'전체 종목 검색',includeHidden:true})).toHaveValue('삼성');
 f.success();await dialog.getByRole('button',{name:'추가',exact:true}).dblclick();await expect(page).toHaveURL(/stocks\?tab=holding/);expect(f.writes).toHaveLength(2);expect(f.writes[1]).toMatchObject({accountId:'1',listType:'HOLDING'});
 await page.reload();await expect(page.getByRole('button',{name:'삼성SDI 가치지표'})).toBeVisible();await expect(page.getByRole('tab',{name:'추천종목'})).toHaveCount(0);
});
test('direct addition focuses fields, year uses runtime year, IME does not submit and failure retains values',async({page},info)=>{
 const f=await fixture(page);await page.goto('/stocks/add?type=holding&from=home');await page.screenshot({path:info.outputPath('stock-add-initial.png')});
 await page.getByRole('button',{name:'직접 추가 ›'}).click();
 const name=page.getByRole('textbox',{name:'종목명',exact:true}),code=page.getByRole('textbox',{name:'종목코드',exact:true}),year=page.getByRole('textbox',{name:'상장 연도',exact:true});
 await expect(name).toBeFocused();await expect(year).toHaveValue(String(new Date().getFullYear()));await name.fill('신규테크');await name.press('Enter');await expect(code).toBeFocused();await code.fill('990123');await code.press('Enter');await expect(year).toBeFocused();await expect(page.getByRole('dialog')).toHaveCount(0);
 await year.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('stock-add-direct.png')});await year.press('Enter');const dialog=page.getByRole('dialog');await expect(dialog.getByText('신규테크')).toBeVisible();
 f.fail();await dialog.getByRole('button',{name:'추가',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();await dialog.getByRole('button',{name:'취소',exact:true}).click();await expect(name).toHaveValue('신규테크');await expect(code).toHaveValue('990123');expect(f.writes[0]).toMatchObject({listingYear:new Date().getFullYear(),marketType:'KOSPI',listType:'HOLDING'});
});
test('account switch clears confirmation and late previous-account save cannot navigate',async({page})=>{
 const f=await fixture(page);await (await search(page)).click();const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/api/watchlist-items'));
 await page.getByRole('dialog').getByRole('button',{name:'추가',exact:true}).click();
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
 await response;await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(/stocks\/add/);
 const input=page.getByRole('textbox',{name:'전체 종목 검색'});await input.fill('삼성');await input.press('Enter');await expect(page.getByText('내용이 없습니다.')).toBeVisible();expect(f.reads).toContain('2');expect(f.writes[0]).toMatchObject({accountId:'1'});
});
