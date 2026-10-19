import {test,expect,type Page} from '@playwright/test';
import {recentBuys} from '../../src/pages/dashboard/recentBuysData';
import type {BuyLotDto} from '../../src/data/roxstockApi';
import {fixture as baseFixture} from './phase28-fixture';
const stamp='2026-10-13T03:00:00Z';
async function fixture(page:Page){
 await baseFixture(page);
 await page.clock.install({time:new Date(stamp)});
 const state={count:1,secondaryFailure:false,hold:false,holdAccount:'',held:0,moreChanged:false,moreHold:false,moreHeld:0};
 let release=()=>{},releaseMore=()=>{};
 const rows=(accountId:string)=>Array.from({length:7},(_,i)=>({id:String(20-i),security:{id:'1',symbol:'005930',name:`${accountId}계좌매수${i}`},quantity:'10',remainingQuantity:i===0?'4':'10',soldQuantity:i===0?'6':'0',unitPrice:'100',currentPrice:'150',profitLoss:i===0?'200':'500',returnRate:'50',boughtAt:`2026-10-${String(12-i).padStart(2,'0')}T00:00:00Z`,buyDate:`2026-10-${String(12-i).padStart(2,'0')}`,holdingDays:i+1,priceUpdatedAt:stamp,remainingPurchaseAmount:i===0?'400':'1000',remainingMarketValue:i===0?'600':'1500'}));
 await page.route('**/api/pages/home*',async route=>{
  const id=new URL(route.request().url()).searchParams.get('accountId')??'1';
  if(state.hold&&(!state.holdAccount||state.holdAccount===id)){state.held++;await new Promise<void>(r=>release=r);}
  const count=id==='1'?state.count:0;
  await route.fulfill({json:{data:{accounts:[1,2].map(n=>({id:String(n),name:`계좌${n}`,brokerName:'CI',isActive:true,isDefault:n===1,cashBalance:'1000'})),accountId:id,
   dashboard:{accountId:id,totalAssetValue:'2500',cashBalance:'1000',stockValue:'1500',purchaseAmount:'1000',unrealizedProfitLoss:'500',unrealizedReturnRate:'50',pricingComplete:true,calculatedAt:stamp,holdings:[{securityId:'1',symbol:'005930',name:`${id}계좌보유`,quantity:'10',averagePurchasePrice:'100',purchaseAmount:'1000',currentPrice:'150',marketValue:'1500',unrealizedProfitLoss:'500',unrealizedReturnRate:'50'}]},
   recent:{data:rows(id).slice(0,5),meta:{accountId:id,count:5,total:7,more:true,months:0}},
   targets:state.secondaryFailure?null:{data:Array.from({length:count},(_,i)=>({lotId:String(i+1),securityId:'1',symbol:'005930',name:`${id}계좌목표${i}`,buyDate:'2026-10-01',holdingDays:12,remainingQuantity:'4',unitPrice:'100',currentPrice:'150',returnRate:'50',profitLoss:'200',priceUpdatedAt:stamp})),meta:{accountId:id,conditionsVersion:1,enabled:true,total:count,unavailableCount:0,unavailable:[],calculatedAt:stamp,asOfDate:'2026-10-13',priceAsOf:stamp,priceAsOfLatest:stamp}}}}});
 });
 const recentResponse=async(path:string)=>{
  if(state.moreHold){state.moreHeld++;await new Promise<void>(r=>releaseMore=r);}
  const id=new URL('http://fixture/api'+path).pathname.split('/')[3]!;
  // A sale during expansion removes one old Lot; another partially sold Lot changes.
  const data=state.moreChanged?rows(id).slice(1).map((r,i)=>i===0?{...r,remainingQuantity:'2',profitLoss:'100'}:r):rows(id);
  return {data,meta:{accountId:id,count:data.length,total:data.length,more:false,months:1}};
 };
 await page.route('**/api/accounts/*/recent-buys?*',async route=>{
  const u=new URL(route.request().url());await route.fulfill({json:await recentResponse(u.pathname.slice(4)+u.search)});
 });
 await page.route('**/api/pages/read',async route=>{
  const paths=route.request().postDataJSON().paths as string[];
  if(!paths.some(path=>path.includes('/recent-buys')))return route.fallback();
  await route.fulfill({json:{data:await Promise.all(paths.map(async path=>({status:200,body:path.includes('/recent-buys')?await recentResponse(path):{data:[]}})))}});
 });
 return {state,release:()=>{state.hold=false;release();},releaseMore:()=>{state.moreHold=false;releaseMore();}};
}
async function order(page:Page,has:boolean){
 await expect(page.getByTestId('target-arrival-card')).toHaveCount(1);
 await expect.poll(()=>page.getByTestId('home-shell').evaluate(n=>[...n.children].map(el=>el.getAttribute('data-testid') === 'home-summary-area' ? 'summary' : el.querySelector('h2')?.textContent))).toEqual(has?['summary','목표가 도래','보유종목','최근 매수']:['summary','보유종목','최근 매수','목표가 도래']);
 if(has){const a=await page.getByTestId('target-arrival-card').boundingBox(),b=await page.getByTestId('home-holdings-card').boundingBox();expect(Math.abs(b!.y-a!.y-a!.height-8)).toBeLessThan(2);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
}
const switchAccount=(page:Page,id:string)=>page.evaluate(id=>{localStorage.setItem('roxstock-selected-account-id',id);window.dispatchEvent(new Event('roxstock-selected-account'));},id);

test('0/1/many targets reorder once; same-account refresh and secondary failure retain results and location',async({page},info)=>{
 const f=await fixture(page);await page.goto('/');await expect(page.getByTestId('target-lot')).toHaveCount(1);await order(page,true);
 await page.screenshot({path:info.outputPath('one-target-top.png')});
 await page.locator('main').evaluate(n=>{const card=n.querySelector('[data-testid="target-arrival-card"]')!;n.scrollTop+=card.getBoundingClientRect().top-n.getBoundingClientRect().top;});await page.screenshot({path:info.outputPath('one-target-above-holdings.png')});
 f.state.count=6;await page.clock.fastForward(60_000);await expect(page.getByTestId('target-lot')).toHaveCount(5);await order(page,true);
 await page.getByTestId('target-arrival-card').getByRole('button',{name:'더보기',exact:true}).click();await expect(page.getByTestId('target-lot')).toHaveCount(6);
 await page.locator('main').evaluate(n=>n.scrollTop=120);const scroll=await page.locator('main').evaluate(n=>n.scrollTop);
 f.state.hold=true;f.state.count=0;await page.clock.fastForward(60_000);await expect.poll(()=>f.state.held).toBeGreaterThan(0);
 await expect(page.getByTestId('target-lot')).toHaveCount(6);await order(page,true);expect(await page.locator('main').evaluate(n=>n.scrollTop)).toBe(scroll);
 f.release();await expect(page.getByTestId('target-lot')).toHaveCount(0);await order(page,false);await page.screenshot({path:info.outputPath('zero-target.png'),fullPage:true});
 f.state.count=1;await page.clock.fastForward(60_000);await expect(page.getByTestId('target-lot')).toHaveCount(1);await order(page,true);
 f.state.secondaryFailure=true;await page.clock.fastForward(60_000);await expect(page.getByTestId('target-arrival-card').getByRole('button',{name:'다시 시도',exact:true})).toBeVisible();await expect(page.getByTestId('target-lot')).toHaveCount(1);await order(page,true);
 f.state.secondaryFailure=false;f.state.count=0;await page.clock.fastForward(60_000);await expect(page.getByTestId('target-lot')).toHaveCount(0);await order(page,false);
});
test('switching accounts clears old targets, recent buys and holdings while the new account is loading',async({page},info)=>{
 const f=await fixture(page);await page.goto('/');await expect(page.getByTestId('target-lot')).toHaveCount(1);await order(page,true);
 f.state.hold=true;await switchAccount(page,'2');await expect.poll(()=>f.state.held).toBeGreaterThan(0);
 await expect(page.getByTestId('target-lot')).toHaveCount(0);await expect(page.getByTestId('recent-buy-lot')).toHaveCount(0);await expect(page.getByTestId('home-holding')).toHaveCount(0);await order(page,false);
 await page.screenshot({path:info.outputPath('account-loading.png'),fullPage:true});f.release();await expect(page.getByTestId('home-holding')).toContainText('2계좌보유');await expect(page.getByTestId('recent-buy-lot').first()).toContainText('2계좌매수0');await order(page,false);
 await switchAccount(page,'1');await expect(page.getByTestId('target-lot')).toHaveCount(1);await order(page,true);await expect(page.getByTestId('home-holding')).toContainText('1계좌보유');
 // A late response for B must not replace A after another switch.
 f.state.hold=true;f.state.holdAccount='2';const held=f.state.held;await switchAccount(page,'2');await page.clock.fastForward(60_000);await expect.poll(()=>f.state.held).toBeGreaterThan(held);
 await switchAccount(page,'1');f.release();await expect(page.getByTestId('target-lot')).toHaveCount(1);await expect(page.getByTestId('home-holding')).toContainText('1계좌보유');await order(page,true);
});
test('recent partial quantity and profit agree; expanded snapshot removes newly sold Lots, updates quantities and preserves scroll/row navigation',async({page},info)=>{
 const f=await fixture(page);await page.goto('/');const card=page.getByTestId('recent-buys-card');
 await expect(card.getByTestId('recent-buy-lot')).toHaveCount(5);await expect(card).toContainText('총 5건');await expect(card.getByTestId('recent-buy-lot').first()).toContainText('4 × 100원');await expect(card.getByTestId('recent-buy-lot').first()).toContainText('200원');
 f.state.moreHold=true;f.state.moreChanged=true;await card.getByRole('button',{name:'더보기',exact:true}).click();await expect.poll(()=>f.state.moreHeld).toBe(1);await expect(card.getByTestId('recent-buy-lot')).toHaveCount(5);
 f.releaseMore();await expect(card.getByTestId('recent-buy-lot')).toHaveCount(6);await expect(card).toContainText('총 6건');await expect(card).not.toContainText('1계좌매수0');await expect(card.getByTestId('recent-buy-lot').first()).toContainText('2 × 100원');await expect(card.getByTestId('recent-buy-lot').first()).toContainText('100원');await expect(card.getByRole('button',{name:'더보기',exact:true})).toBeDisabled();
 await card.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('recent-after-sale.png')});await card.getByRole('button',{name:'초기화',exact:true}).click();await expect(card.getByTestId('recent-buy-lot')).toHaveCount(5);await expect(card).not.toContainText('1계좌매수0');await expect(card.getByTestId('recent-buy-lot').first()).toContainText('2 × 100원');
 await card.getByTestId('recent-buy-lot').first().click();await expect(page).toHaveURL(/\/stocks\/1\?detailTab=holding/);
});

test('legacy range helper filters sold Lots before five-row selection, count and more',()=>{
 const rows=Array.from({length:12},(_,i)=>({id:String(12-i),boughtAt:`2026-09-${String(30-i).padStart(2,'0')}T00:00:00Z`,remainingQuantity:i<5?'0':'4'})) as BuyLotDto[];
 const first=recentBuys(rows,'2026-10-19',0),more=recentBuys(rows,'2026-10-19',1);
 expect(first.rows.map(r=>r.id)).toEqual(['7','6','5','4','3']);expect(first.count).toBe(5);expect(first.more).toBe(true);
 expect(more.rows.map(r=>r.id)).toEqual(['7','6','5','4','3','2','1']);expect(more.count).toBe(7);expect(more.more).toBe(false);
});
