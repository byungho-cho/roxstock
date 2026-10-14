import {test,expect,type Page} from '@playwright/test';
import {fixture} from './phase3-fixture';
const lot=(id:string,date:string,quantity:string)=>({id,boughtAt:date,buyDate:date.slice(0,10),quantity,unitPrice:'100',remainingQuantity:'0',soldQuantity:quantity,sellTrades:[],security:{id:'1',name:'종목1',symbol:'000001',marketType:'KOSPI'}});
const previous=[lot('9007199254740992','2026-10-01T03:00:00Z','11'),lot('99','2025-10-01T03:00:00Z','99'),lot('9007199254740993','2026-10-01T03:00:00Z','20')];
async function buyFixture(page:Page,delay=false,empty=false){
 await fixture(page);let release!:()=>void;const reads:string[]=[];
 await page.route('**/api/accounts/*/buy-lots**',async route=>{
  const url=new URL(route.request().url());reads.push(url.pathname+url.search);
  if(delay&&url.searchParams.get('remainingOnly')==='false')await new Promise<void>(r=>{release=r;});
  return route.fulfill({json:{data:!empty&&url.pathname.includes('/1/')&&url.searchParams.get('securityId')==='1'?previous:[]}});
 });
 return {reads,release:()=>release(),ready:()=>!!release};
}
test('new buy uses registered quantity of latest fully sold lot; edit keeps saved quantity',async({page},info)=>{
 const f=await buyFixture(page);await page.goto('/trade?type=buy&stock=1');
 const quantity=page.getByRole('textbox',{name:'매수수량'}),price=page.getByRole('textbox',{name:'매수가격'});
 await expect(quantity).toHaveValue('20');await expect(price).toBeFocused();
 expect(f.reads.some(r=>r.includes('remainingOnly=false')&&r.includes('securityId=1'))).toBe(true);
 await quantity.fill('7');await expect(quantity).toHaveValue('7');
 await page.screenshot({path:info.outputPath('buy-prefill.png')});
 await page.route('**/api/buy-trades/*',r=>r.fulfill({json:{data:{...previous[0],id:'9007199254740992',account:{id:'1'},quantity:'3',memo:null,cashTransaction:null}}}));
 await page.goto('/trade?type=buy&stock=1&edit=9007199254740992');await expect(quantity).toHaveValue('3');
});
test('no previous buy or another stock uses blank quantity and quantity focus',async({page})=>{
 await buyFixture(page);await page.goto('/trade?type=buy&stock=2');
 const quantity=page.getByRole('textbox',{name:'매수수량'});await expect(quantity).toHaveValue('');await expect(quantity).toBeFocused();
});
test('delayed previous purchase cannot overwrite user quantity or focus',async({page})=>{
 const f=await buyFixture(page,true);await page.goto('/trade?type=buy&stock=1');await expect.poll(f.ready).toBe(true);
 const quantity=page.getByRole('textbox',{name:'매수수량'});await quantity.fill('42');await page.getByRole('textbox',{name:'메모'}).fill('입력 중');
 f.release();await expect(quantity).toHaveValue('42');await expect(page.getByRole('textbox',{name:'메모'})).toBeFocused();
});
test('account switch ignores delayed previous account and focuses the new blank quantity',async({page})=>{
 const f=await buyFixture(page,true);await page.goto('/trade?type=buy&stock=1');await expect.poll(f.ready).toBe(true);f.release();
 await expect(page.getByRole('textbox',{name:'매수수량'})).toHaveValue('20');
 await page.unroute('**/api/accounts/*/buy-lots**');await page.route('**/api/accounts/2/buy-lots**',r=>r.fulfill({json:{data:[]}}));
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
 await expect(page.getByRole('textbox',{name:'매수수량'})).toHaveValue('');await expect(page.getByRole('textbox',{name:'매수수량'})).toBeFocused();
});
test('late previous-account buy response never changes new-account quantity or focus',async({page})=>{
 await fixture(page);let release!:()=>void;
 await page.route('**/api/accounts/*/buy-lots**',async r=>{
  const url=new URL(r.request().url());
  if(url.pathname.includes('/1/')&&url.searchParams.get('remainingOnly')==='false')await new Promise<void>(resolve=>{release=resolve;});
  return r.fulfill({json:{data:url.pathname.includes('/1/')?previous:[]}});
 });
 await page.goto('/trade?type=buy&stock=1');await expect.poll(()=>!!release).toBe(true);
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
 const quantity=page.getByRole('textbox',{name:'매수수량'});await expect(quantity).toHaveValue('');await expect(quantity).toBeFocused();
 release();await expect(quantity).toHaveValue('');await expect(quantity).toBeFocused();
});
test('fixed settings menu survives account API failure with a local reason',async({page})=>{
 await fixture(page);await page.route('**/api/accounts',r=>r.fulfill({status:503,json:{error:{message:'조회 실패'}}}));
 await page.goto('/detail/settings');await expect(page.getByTestId('settings-menu')).toContainText('계좌 관리');
 await expect(page.getByTestId('settings-menu')).toContainText('조회 실패');await expect(page.getByTestId('settings-menu').getByText('목표가 도래 조건',{exact:true})).toBeVisible();
});
test('fixed more/settings menus paint without account API or deferred editor code',async({page},info)=>{
 await fixture(page);let release!:()=>void,modules=0;
 await page.route('**/api/accounts',async r=>{await new Promise<void>(resolve=>{release=resolve;});return r.fallback();});
 await page.route('**/src/pages/more/MoreScreens.tsx*',async r=>{modules++;await new Promise(()=>{});return r.fallback();});
 await page.goto('/more');await expect(page.getByTestId('more-menu')).toBeVisible();expect(modules).toBe(0);
 await page.getByRole('navigation',{name:'하단 메뉴'}).getByRole('button',{name:'설정',exact:true}).click();
 await expect(page.getByTestId('settings-menu').getByText('계좌 관리',{exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('settings-menu-pending.png')});
 await expect.poll(()=>!!release).toBe(true);release();
});
test('fast data hides indicator, slow data shows it without moving chart or metrics',async({page})=>{
 await fixture(page);await page.goto('/assets');await expect(page.getByTestId('analysis-chart')).toBeVisible();await expect(page.getByTestId('analysis-compound')).toContainText('현재년도의 복리계획이 없습니다.');
 await expect(page.locator('[data-loading-indicator="visible"]')).toHaveCount(0);
 const region=page.getByTestId('analysis-chart-region'),metrics=page.getByTestId('analysis-performance');
 const before={height:(await region.boundingBox())!.height,y:(await metrics.boundingBox())!.y};let release!:()=>void;
 await page.route('**/api/accounts/*/asset-history**',async r=>{await new Promise<void>(resolve=>{release=resolve;});return r.fallback();});
 await page.clock.install({time:new Date('2026-10-07T03:00:00Z')});await page.clock.pauseAt(new Date('2026-10-07T03:00:01Z'));await page.getByRole('button',{name:'3개월',exact:true}).click();await expect.poll(()=>!!release).toBe(true);
 await expect(region.locator('[data-loading-indicator]')).toHaveCount(0);
 await expect(region.getByRole('status')).toContainText('조회 중');
 await page.clock.runFor(250);expect((await region.boundingBox())!.height).toBe(before.height);expect((await metrics.boundingBox())!.y).toBe(before.y);
 release();await page.clock.resume();await expect(page.getByTestId('analysis-chart')).toBeVisible();expect((await metrics.boundingBox())!.y).toBe(before.y);
});
