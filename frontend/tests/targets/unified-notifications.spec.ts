import {test,expect} from '@playwright/test';
import {fixture} from './phase3-fixture';
export async function setup(page:any,nativeRows?:Array<{id:string;raw:string;receivedAt:number}>){
 await fixture(page);
 await page.route('**/api/auth/me',(r:any)=>r.fulfill({json:{data:{id:'1',role:'USER',email:'test@example.invalid',mustChangePassword:false,settings:{}}}}));
 await page.route('**/api/accounts',(r:any)=>r.fulfill({json:{data:[{id:'1',name:'기본',brokerName:'미래에셋증권',accountNumber:'1234-12-5678',isActive:true,isDefault:true}]}}));
 await page.route('**/api/notifications/settings',(r:any)=>r.fulfill({json:{data:{tradeEnabled:true,newsEnabled:true,targetEnabled:true,pushConfigured:true,accounts:[{id:'1',name:'기본',brokerName:'미래에셋증권',accountNumber:'1234-12-5678',isDefault:true,enabled:true,buyEnabled:true,sellEnabled:true,dividendEnabled:true,newsEnabled:true,targetEnabled:true}]}}}));
 await page.route('**/api/notifications/inbox',(r:any)=>r.fulfill({json:{data:{rows:[],total:0}}}));
 await page.addInitScript((nativeRows:Array<{id:string;raw:string;receivedAt:number}>|null)=>{
  const raw=(side:string)=>`[미래에셋증권] 전량체결\n매매구분: ${side}\n계좌번호: 1234-**-5678\n종목명: 종목1\n종목코드: 000001\n체결일자: 2026.10.07\n체결수량: 1주\n체결단가: 110원`;
  (window as any).nativeEntries=nativeRows??[{id:'a'.repeat(64),raw:raw('매수'),receivedAt:2},{id:'b'.repeat(64),raw:raw('매도'),receivedAt:1}];
  (window as any).RoxStockNative={postMessage:(raw:string)=>{const c=JSON.parse(raw);let response:any={requestId:c.requestId};if(c.action==='list')response={...response,protocolVersion:3,openInbox:(window as any).nativeOpen??'',permission:true,total:(window as any).nativeEntries.length,entries:(window as any).nativeEntries};if(c.action==='ack-click')(window as any).nativeOpen='';if(c.action==='status')(window as any).nativeEntries=(window as any).nativeEntries.filter((e:any)=>e.id!==c.id);setTimeout(()=>(window as any).RoxStockNative.onmessage?.({data:JSON.stringify(response)}),0);}};
 },nativeRows??null);
}
test('unified dialog geometry, ignored notice never creates a trade, empty inbox hides bell',async({page},info)=>{
 await setup(page);let writes=0;await page.route('**/api/buy-trades',r=>{writes++;return r.fulfill({json:{data:{}}});});
 await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('heading',{name:'알림',exact:true})).toBeVisible();const box=await dialog.boundingBox();expect(Math.round(box!.width)).toBe(338);expect(Math.round(box!.height)).toBe(356);expect(Math.abs(box!.x+box!.width/2-page.viewportSize()!.width/2)).toBeLessThan(2);
 const ignore=dialog.getByRole('button',{name:'무시',exact:true}).first();const ignoreBox=await ignore.boundingBox();const cardBox=await ignore.locator('..').boundingBox();expect(ignoreBox!.width).toBe(50);expect(ignoreBox!.height).toBe(28);expect(Math.abs(ignoreBox!.y+14-cardBox!.y-cardBox!.height/2)).toBeLessThan(1);await page.screenshot({animations:'disabled',path:info.outputPath('unified-inbox.png')});await dialog.getByRole('button',{name:'무시',exact:true}).first().click();await expect(dialog.getByText('1건',{exact:true}).first()).toBeVisible();await dialog.getByRole('button',{name:'무시',exact:true}).click();await dialog.getByRole('button',{name:'닫기',exact:true}).click();await expect(page.getByRole('button',{name:/^알림 \d+건$/})).toHaveCount(0);expect(writes).toBe(0);
});
test('buy notification reuses form without focus; cancel and failed save preserve notice',async({page},info)=>{
 await setup(page);await page.route('**/api/buy-trades',r=>r.fulfill({status:500,json:{error:{message:'저장 실패'}}}));await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();await page.getByRole('button',{name:'매수 종목1',exact:true}).click();const form=page.getByTestId('trade-form');await expect(form).toBeVisible();await expect(page.getByLabel('매수수량',{exact:true})).toHaveValue('1');await expect(page.getByLabel('매수가격',{exact:true})).toHaveValue('110');expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('INPUT');await page.screenshot({animations:'disabled',path:info.outputPath('notice-buy.png')});await form.getByRole('button',{name:'매수',exact:true}).click();await expect(form.getByRole('alert')).toContainText('저장 실패');await form.getByRole('button',{name:'취소',exact:true}).click();await expect(page.getByRole('button',{name:'알림 2건',exact:true})).toBeVisible();
});
test('sell defaults first sorted lot and still requires confirmation before opening form',async({page},info)=>{
 await setup(page);await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();await page.getByRole('button',{name:'매도 종목1',exact:true}).click();await expect(page.getByRole('heading',{name:'연결 매수 선택'})).toBeVisible();const next=page.getByRole('button',{name:'선택 후 매도 등록'});await expect(next).toBeEnabled();await expect(page.getByTestId('sell-candidate-11')).toHaveAttribute('aria-pressed','true');await page.screenshot({animations:'disabled',path:info.outputPath('notice-sell-lot.png')});await next.click();await expect(page).toHaveURL(/\/trade\?type=sell/);await expect(page.getByTestId('trade-form')).toBeVisible();await expect(page.getByLabel('매도수량',{exact:true})).toHaveValue('1');expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('INPUT');
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
for(const count of [0,1])test(`sell with ${count} eligible lot defaults safely without saving`,async({page})=>{
 await setup(page);await page.route('**/api/accounts/*/buy-lots**',r=>r.fulfill({json:{data:count?[{id:'71',boughtAt:'2026-10-01T03:00:00Z',unitPrice:'100',remainingQuantity:'2',security:{id:'1',symbol:'000001',name:'종목1'}}]:[]}}));
 await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();await page.getByRole('button',{name:'매도 종목1',exact:true}).click();const next=page.getByRole('button',{name:'선택 후 매도 등록'});if(count){await expect(next).toBeEnabled();await expect(page.getByTestId('sell-candidate-71')).toHaveAttribute('aria-pressed','true');}else {await expect(next).toBeDisabled();await expect(page.getByText('동일 계좌·종목에 매도일 이전 매수 중 잔여수량이 충분한 매수가 없습니다.')).toBeVisible();}
});
test('dividend opens existing form with confirmed amounts and preserves notice on cancel',async({page})=>{
 await setup(page);await page.route('**/api/accounts/*/cash-overview',r=>r.fulfill({json:{data:{account:{id:'1',currentBalance:'10000'},currentYearTax:{year:2026,amount:'0'},monthly:{deposit:'0',withdrawal:'0',dividend:'0'},yearly:{deposit:'0',withdrawal:'0',dividend:'0'},recentTransactions:[]}}}));await page.addInitScript(()=>{(window as any).nativeEntries=[{id:'c'.repeat(64),receivedAt:3,raw:'[미래에셋증권] 권리 입금 안내\n배당금 입금\n계좌번호: 1234-**-5678\n종목명: 종목1\n종목코드: 000001\n입금일자: 2026.10.07\n세전배당금: 1,000원\n세후배당금: 846원'}];});
 await page.goto('/');await page.getByRole('button',{name:'알림 1건',exact:true}).click();await page.getByRole('button',{name:'배당 종목1',exact:true}).click();await expect(page.getByLabel('세전 배당',{exact:true})).toHaveValue('1,000');await expect(page.getByLabel('세후 배당',{exact:true})).toHaveValue('846');expect(await page.evaluate(()=>document.activeElement?.tagName)).not.toBe('INPUT');await page.getByRole('button',{name:'알림 등록 닫기'}).click();await expect(page.getByRole('button',{name:'알림 1건',exact:true})).toBeVisible();
});
test('news notification reaches the news screen before acknowledgement',async({page})=>{
 await setup(page);let read=false;const id='00000000-0000-0000-0000-000000000112';await page.route('**/api/notifications/inbox',r=>r.fulfill({json:{data:{rows:read?[]:[{id,kind:'NEWS',title:'종목1',detail:'신규 소식',accountId:'1',createdAt:'2026-10-07T00:00:00Z'}],total:read?0:1}}}));await page.route('**/api/notifications/events/'+id,r=>r.fulfill({json:{data:{destination:'/detail/stock-news',accountId:'1'}}}));await page.route('**/api/notifications/events/'+id+'/state',r=>{read=true;return r.fulfill({json:{data:{updated:true}}});});await page.goto('/');await page.getByRole('button',{name:'알림 3건',exact:true}).click();await page.getByRole('button',{name:'소식 종목1',exact:true}).click();await expect(page).toHaveURL(/\/detail\/stock-news/);await expect.poll(()=>read).toBe(true);
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
 await page.getByLabel('제세금',{exact:true}).fill('0');await expect(check).not.toBeChecked();await page.getByLabel('제세금',{exact:true}).fill('');await expect(check).not.toBeChecked();await page.getByLabel('세후예수금',{exact:true}).fill('1001');await expect(page.getByLabel('제세금',{exact:true})).toHaveValue('-1');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('제세금을 확인해 주세요.',{exact:true})).toBeVisible();expect(writes).toBe(0);
});

test('durable native click opens unified inbox without saving or completing a trade',async({page})=>{
 await setup(page);await page.addInitScript(()=>{(window as any).nativeOpen='a'.repeat(64);});let writes=0;await page.route('**/api/buy-trades',r=>{writes++;return r.fulfill({json:{data:{}}});});await page.goto('/');await expect(page.getByRole('heading',{name:'알림',exact:true})).toBeVisible();await expect(page.getByRole('dialog').getByText('2건',{exact:true}).first()).toBeVisible();await expect.poll(()=>page.evaluate(()=>(window as any).nativeEntries.length)).toBe(2);await expect.poll(()=>page.evaluate(()=>(window as any).nativeOpen)).toBe('');expect(writes).toBe(0);
});

test('lot selector sorts, styles, scrolls and preserves a valid user choice on refresh',async({page},info)=>{
 await setup(page);let rows=[
  {id:'loss',unitPrice:'140',boughtAt:'2026-10-01T03:00:00Z',remainingQuantity:'10'},
  {id:'new',unitPrice:'100',boughtAt:'2026-10-02T03:00:00Z',remainingQuantity:'2'},
  {id:'first',unitPrice:'100',boughtAt:'2026-10-01T03:00:00Z',remainingQuantity:'10'},
  {id:'flat',unitPrice:'110',boughtAt:'2026-10-01T03:00:00Z',remainingQuantity:'10'},
  ...Array.from({length:8},(_,i)=>({id:'extra'+i,unitPrice:'150',boughtAt:'2026-10-01T03:00:00Z',remainingQuantity:'1000000'}))
 ];let reads=0;
 await page.route('**/api/accounts/*/buy-lots**',r=>{reads++;return r.fulfill({json:{data:rows.map(l=>({...l,security:{id:'1',symbol:'000001',name:'종목1'}}))}});});
 await page.goto('/');await page.getByRole('button',{name:'알림 2건',exact:true}).click();await page.getByRole('button',{name:'매도 종목1',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'연결 매수 선택'}),first=page.getByTestId('sell-candidate-first'),next=dialog.getByRole('button',{name:'선택 후 매도 등록'});
 await expect(first).toHaveAttribute('aria-pressed','true');await expect(next).toBeEnabled();
 expect((await dialog.locator('[data-testid^="sell-candidate-"]').evaluateAll(els=>els.map(e=>e.getAttribute('data-testid')))).slice(0,4)).toEqual(['sell-candidate-first','sell-candidate-new','sell-candidate-flat','sell-candidate-loss']);
 await expect(first.getByTestId('candidate-profit')).toHaveText('+10원');await expect(first.getByTestId('candidate-total')).toHaveText('1,000원');await expect(first).toContainText('10 × 100원');
 expect(await first.evaluate(el=>{const s=getComputedStyle(el);return[s.paddingTop,s.paddingBottom,s.rowGap];})).toEqual(['8px','8px','4px']);
 for(const [id,color] of [['first','rgb(248, 113, 113)'],['flat','rgb(248, 250, 252)'],['loss','rgb(96, 165, 250)']])expect(await page.getByTestId('sell-candidate-'+id).evaluate(el=>getComputedStyle(el).color)).toBe(color);
 const box=(await dialog.boundingBox())!;expect(box.width).toBe(354);expect(Math.abs(box.x+box.width/2-page.viewportSize()!.width/2)).toBeLessThan(1);expect(box.height).toBeLessThanOrEqual(page.viewportSize()!.height-32);
 const list=page.getByTestId('sell-lot-list');expect(await list.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);await list.evaluate(el=>el.scrollTop=9999);await expect(next).toBeInViewport();await expect(dialog.getByRole('heading')).toBeInViewport();await list.evaluate(el=>el.scrollTop=0);
 await page.getByTestId('sell-candidate-new').click();await page.waitForTimeout(3200);await expect(page.getByTestId('sell-candidate-new')).toHaveAttribute('aria-pressed','true');
 const previous=reads;rows=rows.filter(l=>l.id!=='new');await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'hidden',configurable:true});window.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(100);await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});window.dispatchEvent(new Event('visibilitychange'));});await expect.poll(()=>reads).toBeGreaterThan(previous);await expect(first).toHaveAttribute('aria-pressed','true');
 await page.screenshot({animations:'disabled',path:info.outputPath('lot-selector-sorted.png')});await next.click();await expect(page).toHaveURL(/lot=first/);await page.getByTestId('trade-form').getByRole('button',{name:'취소',exact:true}).click();await expect(page.getByRole('button',{name:'알림 2건',exact:true})).toBeVisible();
});

test('trade cards show per-sale Seoul holding days and reserve edit delete controls',async({page},info)=>{
 await setup(page);
 const security={id:'1',name:'아주 긴 종목명 현대자동차',symbol:'000001'};
 const buy={id:'buy',type:'BUY',tradedAt:'2025-12-31T15:00:00Z',security,quantity:'10',unitPrice:'100',amount:'1000',realizedProfitLoss:null};
 const sell=(id:string,tradedAt:string)=>({id,type:'SELL',buyTradeId:'buy',tradedAt,security,quantity:'1',unitPrice:'110',amount:'110',realizedProfitLoss:'10'});
 await page.route('**/api/accounts/*/trades?*',r=>r.fulfill({json:{data:[buy,sell('same','2026-01-01T14:59:59Z'),sell('split','2026-01-03T03:00:00Z')],summary:{realizedProfitLoss:'20',buyAmount:'1000',sellAmount:'220'},daily:[]}}));
 await page.goto('/stocks/1?detailTab=trades');await expect(page.getByTestId('sell-same').getByTestId('trade-holding-days')).toHaveText('보유 0일');await expect(page.getByTestId('sell-split').getByTestId('trade-holding-days')).toHaveText('보유 2일');
 const card=page.getByTestId('sell-same');expect(await card.getByTestId('trade-holding-days').evaluate(el=>{const s=getComputedStyle(el);return[s.fontSize,s.fontWeight,s.color];})).toEqual(['9px','400','rgb(255, 255, 255)']);
 const text=(await card.getByTestId('trade-holding-days').boundingBox())!,icon=(await card.getByRole('button',{name:'same 매도 수정',exact:true}).boundingBox())!;expect(text.x+text.width<=icon.x||text.y>=icon.y+icon.height).toBe(true);
 await page.screenshot({animations:'disabled',path:info.outputPath('trade-holding-days.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('account group counts, long titles and common second-line ignore alignment',async({page},info)=>{
 await setup(page,[]);
 const accounts=[{id:'1',name:'메인 계좌 이름이 아주 길어서 한 줄에 들어가지 않는 경우',brokerName:'미래에셋증권',accountNumber:'1234-12-5678',isDefault:true,enabled:true,buyEnabled:true,sellEnabled:true,dividendEnabled:true,newsEnabled:true,targetEnabled:true},{id:'2',name:'보조',brokerName:'미래에셋증권',accountNumber:'4321-12-8765',isDefault:false,enabled:true,buyEnabled:true,sellEnabled:true,dividendEnabled:true,newsEnabled:true,targetEnabled:true}];
 await page.route('**/api/notifications/settings',r=>r.fulfill({json:{data:{policyRevision:1,accounts,tradeEnabled:true,newsEnabled:true,targetEnabled:true,pushConfigured:true}}}));
 await page.route('**/api/notifications/inbox',r=>r.fulfill({json:{data:{total:3,rows:[{id:'target',kind:'TARGET',accountId:'1',title:'SK하이닉스',detail:'180일 이내 · 20% 목표 도래',createdAt:'2026-10-07T03:00:00Z'},{id:'news',kind:'NEWS',accountId:'1',title:'현대차',detail:'현대차 신규 소식 제목이 아주 길어도 버튼을 밀어내지 않고 한 줄에서 생략해야 합니다',createdAt:'2026-10-07T02:00:00Z'},{id:'second',kind:'NEWS',accountId:'2',title:'기아',detail:'신규 소식',createdAt:'2026-10-07T01:00:00Z'}]}}}));
 await page.goto('/');await page.getByRole('button',{name:'알림 3건',exact:true}).click();const dialog=page.getByRole('dialog');const headers=dialog.getByTestId('notification-account-header');await expect(headers).toHaveCount(2);await expect(headers.first()).toContainText('2건');await expect(headers.last()).toContainText('1건');
 for(const header of await headers.all()){const h=(await header.boundingBox())!,count=(await header.locator('p').last().boundingBox())!;expect(Math.abs(count.x+count.width-h.x-h.width)).toBeLessThan(1);}
 for(const card of await dialog.getByTestId('notification-card').all()){const ignore=(await card.getByRole('button',{name:'무시',exact:true}).boundingBox())!,title=(await card.getByRole('button').first().boundingBox())!;expect(ignore.y).toBeGreaterThanOrEqual(title.y+title.height);expect(await card.evaluate(el=>[getComputedStyle(el).paddingTop,getComputedStyle(el).paddingLeft,getComputedStyle(el).rowGap])).toEqual(['8px','10px','4px']);}
 await page.screenshot({path:info.outputPath('account-groups.png')});
});

test('settings serializes rapid changes, preserves child choices and matches collapsed geometry',async({page},info)=>{
 await setup(page,[]);const account={id:'1',name:'메인',brokerName:'미래에셋증권',accountNumber:'1234-12-5678',isDefault:true,enabled:true,buyEnabled:true,sellEnabled:true,dividendEnabled:true,newsEnabled:true,targetEnabled:true};let revision=0;
 await page.route('**/api/notifications/settings',r=>r.fulfill({json:{data:{policyRevision:revision,accounts:[account],tradeEnabled:true,newsEnabled:true,targetEnabled:true,pushConfigured:true}}}));
 let unblock!:()=>void,first=true;const barrier=new Promise<void>(resolve=>unblock=resolve),writes:any[]=[];
 await page.route('**/api/notifications/settings/accounts/1',async r=>{const body=r.request().postDataJSON();writes.push(body);if(first){first=false;await barrier;}Object.assign(account,body);revision++;await r.fulfill({json:{data:{accounts:[account],policyRevision:revision,tradeEnabled:account.enabled&&account.buyEnabled,newsEnabled:account.enabled&&account.newsEnabled,targetEnabled:account.enabled&&account.targetEnabled,pushConfigured:true}}});});
 await page.goto('/detail/settings?view=notifications');const card=page.getByTestId('account-notifications-1');await expect(card).toBeVisible();expect((await card.boundingBox())!.height).toBe(48);const title=card.getByRole('button',{name:/미래에셋증권 · 메인/});await title.click();const buy=page.getByRole('switch',{name:'메인 매수',exact:true});await buy.click();await buy.click();await buy.click();await expect(buy).not.toBeChecked();unblock();await expect.poll(()=>writes.length).toBe(3);await expect.poll(()=>account.buyEnabled).toBe(false);await expect(buy).not.toBeChecked();const master=page.getByRole('switch',{name:'메인 계좌 알림',exact:true});await master.click();await expect(buy).toBeDisabled();await expect(title).toHaveAttribute('aria-expanded','true');await master.click();await expect(buy).toBeEnabled();await expect(buy).not.toBeChecked();await expect.poll(()=>account.enabled).toBe(true);await page.screenshot({path:info.outputPath('account-settings-expanded.png')});await page.reload();await title.click();await expect(buy).not.toBeChecked();
});

test('another account trade switches context before opening the existing form and preserves cancellation',async({page})=>{
 await setup(page,[{id:'f'.repeat(64),receivedAt:3,raw:'[미래에셋증권] 전량체결\n매매구분: 매수\n계좌번호: 4321-**-8765\n종목명: 종목1\n종목코드: 000001\n체결일자: 2026.10.07\n체결수량: 1주\n체결단가: 110원'}]);
 const accounts=[{id:'1',name:'메인',brokerName:'미래에셋증권',accountNumber:'1234-12-5678',isDefault:true,isActive:true},{id:'2',name:'보조',brokerName:'미래에셋증권',accountNumber:'4321-12-8765',isDefault:false,isActive:true}];let selected='1',writes=0;
 await page.route('**/api/accounts',r=>r.fulfill({json:{data:accounts}}));await page.route('**/api/auth/settings',r=>{selected=r.request().postDataJSON().selectedAccountId;return r.fulfill({json:{data:{selectedAccountId:selected}}});});
 await page.route('**/api/notifications/settings',r=>r.fulfill({json:{data:{policyRevision:1,pushConfigured:true,tradeEnabled:true,newsEnabled:true,targetEnabled:true,accounts:accounts.map(a=>({...a,enabled:true,buyEnabled:true,sellEnabled:true,dividendEnabled:true,newsEnabled:true,targetEnabled:true}))}}}));await page.route('**/api/buy-trades',r=>{writes++;expect(r.request().postDataJSON().accountId).toBe('2');return r.fulfill({json:{data:{id:'91'}}});});
 await page.goto('/');await page.getByRole('button',{name:'알림 1건',exact:true}).click();await page.getByRole('button',{name:'매수 종목1',exact:true}).click();await expect(page.getByTestId('trade-form')).toBeVisible();expect(selected).toBe('2');expect(await page.evaluate(()=>localStorage.getItem('roxstock:user:1:selected-account-id'))).toBe('2');await page.getByTestId('trade-form').getByRole('button',{name:'취소',exact:true}).click();await expect(page.getByRole('button',{name:'알림 1건',exact:true})).toBeVisible();expect(writes).toBe(0);
});

test('OFF account hides native and server rows from both group and floating counts',async({page})=>{
 await setup(page);await page.route('**/api/notifications/settings',r=>r.fulfill({json:{data:{policyRevision:1,pushConfigured:true,tradeEnabled:false,newsEnabled:false,targetEnabled:false,accounts:[{id:'1',name:'메인',brokerName:'미래에셋증권',accountNumber:'1234-12-5678',isDefault:true,enabled:false,buyEnabled:true,sellEnabled:true,dividendEnabled:true,newsEnabled:true,targetEnabled:true}]}}}));await page.route('**/api/notifications/inbox',r=>r.fulfill({json:{data:{total:1,rows:[{id:'old',kind:'TARGET',accountId:'1',title:'종목1',detail:'20% 목표 도래',createdAt:'2026-10-07T00:00:00Z'}]}}}));await page.goto('/');await expect(page.getByRole('button',{name:/^알림 \d+건$/})).toHaveCount(0);expect(await page.evaluate(()=>(window as any).nativeEntries.length)).toBe(2);
});

test('account settings cover and tablet layout preserves long account switch and OFF expansion',async({page},info)=>{
 await setup(page,[]);const accounts=[{id:'1',name:'메인 계좌 이름이 길어도 스위치가 밀려나면 안됩니다',brokerName:'미래에셋',accountNumber:'010-7571-1234-0',isDefault:true,enabled:true},{id:'2',name:'보조',brokerName:'미래에셋',accountNumber:'010-9832-1234-0',isDefault:false,enabled:false}].map(a=>({...a,buyEnabled:true,sellEnabled:true,dividendEnabled:true,newsEnabled:false,targetEnabled:true}));
 await page.route('**/api/notifications/settings',r=>r.fulfill({json:{data:{policyRevision:1,accounts,tradeEnabled:true,newsEnabled:false,targetEnabled:true,pushConfigured:true}}}));
 await page.goto('/detail/settings?view=notifications');const first=page.getByTestId('account-notifications-1'),second=page.getByTestId('account-notifications-2');await expect(first).toBeVisible();const f=(await first.boundingBox())!,s=(await second.boundingBox())!;expect(f.height).toBe(48);expect(s.height).toBe(48);if(info.project.name==='tablet'){expect(s.y).toBe(f.y);expect(s.x).toBeGreaterThan(f.x+f.width);}else{expect(s.x).toBe(f.x);expect(s.y).toBeGreaterThan(f.y+f.height);}
 await first.getByRole('button',{expanded:false}).click();await second.getByRole('button',{expanded:false}).click();await expect(second.getByRole('switch',{name:'보조 매수',exact:true})).toBeDisabled();await expect(second.getByRole('switch',{name:'보조 매수',exact:true})).toBeChecked();const master=(await first.getByRole('switch').first().boundingBox())!,card=(await first.boundingBox())!;expect(Math.abs(master.x+master.width-card.x-card.width+12)).toBeLessThan(1);await page.screenshot({path:info.outputPath('account-settings-figma.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
