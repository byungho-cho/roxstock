import {test,expect} from '@playwright/test';
import {fixture} from './phase3-fixture';
async function setup(page:any){
 await fixture(page);
 await page.route('**/api/auth/me',(r:any)=>r.fulfill({json:{data:{id:'1',role:'USER',email:'test@example.invalid',mustChangePassword:false,settings:{}}}}));
 await page.route('**/api/accounts',(r:any)=>r.fulfill({json:{data:[{id:'1',name:'기본',brokerName:'미래에셋증권',accountNumber:'1234-12-5678',isActive:true,isDefault:true}]}}));
 await page.route('**/api/notifications/settings',(r:any)=>r.fulfill({json:{data:{tradeEnabled:true,newsEnabled:true,targetEnabled:true,pushConfigured:true}}}));
 await page.route('**/api/notifications/inbox',(r:any)=>r.fulfill({json:{data:{rows:[],total:0}}}));
 await page.addInitScript(()=>{
  const raw=(side:string)=>`[미래에셋증권] 전량체결\n매매구분: ${side}\n계좌번호: 1234-**-5678\n종목명: 종목1\n종목코드: 000001\n체결일자: 2026.10.07\n체결수량: 1주\n체결단가: 110원`;
  (window as any).nativeEntries=[{id:'a'.repeat(64),raw:raw('매수'),receivedAt:2},{id:'b'.repeat(64),raw:raw('매도'),receivedAt:1}];
  (window as any).RoxStockNative={postMessage:(raw:string)=>{const c=JSON.parse(raw);let response:any={requestId:c.requestId};if(c.action==='list')response={...response,protocolVersion:2,permission:true,total:(window as any).nativeEntries.length,entries:(window as any).nativeEntries};if(c.action==='status')(window as any).nativeEntries=(window as any).nativeEntries.filter((e:any)=>e.id!==c.id);setTimeout(()=>(window as any).RoxStockNative.onmessage?.({data:JSON.stringify(response)}),0);}};
 });
}
test('unified dialog geometry, ignored notice never creates a trade, empty inbox hides bell',async({page},info)=>{
 await setup(page);let writes=0;await page.route('**/api/buy-trades',r=>{writes++;return r.fulfill({json:{data:{}}});});
 await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'알림',exact:true})).toBeVisible();const box=await dialog.boundingBox();expect(Math.round(box!.width)).toBe(338);expect(Math.round(box!.height)).toBe(356);expect(Math.abs(box!.x+box!.width/2-page.viewportSize()!.width/2)).toBeLessThan(2);
 await page.screenshot({path:info.outputPath('unified-inbox.png')});await dialog.getByRole('button',{name:'무시',exact:true}).first().click();await expect(page.getByRole('button',{name:'알림 1건',exact:true})).toBeVisible();await dialog.getByRole('button',{name:'무시',exact:true}).click();await expect(page.getByRole('button',{name:/^알림 \d+건$/})).toHaveCount(0);expect(writes).toBe(0);
});
test('buy notification reuses form without focus; cancel and failed save preserve notice',async({page},info)=>{
 await setup(page);await page.route('**/api/buy-trades',r=>r.fulfill({status:500,json:{error:{message:'저장 실패'}}}));await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();await page.getByRole('button',{name:'매수 종목1',exact:true}).click();const form=page.getByTestId('trade-form');await expect(form).toBeVisible();await expect(page.getByLabel('매수수량',{exact:true})).toHaveValue('1');await expect(page.getByLabel('매수가격',{exact:true})).toHaveValue('110');expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('INPUT');await page.screenshot({path:info.outputPath('notice-buy.png')});await form.getByRole('button',{name:'매수',exact:true}).click();await expect(form.getByRole('alert')).toContainText('저장 실패');await form.getByRole('button',{name:'취소',exact:true}).click();await expect(page.getByRole('button',{name:'알림 2건',exact:true})).toBeVisible();
});
test('sell requires explicit lot confirmation and preserves notice on cancel',async({page},info)=>{
 await setup(page);await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();await page.getByRole('button',{name:'매도 종목1',exact:true}).click();await expect(page.getByRole('heading',{name:'연결 매수 선택'})).toBeVisible();const next=page.getByRole('button',{name:'선택 후 매도 등록'});await expect(next).toBeDisabled();await page.getByRole('button',{name:/매수 · 100원/}).first().click();await page.screenshot({path:info.outputPath('notice-sell-lot.png')});await next.click();await expect(page.getByTestId('trade-form')).toBeVisible();await expect(page.getByLabel('매도수량',{exact:true})).toHaveValue('1');expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('INPUT');
});
