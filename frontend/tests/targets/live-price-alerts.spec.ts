import {test,expect} from './authenticated-test';
import {fixture} from './phase28-fixture';
import type {Page} from '@playwright/test';
const condition=(id='11',amount='220000')=>({id,securityId:'1',symbol:'000001',name:'삼성전자',market:'TOTAL',direction:'BELOW',amount,enabled:true,pausedUntil:null,version:1,status:'LIVE'});
const reach=(id='401',c=condition())=>({...c,id,conditionId:c.id,price:'201000',change:'-7300',rate:'-3.5',observedAt:'2026-11-02T00:41:00Z',createdAt:'2026-11-02T00:41:00Z'});
async function setup(page:Page,seed=false){
 await fixture(page);const state={conditions:seed?[condition()]:[] as any[],events:seed?[reach()]:[] as any[],fail:false,delay:0,monitor:{} as Record<string,unknown>,writes:[] as {method:string;path:string;body:any}[]};
 const stock={id:'1',symbol:'000001',name:'삼성전자',held:true,traded:true,watched:false,quantity:10,purchaseAmount:1000000,marketValue:2000000,profit:1000000,initial:null};
 await page.route('**/api/live-quotes/**',async route=>{const path=new URL(route.request().url()).pathname,method=route.request().method(),body=method==='GET'?undefined:route.request().postDataJSON();
  if(!path.startsWith('/api/live-quotes/alerts'))return route.fulfill({json:{data:{stocks:[stock],ids:['1'],version:'v1'}}});
  if(method==='GET')return route.fulfill({json:{data:{conditions:state.conditions,events:state.events.map(e=>({...e,...{enabled:state.conditions.find(c=>c.id===e.conditionId)?.enabled,version:state.conditions.find(c=>c.id===e.conditionId)?.version,pausedUntil:state.conditions.find(c=>c.id===e.conditionId)?.pausedUntil}})),unreadCount:state.events.length,monitor:{healthy:true,capacity:41,monitoring:state.conditions.length,background:'SERVER_INBOX',systemPush:false,...state.monitor}}}});
  state.writes.push({method,path,body});if(state.delay)await new Promise(r=>setTimeout(r,state.delay));if(state.fail)return route.fulfill({status:503,json:{error:{message:'저장 실패 검증 · 다시 시도해 주세요.'}}});
  if(path.endsWith('acknowledge'))state.events=state.events.filter(e=>body.securityId?e.securityId!==body.securityId:!body.eventIds.includes(e.id));
  else if(method==='POST')state.conditions.push({...condition(String(11+state.conditions.length),body.amount),market:body.market,direction:body.direction});
  else {const id=path.split('/').at(-1)!,row=state.conditions.find(c=>c.id===id);if(method==='DELETE'){state.conditions=state.conditions.filter(c=>c.id!==id);state.events=state.events.filter(e=>e.conditionId!==id);}else {Object.assign(row,body,{version:row.version+1});if(body.pause)row.pausedUntil='2026-11-02T15:00:00Z';}}
  return route.fulfill({json:{data:{id:'11'}}});
 });
 await page.addInitScript(()=>{class Stream extends EventTarget{closed=false;market:string;constructor(url:string){super();this.market=new URL(url,location.origin).searchParams.get('market')!;((window as any).__alertStreams??=[]).push(this);setTimeout(()=>{if(!(window as any).__noInitialPrice)this.emit(222750);},30);}emit(price:number){if(this.closed)return;this.dispatchEvent(new MessageEvent('quotes',{data:JSON.stringify({connection:'CONNECTED',marketOpen:true,limit:41,active:1,quotes:[{symbol:'000001',status:'LIVE',quote:{symbol:'000001',market:this.market,price,change:5430,rate:2.5,observedAt:new Date().toISOString(),receivedAt:Date.now(),source:'KIS'}}]})}));}close(){this.closed=true;}}Object.defineProperty(window,'EventSource',{value:Stream});(window as any).__priceTick=(n:number,market?:string)=>{for(const s of (window as any).__alertStreams)if(!market||s.market===market)s.emit(n);};(window as any).__alertRefresh=()=>{for(const s of (window as any).__alertStreams)if(!s.closed)s.dispatchEvent(new MessageEvent('price-alerts',{data:'{"revision":2}'}));};});
 await page.goto('/live-quotes');await expect(page.getByTestId('live-price')).toHaveText('222,750');
 return state;
}
const bell=(page:Page)=>page.getByRole('button',{name:'삼성전자 금액 알림 설정'});
test('new amount defaults, focus/select, incoming ticks preserve input, validation and retry',async({page},info)=>{
 const state=await setup(page);await bell(page).click();const dialog=page.getByRole('dialog'),input=dialog.getByRole('textbox',{name:'알림금액'});
 await expect(input).toBeFocused();await expect(input).toHaveValue('222,750');expect(await input.evaluate((e:HTMLInputElement)=>[e.selectionStart,e.selectionEnd])).toEqual([0,7]);await expect(input).toHaveAttribute('inputmode','numeric');
 const box=await input.evaluate(e=>e.closest('.MuiInputBase-root')!.parentElement!.getBoundingClientRect().height);expect(box).toBe(36);
 await input.fill('230000');await input.evaluate((e:HTMLInputElement)=>e.setSelectionRange(1,3));await page.evaluate(()=>(window as any).__priceTick(224000));await expect(input).toHaveValue('230,000');expect(await input.evaluate((e:HTMLInputElement)=>[e.selectionStart,e.selectionEnd])).toEqual([1,3]);
 await input.fill('0');await dialog.getByRole('button',{name:'알림 저장'}).click();await expect(dialog.getByText('양수인 원 단위 금액을 입력해 주세요.')).toBeVisible();expect(state.writes).toHaveLength(0);
 await input.fill('230000');state.fail=true;await input.press('Enter');await expect(dialog.getByText(/저장 실패 검증/)).toBeVisible();await expect(input).toHaveValue('230,000');state.fail=false;
 await dialog.getByRole('button',{name:'알림 저장'}).click();await expect(dialog.getByText('230,000원 하락시')).toBeVisible();expect(state.conditions[0].market).toBe('TOTAL');expect(state.writes.filter(w=>w.method==='POST')).toHaveLength(2);
 await page.screenshot({path:info.outputPath('manager.png')});
});
test('edit selection, independent OFF, deletion confirmation and persistence',async({page},info)=>{
 const state=await setup(page,true);await bell(page).click();const dialog=page.getByRole('dialog');await expect(dialog.getByText('220,000원 하락시')).toBeVisible();
 await dialog.getByRole('switch').click();await expect(dialog.getByRole('switch')).toHaveAttribute('aria-checked','false');expect(state.events).toHaveLength(1);
 await dialog.getByRole('button',{name:/편집/}).click();const input=dialog.getByRole('textbox',{name:'알림금액'});await expect(input).toBeFocused();await expect(input).toHaveValue('220,000');expect(await input.evaluate((e:HTMLInputElement)=>e.selectionEnd)).toBe(7);
 await page.screenshot({path:info.outputPath('editor.png')});await input.fill('210000');await input.press('Enter');await expect(dialog.getByText('210,000원 하락시')).toBeVisible();await expect(dialog.getByRole('switch')).toHaveAttribute('aria-checked','false');
 await page.reload();await bell(page).click();await expect(page.getByRole('switch')).toHaveAttribute('aria-checked','false');
 await page.getByRole('button',{name:/삭제/}).click();await expect(page.getByText('선택한 금액 조건을 삭제하시겠습니까? 다른 조건은 유지됩니다.')).toBeVisible();await page.getByRole('button',{name:'확인',exact:true}).click();await expect(page.getByText('등록된 알림이 없습니다.')).toBeVisible();expect(state.conditions).toHaveLength(0);
});
test('frozen arrival values, all five pauses, switches keep inbox; body acknowledges without navigation',async({page},info)=>{
 const state=await setup(page,true);await page.getByRole('button',{name:'실시간 주가 도달 알림 1건'}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByText('도달가(09:41)')).toBeVisible();await expect(dialog.getByText('201,000원')).toBeVisible();await expect(dialog.getByText('-3.50%')).toBeVisible();
 await page.evaluate(()=>(window as any).__priceTick(240000));await expect(dialog.getByText('201,000원')).toBeVisible();
 for(const label of ['30분','1시간','2시간','3시간','하루'])await expect(dialog.getByRole('button',{name:label,exact:true})).toBeVisible();await dialog.getByRole('button',{name:'2시간',exact:true}).click();expect(state.writes.at(-1)?.body.pause).toBe('2h');expect(state.events).toHaveLength(1);
 await dialog.getByRole('switch').click();await expect(dialog.getByRole('switch')).toHaveAttribute('aria-checked','false');expect(state.events).toHaveLength(1);await page.screenshot({path:info.outputPath('reached.png')});
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();await expect(dialog).not.toBeVisible();state.conditions.push(condition('12','210000'));state.events.push(reach('402',state.conditions[1]));await page.locator('[data-quote-id="1"]').getByTestId('live-price').click();await expect(page.getByRole('button',{name:'실시간 주가 도달 알림 0건'})).toBeVisible();await expect(page).toHaveURL(/\/live-quotes$/);expect(state.events).toHaveLength(0);
});
test('title badge 99+, selected arrival acknowledges and routes to exact holding tab; popup history stays correct',async({page})=>{
 const state=await setup(page,true);state.conditions=Array.from({length:105},(_,i)=>condition(String(i+11),String(220000+i)));state.events=state.conditions.map((c,i)=>reach(String(401+i),c));await page.evaluate(()=>(window as any).__alertRefresh());
 await expect(page.getByRole('button',{name:'실시간 주가 도달 알림 105건'})).toBeVisible();await expect(page.getByText('99+', {exact:true})).toBeVisible();await page.getByRole('button',{name:'실시간 주가 도달 알림 105건'}).click();await page.getByRole('button',{name:'삼성전자 보유현황 보기'}).first().click();
 await expect(page).toHaveURL(/\/stocks\/1\?detailTab=holding$/);await page.waitForTimeout(300);await expect(page).toHaveURL(/\/stocks\/1\?detailTab=holding$/);await expect(page.getByRole('tab',{name:'보유 현황',exact:true})).toHaveAttribute('aria-selected','true');expect(state.events).toHaveLength(104);expect(state.writes.at(-1)?.body.eventIds).toEqual(['401']);
});
test('unknown current price stays blank; IME Enter and duplicate submits never save invalid data',async({page})=>{
 const state=await setup(page);await page.addInitScript(()=>(window as any).__noInitialPrice=true);await page.reload();await expect(page.getByTestId('live-price')).toHaveText('—');await bell(page).click();const dialog=page.getByRole('dialog'),input=dialog.getByRole('textbox',{name:'알림금액'});await expect(input).toHaveValue('');await expect(input).toBeFocused();
 await dialog.getByRole('button',{name:'알림 저장'}).click();expect(state.writes).toHaveLength(0);await input.fill('220000');await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});expect(state.writes).toHaveLength(0);
 state.delay=500;await input.press('Enter');await input.press('Enter');await expect(dialog.getByText('220,000원 하락시')).toBeVisible();expect(state.writes).toHaveLength(1);
});
test('editing a different saved market reuses its isolated quote stream without changing the main market or input',async({page})=>{
 const state=await setup(page,true);state.conditions.push({...condition('12','230000'),market:'KRX'});await page.evaluate(()=>(window as any).__alertRefresh());await bell(page).click();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'230000원 알림 편집'}).click();const input=dialog.getByRole('textbox',{name:'알림금액'});await expect(input).toHaveValue('230,000');await expect(input).toBeFocused();await expect(dialog.getByText('KRX',{exact:true})).toBeVisible();
 await input.fill('235000');await page.evaluate(()=>(window as any).__priceTick(240000,'KRX'));await expect(dialog.getByText('240,000원')).toBeVisible();await expect(input).toHaveValue('235,000');await expect(page.getByTestId('live-price')).toHaveText('222,750');await input.press('Enter');await expect(dialog.getByText('235,000원 하락시')).toBeVisible();expect(state.conditions[1].market).toBe('KRX');expect(state.writes.at(-1)?.body.market).toBeUndefined();await dialog.getByRole('button',{name:/목표가 알림 추가/}).click();await expect(dialog.getByText('통합',{exact:true})).toBeVisible();await expect(dialog.getByRole('textbox',{name:'알림금액'})).toHaveValue('222,750');
});
test('receiver configuration and detector failures remain visible without erasing pending events or quotes',async({page})=>{
 const state=await setup(page,true);state.monitor={sourceConnection:'DISABLED'};await page.evaluate(()=>(window as any).__alertRefresh());await page.getByRole('button',{name:'실시간 주가 도달 알림 1건'}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByText(/실시간 수신 연결이 준비되지 않았습니다/)).toBeVisible();await expect(dialog.getByText('201,000원')).toBeVisible();
 state.monitor={healthy:false};await page.evaluate(()=>(window as any).__alertRefresh());await expect(dialog.getByText(/알림 감시 연결·처리를 확인해 주세요/)).toBeVisible();await expect(dialog.getByText('201,000원')).toBeVisible();await expect(page.getByTestId('live-price')).toHaveText('222,750');expect(state.events).toHaveLength(1);expect(state.writes).toHaveLength(0);
});
test('a stock name tap during body acknowledgement shares the pending request and still navigates',async({page})=>{
 const state=await setup(page,true);state.delay=400;await page.getByTestId('live-price').click();await page.getByRole('button',{name:'삼성전자 종목 요약 보기'}).click();await expect(page).toHaveURL(/\/stocks\/1\?detailTab=summary$/);expect(state.events).toHaveLength(0);expect(state.writes.filter(w=>w.path.endsWith('acknowledge'))).toHaveLength(1);expect(state.writes[0].body).toEqual({securityId:'1'});
});

