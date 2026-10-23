import {test,expect} from '@playwright/test';
import {fixture} from './phase3-fixture';
async function setup(page:any,nativeRows?:Array<{id:string;raw:string;receivedAt:number}>){
 await fixture(page);
 await page.route('**/api/auth/me',(r:any)=>r.fulfill({json:{data:{id:'1',role:'USER',email:'test@example.invalid',mustChangePassword:false,settings:{}}}}));
 await page.route('**/api/accounts',(r:any)=>r.fulfill({json:{data:[{id:'1',name:'기본',brokerName:'미래에셋증권',accountNumber:'1234-12-5678',isActive:true,isDefault:true}]}}));
 await page.route('**/api/notifications/settings',(r:any)=>r.fulfill({json:{data:{tradeEnabled:true,newsEnabled:true,targetEnabled:true,pushConfigured:true}}}));
 await page.route('**/api/notifications/inbox',(r:any)=>r.fulfill({json:{data:{rows:[],total:0}}}));
 await page.addInitScript((nativeRows:Array<{id:string;raw:string;receivedAt:number}>|null)=>{
  const raw=(side:string)=>`[미래에셋증권] 전량체결\n매매구분: ${side}\n계좌번호: 1234-**-5678\n종목명: 종목1\n종목코드: 000001\n체결일자: 2026.10.07\n체결수량: 1주\n체결단가: 110원`;
  (window as any).nativeEntries=nativeRows??[{id:'a'.repeat(64),raw:raw('매수'),receivedAt:2},{id:'b'.repeat(64),raw:raw('매도'),receivedAt:1}];
  (window as any).RoxStockNative={postMessage:(raw:string)=>{const c=JSON.parse(raw);let response:any={requestId:c.requestId};if(c.action==='list')response={...response,protocolVersion:2,openInbox:(window as any).nativeOpen??'',permission:true,total:(window as any).nativeEntries.length,entries:(window as any).nativeEntries};if(c.action==='ack-click')(window as any).nativeOpen='';if(c.action==='status')(window as any).nativeEntries=(window as any).nativeEntries.filter((e:any)=>e.id!==c.id);setTimeout(()=>(window as any).RoxStockNative.onmessage?.({data:JSON.stringify(response)}),0);}};
 },nativeRows??null);
}
test('unified dialog geometry, ignored notice never creates a trade, empty inbox hides bell',async({page},info)=>{
 await setup(page);let writes=0;await page.route('**/api/buy-trades',r=>{writes++;return r.fulfill({json:{data:{}}});});
 await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'알림',exact:true})).toBeVisible();const box=await dialog.boundingBox();expect(Math.round(box!.width)).toBe(338);expect(Math.round(box!.height)).toBe(356);expect(Math.abs(box!.x+box!.width/2-page.viewportSize()!.width/2)).toBeLessThan(2);
 const ignore=dialog.getByRole('button',{name:'무시',exact:true}).first();const ignoreBox=await ignore.boundingBox();const cardBox=await ignore.locator('..').boundingBox();expect(ignoreBox!.width).toBe(50);expect(ignoreBox!.height).toBe(28);expect(Math.abs(ignoreBox!.y+14-cardBox!.y-cardBox!.height/2)).toBeLessThan(1);await page.screenshot({animations:'disabled',path:info.outputPath('unified-inbox.png')});await dialog.getByRole('button',{name:'무시',exact:true}).first().click();await expect(dialog.getByText('1건',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'무시',exact:true}).click();await dialog.getByRole('button',{name:'닫기',exact:true}).click();await expect(page.getByRole('button',{name:/^알림 \d+건$/})).toHaveCount(0);expect(writes).toBe(0);
});
test('buy notification reuses form without focus; cancel and failed save preserve notice',async({page},info)=>{
 await setup(page);await page.route('**/api/buy-trades',r=>r.fulfill({status:500,json:{error:{message:'저장 실패'}}}));await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();await page.getByRole('button',{name:'매수 종목1',exact:true}).click();const form=page.getByTestId('trade-form');await expect(form).toBeVisible();await expect(page.getByLabel('매수수량',{exact:true})).toHaveValue('1');await expect(page.getByLabel('매수가격',{exact:true})).toHaveValue('110');expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('INPUT');await page.screenshot({animations:'disabled',path:info.outputPath('notice-buy.png')});await form.getByRole('button',{name:'매수',exact:true}).click();await expect(form.getByRole('alert')).toContainText('저장 실패');await form.getByRole('button',{name:'취소',exact:true}).click();await expect(page.getByRole('button',{name:'알림 2건',exact:true})).toBeVisible();
});
test('sell requires explicit lot confirmation and preserves notice on cancel',async({page},info)=>{
 await setup(page);await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();await page.getByRole('button',{name:'매도 종목1',exact:true}).click();await expect(page.getByRole('heading',{name:'연결 매수 선택'})).toBeVisible();const next=page.getByRole('button',{name:'선택 후 매도 등록'});await expect(next).toBeDisabled();await page.getByRole('button',{name:/매수 · 100원/}).first().click();await page.screenshot({animations:'disabled',path:info.outputPath('notice-sell-lot.png')});await next.click();await expect(page).toHaveURL(/\/trade\?type=sell/);await expect(page.getByTestId('trade-form')).toBeVisible();await expect(page.getByLabel('매도수량',{exact:true})).toHaveValue('1');expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('INPUT');
});
test('successful buy removes only saved notice and keeps original request identity',async({page})=>{
 await setup(page);let request:any;await page.route('**/api/buy-trades',r=>{request=r.request().postDataJSON();return r.fulfill({json:{data:{id:'91',cashTransactionId:'92'}}});});await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();await page.getByRole('button',{name:'매수 종목1',exact:true}).click();await page.getByTestId('trade-form').getByRole('button',{name:'매수',exact:true}).click();await page.getByRole('dialog',{name:'예수금을 입력하시겠습니까?'}).getByRole('button',{name:'취소',exact:true}).click();await expect(page.getByRole('button',{name:'알림 1건',exact:true})).toBeVisible();expect(request.requestId).toBe('a'.repeat(64));expect(request.accountId).toBe('1');expect(request.quantity).toBe('1');
});
test('news and target read only after authorized navigation; ignore retains dispatch history',async({page})=>{
 await setup(page);let done=false;const event='00000000-0000-0000-0000-000000000111',actions:string[]=[];
 await page.route('**/api/notifications/inbox',r=>r.fulfill({json:{data:{rows:done?[]:[{id:event,kind:'TARGET',title:'현대차',detail:'5% 목표 도래',accountId:'1',createdAt:'2026-10-07T00:00:00Z'}],total:done?0:1}}}));
 await page.route('**/api/notifications/events/'+event,r=>r.fulfill({json:{data:{destination:'/',accountId:'1'}}}));
 await page.route('**/api/auth/settings',r=>r.fulfill({json:{data:{selectedAccountId:'1'}}}));
 await page.route('**/api/notifications/events/'+event+'/state',r=>{actions.push(r.request().postDataJSON().action);done=true;return r.fulfill({json:{data:{updated:true}}});});
 await page.goto('/');await page.getByRole('button',{name:'알림 3건',exact:true}).click();await page.getByRole('button',{name:'목표 현대차',exact:true}).click();await expect.poll(()=>actions).toContain('read');await expect(page.getByRole('button',{name:'알림 2건',exact:true})).toBeVisible();
});
for(const count of [0,1])test(`sell with ${count} eligible lot requires explicit choice`,async({page})=>{
 await setup(page);await page.route('**/api/accounts/*/buy-lots**',r=>r.fulfill({json:{data:count?[{id:'71',boughtAt:'2026-10-01T03:00:00Z',unitPrice:'100',remainingQuantity:'2',security:{id:'1',symbol:'000001',name:'종목1'}}]:[]}}));
 await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();await page.getByRole('button',{name:'매도 종목1',exact:true}).click();const next=page.getByRole('button',{name:'선택 후 매도 등록'});await expect(next).toBeDisabled();if(count){await page.getByRole('button',{name:/매수 · 100원/}).click();await expect(next).toBeEnabled();}else await expect(page.getByText('동일 계좌·종목에 매도일 이전 매수 중 잔여수량이 충분한 매수가 없습니다.')).toBeVisible();
});
test('dividend opens existing form with confirmed amounts and preserves notice on cancel',async({page})=>{
 await setup(page);await page.route('**/api/accounts/*/cash-overview',r=>r.fulfill({json:{data:{account:{id:'1',currentBalance:'10000'},currentYearTax:{year:2026,amount:'0'},monthly:{deposit:'0',withdrawal:'0',dividend:'0'},yearly:{deposit:'0',withdrawal:'0',dividend:'0'},recentTransactions:[]}}}));await page.addInitScript(()=>{(window as any).nativeEntries=[{id:'c'.repeat(64),receivedAt:3,raw:'[미래에셋증권] 권리 입금 안내\n배당금 입금\n계좌번호: 1234-**-5678\n종목명: 종목1\n종목코드: 000001\n입금일자: 2026.10.07\n세전배당금: 1,000원\n세후배당금: 846원'}];});
 await page.goto('/');await page.getByRole('button',{name:'알림 1건',exact:true}).click();await page.getByRole('button',{name:'배당 종목1',exact:true}).click();await expect(page.getByLabel('세전 배당',{exact:true})).toHaveValue('1,000');await expect(page.getByLabel('세후 배당',{exact:true})).toHaveValue('846');expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('INPUT');await page.getByRole('button',{name:'알림 등록 닫기'}).click();await expect(page.getByRole('button',{name:'알림 1건',exact:true})).toBeVisible();
});
test('news notification reaches the news screen before acknowledgement',async({page})=>{
 await setup(page);let read=false;const id='00000000-0000-0000-0000-000000000112';await page.route('**/api/notifications/inbox',r=>r.fulfill({json:{data:{rows:read?[]:[{id,kind:'NEWS',title:'종목1',detail:'신규 소식',accountId:null,createdAt:'2026-10-07T00:00:00Z'}],total:read?0:1}}}));await page.route('**/api/notifications/events/'+id,r=>r.fulfill({json:{data:{destination:'/detail/stock-news',accountId:null}}}));await page.route('**/api/notifications/events/'+id+'/state',r=>{read=true;return r.fulfill({json:{data:{updated:true}}});});await page.goto('/');await page.getByRole('button',{name:'알림 3건',exact:true}).click();await page.getByRole('button',{name:'소식 종목1',exact:true}).click();await expect(page).toHaveURL(/\/detail\/stock-news/);await expect.poll(()=>read).toBe(true);
});
test('late initial account resolution keeps the already opened inbox',async({page})=>{
 await setup(page);let release!:()=>void;const ready=new Promise<void>(resolve=>{release=resolve;});await page.route('**/api/accounts',async r=>{await ready;await r.fulfill({json:{data:[{id:'1',name:'기본',brokerName:'미래에셋증권',accountNumber:'1234-12-5678',isActive:true,isDefault:true}]}});});
 await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();await expect(page.getByRole('heading',{name:'알림',exact:true})).toBeVisible();release();await expect(page.getByText('미래에셋증권 · 1234-12-5678',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'알림',exact:true})).toBeVisible();
});

const kiaRaw='[미래에셋증권] 전량체결\n매매구분: 매수\n계좌번호: 1234-**-5678\n종목명: 기아(A000270)\n체결일자: 2026.10.22\n체결수량: 10주\n체결단가: 108,400원\n체결금액: 1,084,000원';
async function kiaSetup(page:any,message=kiaRaw){
 await setup(page,[{id:'e'.repeat(64),raw:message,receivedAt:1}]);
 await page.route('**/api/securities**',(r:any)=>r.fulfill({json:{data:[{id:'91',name:'기아',symbol:'000270',marketType:'KOSPI',listType:'HOLDING',currentPrice:'108400',previousClosePrice:'108000',priceUpdatedAt:'2026-10-22T03:00:00Z'}]}}));
 await page.route('**/api/accounts/*/dashboard',(r:any)=>r.fulfill({json:{data:{account:{id:'1',name:'기본'},totalAssetValue:'5000000',stockValue:'0',cashBalance:'5000000',purchaseAmount:'0',holdings:[]}}}));
}
test('stored Kia A-code notice survives cancel/reload and saves the normalized exact security',async({page})=>{
 await kiaSetup(page);let payload:any;await page.route('**/api/buy-trades',r=>{payload=r.request().postDataJSON();return r.fulfill({json:{data:{id:'99',cashTransactionId:'100'}}});});
 await page.goto('/');await page.getByRole('button',{name:'알림 1건',exact:true}).click();await expect(page.getByRole('button',{name:'10주 × 108,400원',exact:true})).toBeVisible();await page.getByRole('button',{name:'매수 기아',exact:true}).click();await expect(page.getByLabel('매수가격',{exact:true})).toHaveValue('108,400');await expect(page.getByLabel('매수수량',{exact:true})).toHaveValue('10');await page.getByTestId('trade-form').getByRole('button',{name:'취소',exact:true}).click();expect(payload).toBeUndefined();
 await page.reload();await page.getByRole('button',{name:'알림 1건',exact:true}).click();await page.getByRole('button',{name:'매수 기아',exact:true}).click();await page.getByTestId('trade-form').getByRole('button',{name:'매수',exact:true}).click();await page.getByRole('dialog',{name:'예수금을 입력하시겠습니까?'}).getByRole('button',{name:'취소',exact:true}).click();await expect(page.getByRole('button',{name:'알림 1건',exact:true})).toHaveCount(0);expect(payload).toMatchObject({securityId:'91',quantity:'10',unitPrice:'108400',requestId:'e'.repeat(64)});
});
test('unidentifiable stored broker notice remains pending without submitting a trade',async({page})=>{
 await kiaSetup(page,kiaRaw.replace('기아(A000270)','기아자동차'));let writes=0;await page.route('**/api/buy-trades',r=>{writes++;return r.fulfill({json:{data:{}}});});await page.goto('/');await page.getByRole('button',{name:'알림 1건',exact:true}).click();await page.getByRole('button',{name:'매수 기아자동차',exact:true}).click();await expect(page.getByRole('alert')).toContainText('종목을 정확히 확인할 수 없습니다');expect(writes).toBe(0);expect(await page.evaluate(()=>(window as any).nativeEntries.length)).toBe(1);
});

async function cashFixture(page:any,status='UNKNOWN',cost='0'){
 const row={id:'92',transactionType:'BUY',transactionDate:'2026-10-07T03:00:00Z',createdAt:'2026-10-07T03:00:00Z',updatedAt:'2026-10-07T03:00:00Z',amount:'110',feeTaxAmount:cost,feeTaxStatus:status,balanceAfter:String(1000-Number(cost)),signedAmount:'-110',memo:null,dividend:null};
 await page.route('**/api/accounts/1/cash-transactions/92', (r:any)=>r.fulfill({json:{data:row}}));
 await page.route('**/api/accounts/1/cash-overview**',(r:any)=>r.fulfill({json:{data:{account:{id:'1',currentBalance:row.balanceAfter},currentYearTax:{year:2026,amount:'0'},monthly:{deposit:'0',withdrawal:'0',dividend:'0'},yearly:{deposit:'0',withdrawal:'0',dividend:'0'},recentTransactions:[row]}}}));
}
test('notification goes through trade route then replaces it with linked cash and explicitly confirms estimate',async({page},info)=>{
 await setup(page);await cashFixture(page);let buys=0,settlement:any;
 await page.route('**/api/buy-trades',r=>{buys++;return r.fulfill({json:{data:{id:'91',cashTransactionId:'92'}}});});
 await page.route('**/api/accounts/1/cash-transactions/92/fee-estimate',r=>r.fulfill({json:{data:{amount:'2',count:2}}}));
 await page.route('**/api/cash-transactions/92',r=>{settlement=r.request().postDataJSON();return r.fulfill({json:{data:{id:'92',cashBalanceAdjusted:true}}});});
 await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();await page.getByRole('button',{name:'매수 종목1',exact:true}).click();await expect(page).toHaveURL(/\/trade\?/);await expect(page.getByLabel('매수일자',{exact:true})).toHaveValue('2026-10-07');
 await page.getByTestId('trade-form').getByRole('button',{name:'매수',exact:true}).click();await page.getByRole('dialog',{name:'예수금을 입력하시겠습니까?'}).getByRole('button',{name:'확인',exact:true}).click();
 await expect(page).toHaveURL(/editCash=92/);await expect(page.getByTestId('trade-form')).toHaveCount(0);await expect(page.getByLabel('제세금',{exact:true})).toHaveValue('2');await expect(page.getByText('추정 · 최근 매수 2건 기준')).toBeVisible();await expect(page.getByLabel('세후예수금',{exact:true})).toHaveValue('998');await page.screenshot({animations:'disabled',path:info.outputPath('estimated-cash.png')});
 await page.getByRole('button',{name:'취소',exact:true}).click();await expect(page).toHaveURL(/\/$/);await expect(page.getByTestId('trade-form')).toHaveCount(0);expect(buys).toBe(1);await page.goto('/detail/cash?editCash=92&cashAccount=1');await expect(page.getByLabel('제세금',{exact:true})).toHaveValue('2');
 await page.getByLabel('실제 금액으로 확인',{exact:true}).check();await page.getByRole('button',{name:'저장',exact:true}).click();await expect.poll(()=>settlement).toMatchObject({feeTaxAmount:'2',feeTaxStatus:'CONFIRMED',balanceAfter:'998',amount:'110'});expect(buys).toBe(1);await expect(page).toHaveURL(/\/detail\/cash$/);
});
test('late fee estimate cannot overwrite user amount or explicit unchecked choice',async({page})=>{
 await setup(page);await cashFixture(page);let release!:()=>void;const ready=new Promise<void>(r=>release=r);let settlement:any;
 await page.route('**/api/accounts/1/cash-transactions/92/fee-estimate',async r=>{await ready;await r.fulfill({json:{data:{amount:'2',count:1}}});});
 await page.route('**/api/cash-transactions/92',r=>{settlement=r.request().postDataJSON();return r.fulfill({json:{data:{id:'92'}}});});
 await page.goto('/detail/cash?editCash=92&cashAccount=1');await expect(page.getByLabel('제세금',{exact:true})).toBeVisible();await page.getByLabel('제세금',{exact:true}).fill('7');await expect(page.getByLabel('실제 금액으로 확인',{exact:true})).toBeChecked();await page.getByLabel('실제 금액으로 확인',{exact:true}).uncheck();release();await page.waitForTimeout(300);await expect(page.getByLabel('제세금',{exact:true})).toHaveValue('7');await expect(page.getByLabel('세후예수금',{exact:true})).toHaveValue('993');await page.getByRole('button',{name:'저장',exact:true}).click();await expect.poll(()=>settlement).toMatchObject({feeTaxStatus:'UNKNOWN',feeTaxAmount:'7'});
});
test('unconfirmed estimate persists as estimate and an existing actual cost is preserved',async({page})=>{
 await setup(page);await cashFixture(page);let saved:any;
 await page.route('**/api/accounts/1/cash-transactions/92/fee-estimate',r=>r.fulfill({json:{data:{amount:'3',count:3}}}));
 await page.route('**/api/cash-transactions/92',r=>{saved=r.request().postDataJSON();return r.fulfill({json:{data:{id:'92'}}});});
 await page.goto('/detail/cash?editCash=92&cashAccount=1');await expect(page.getByLabel('제세금',{exact:true})).toHaveValue('3');await expect(page.getByLabel('실제 금액으로 확인',{exact:true})).toBeChecked();await page.getByLabel('실제 금액으로 확인',{exact:true}).uncheck();await page.getByRole('button',{name:'저장',exact:true}).click();await expect.poll(()=>saved).toMatchObject({feeTaxStatus:'ESTIMATED',feeTaxBasisCount:3,feeTaxAmount:'3'});
 await cashFixture(page,'CONFIRMED','9');await page.goto('/detail/cash?editCash=92&cashAccount=1');await expect(page.getByLabel('제세금',{exact:true})).toHaveValue('9');await expect(page.getByLabel('실제 금액으로 확인',{exact:true})).toBeChecked();
});
test('cached estimate cannot replace a confirmed cost when switching cash records',async({page})=>{
 await setup(page);
 const row={id:'92',transactionType:'BUY',transactionDate:'2026-10-07T03:00:00Z',createdAt:'2026-10-07T03:00:00Z',updatedAt:'2026-10-07T03:00:00Z',amount:'110',feeTaxAmount:'0',feeTaxStatus:'UNKNOWN',balanceAfter:'1000',signedAmount:'-110',memo:null,dividend:null};
 const other={...row,id:'93',feeTaxAmount:'7',feeTaxStatus:'CONFIRMED',balanceAfter:'2000'};
 await page.route('**/api/accounts/1/cash-transactions/92',r=>r.fulfill({json:{data:row}}));
 await page.route('**/api/accounts/1/cash-transactions?**',r=>r.fulfill({json:{data:[row,other],meta:{total:2,limit:100,offset:0}}}));
 await page.route('**/api/accounts/1/cash-overview**',r=>r.fulfill({json:{data:{account:{id:'1',currentBalance:row.balanceAfter},currentYearTax:{year:2026,amount:'0'},monthly:{deposit:'0',withdrawal:'0',dividend:'0'},yearly:{deposit:'0',withdrawal:'0',dividend:'0'},recentTransactions:[row]}}}));
 await page.route('**/api/accounts/1/cash-transactions/92/fee-estimate',r=>r.fulfill({json:{data:{amount:'3',count:3}}}));
 await page.goto('/detail/cash?editCash=92&cashAccount=1');await expect(page.getByLabel('제세금',{exact:true})).toHaveValue('3');
 await page.route('**/api/cash-transactions/92',r=>{row.feeTaxAmount='9';row.feeTaxStatus='CONFIRMED';row.balanceAfter='1001';return r.fulfill({json:{data:{id:'92'}}});});
 await page.getByLabel('세전예수금',{exact:true}).fill('1010');await page.getByLabel('제세금',{exact:true}).fill('9');await page.getByLabel('실제 금액으로 확인',{exact:true}).check();await page.getByRole('button',{name:'저장',exact:true}).click();
 await page.locator('[data-scroll-item="93"]').click();await expect(page.getByLabel('제세금',{exact:true})).toHaveValue('7');await page.getByRole('button',{name:'취소',exact:true}).click();
 await page.locator('[data-scroll-item="92"]').click();await expect(page.getByLabel('제세금',{exact:true})).toHaveValue('9');await expect(page.getByLabel('실제 금액으로 확인',{exact:true})).toBeChecked();
});

test('cost defaults, whole row toggle, zero clearing and no implicit save',async({page})=>{
 await setup(page);await cashFixture(page,'UNKNOWN','5');let writes=0;
 await page.route('**/api/cash-transactions/92',r=>{writes++;return r.fulfill({json:{data:{id:'92'}}});});
 await page.goto('/detail/cash?editCash=92&cashAccount=1');const check=page.getByLabel('실제 금액으로 확인',{exact:true});
 await expect(check).toBeChecked();await expect(page.getByText('실제 비용 미확인',{exact:true})).toHaveCount(0);
 const label=page.locator('label').filter({hasText:'실제 금액으로 확인'});const box=await label.boundingBox();await label.click({position:{x:box!.width-4,y:box!.height/2}});await expect(check).not.toBeChecked();
 await page.getByLabel('제세금',{exact:true}).fill('8');await expect(check).not.toBeChecked();
 await check.focus();await page.keyboard.press('Space');await expect(check).toBeChecked();
 await page.getByLabel('제세금',{exact:true}).fill('0');await expect(check).not.toBeChecked();await page.getByLabel('제세금',{exact:true}).fill('');await expect(check).not.toBeChecked();expect(writes).toBe(0);
});

test('durable native click opens unified inbox without saving or completing a trade',async({page})=>{
 await setup(page);await page.addInitScript(()=>{(window as any).nativeOpen='a'.repeat(64);});let writes=0;await page.route('**/api/buy-trades',r=>{writes++;return r.fulfill({json:{data:{}}});});await page.goto('/');await expect(page.getByRole('heading',{name:'알림',exact:true})).toBeVisible();await expect(page.getByRole('dialog').getByText('2건',{exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>(window as any).nativeEntries.length)).toBe(2);await expect.poll(()=>page.evaluate(()=>(window as any).nativeOpen)).toBe('');expect(writes).toBe(0);
});
