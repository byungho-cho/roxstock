import {profitFixture,profitStatisticsFixture} from './profit-aggregate-fixture';
import {tradeFixtureData} from './trade-summary-fixture';
import { test, expect, type Page, type Locator } from './authenticated-test';
import { fixture } from './phase3-fixture';
async function setup(page:Page) {
 const control=await fixture(page);
 await page.route('**/api/**',async route=>{
    // Legacy endpoint fixture: exercise rollback compatibility; tuning-01 covers the unified APIs.
    if(new URL(route.request().url()).pathname.startsWith('/api/pages/'))return route.fulfill({status:404,json:{error:{message:'Legacy API fixture'}}});

  const u=new URL(route.request().url());if(!/\/(trades|investment-profit|statistics)$/.test(u.pathname))return route.fallback();
  const rows=[1,2,3,4,5,6].flatMap(id=>[2025,2026].flatMap(year=>['BUY','SELL'].map((type,i)=>({id:`${id}${year}${i}`,type,security:{id:String(id),name:`종목${id}`,symbol:String(id).padStart(6,'0')},tradedAt:`${year}-07-01T03:00:00Z`,quantity:'10',unitPrice:i?'150':'100',amount:i?'1500':'1000',realizedProfitLoss:i?'500':null,buyTradeId:'1'}))));
  const data=u.pathname.includes('/2/')?[]:rows.filter(r=>!u.searchParams.has('securityId')||r.security.id===u.searchParams.get('securityId'));
  if(u.pathname.endsWith('/statistics')){const account=u.pathname.includes('/2/')?'2':'1',security=u.searchParams.get('securityId')!;return route.fulfill({json:profitStatisticsFixture(account,security,profitFixture(account,data,[],[],undefined,security))});}
  if(u.pathname.endsWith('/investment-profit'))return route.fulfill({json:profitFixture(u.pathname.includes('/2/')?'2':'1',data,[],[],undefined,u.searchParams.get('securityId')??undefined)});
  return route.fulfill({json:{data:tradeFixtureData(u,data),summary:{realizedProfitLoss:'1000',buyAmount:'2000',sellAmount:'3000'},daily:[]}});
 });return control;
}
async function swipe(target:Locator,dx:number){await target.evaluate((el,dx)=>{for(const [type,x] of [['touchstart',200],['touchmove',200+dx],['touchend',200+dx]] as const){const touch=new Touch({identifier:1,target:el,clientX:x,clientY:180});el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[touch],changedTouches:[touch]}));}},dx);}
const region=(page:Page)=>page.viewportSize()!.width<600?page.locator('main'):page.getByTestId('stock-right');
async function open(page:Page,tab='summary'){await page.goto('/stocks/1?detailTab='+tab);await expect(page.getByTestId('stock-detail-content')).toHaveAttribute('data-list-condition',JSON.stringify(['1',tab]));}
test('all tabs persist across next and previous swipe',async({page})=>{
 await setup(page);for(const [tab,label] of [['summary','요약'],['holding','보유 현황'],['trades','거래내역']]){
  await open(page,'holding');await page.getByRole('tab',{name:label,exact:true}).click();await swipe(page.locator('[data-detail-swipe]').first(),-130);await expect(page.getByTestId('stock-detail-content')).toHaveAttribute('data-list-condition',JSON.stringify(['2',tab]));await expect(page.getByRole('tab',{name:label,exact:true})).toHaveAttribute('aria-selected','true');await swipe(page.locator('[data-detail-swipe]').first(),130);await expect(page.getByTestId('stock-detail-content')).toHaveAttribute('data-list-condition',JSON.stringify(['1',tab]));
 }
});
test('summary metrics, distinct links and both back paths restore scroll',async({page},info)=>{
 await setup(page);await open(page);const summary=page.getByTestId('stock-profit-summary');await expect(summary).toContainText('2,000원');await expect(summary).toContainText('+1,000원');
 for(const [selector,destination] of [['stock-profit-summary','stock'],['stock-annual-heading','list'],['stock-annual-row','year']]){
  const link=page.getByTestId(selector).first();await link.scrollIntoViewIfNeeded();const saved=await region(page).evaluate(e=>e.scrollTop);await link.click();await expect(page).toHaveURL(/investment-profit/);
  if(destination==='stock'){await expect(page.getByTestId('profit-selected')).toHaveText('종목1');await expect(page.getByTestId('profit-detail-summary')).toContainText('2,000원');}
  if(destination==='list'){await expect(page.getByTestId('profit-stock-years')).toBeVisible();await expect(page.getByTestId('profit-year-card')).toHaveCount(2);}
  if(destination==='year'){await expect(page.getByRole('heading',{name:'2026년',exact:true})).toBeInViewport();await expect(page.getByTestId('profit-year-card').first()).toContainText('+500원');}
  await page.goBack();await expect(summary).toBeAttached();await expect.poll(()=>region(page).evaluate(e=>e.scrollTop)).toBeCloseTo(saved,0);
  await link.click();await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(summary).toBeAttached();await expect.poll(()=>region(page).evaluate(e=>e.scrollTop)).toBeCloseTo(saved,0);
 }
 await summary.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('summary.png')});
});
test('trade year bar opens stock total profit and restores trades',async({page})=>{
 await setup(page);await open(page,'trades');const link=page.getByTestId('trade-year-title').first();await expect(link).toContainText('(상세보기)');await link.click();await expect(page.getByTestId('profit-selected')).toHaveText('종목1');await expect(page.getByTestId('profit-detail-summary')).toContainText('전체 거래 요약');await page.goBack();await expect(page.getByRole('tab',{name:'거래내역',exact:true})).toHaveAttribute('aria-selected','true');
});
test('quarter filters hold chart heading below fixed header',async({page},info)=>{
 await setup(page);await page.goto('/detail/investment');const heading=page.getByTestId('investment-chart-heading');await expect(heading).toBeAttached();for(const label of ['1분기','2분기','3분기','4분기','전체']){await page.getByRole('button',{name:label,exact:true}).click();await expect.poll(async()=>heading.evaluate(e=>Math.abs(e.getBoundingClientRect().top-document.querySelector('main')!.getBoundingClientRect().top))).toBeLessThan(3);}await page.screenshot({path:info.outputPath('quarter.png')});
});

test('loading completion preserves quarter alignment and account data stays isolated',async({page})=>{
 const control=await setup(page);await page.goto('/detail/investment');await expect(page.getByTestId('investment-value')).toContainText('165,000');
 control.hold();await page.getByRole('button',{name:'이전 연도',exact:true}).click();await page.getByRole('button',{name:'1분기',exact:true}).click();await page.getByRole('button',{name:'2분기',exact:true}).click();control.release();
 await expect(page.getByTestId('investment-page')).toHaveAttribute('data-restoration-ready','true');
 const heading=page.getByTestId('investment-chart-heading');await expect.poll(()=>heading.evaluate(e=>Math.abs(e.getBoundingClientRect().top-document.querySelector('main')!.getBoundingClientRect().top))).toBeLessThan(3);
 await open(page);await expect(page.getByTestId('stock-profit-summary')).toContainText('2,000원');
 await page.evaluate(()=>{localStorage.setItem('roxstock:user:fixture-user:selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
 await expect(page.getByTestId('stock-profit-summary')).not.toContainText('2,000원');
});

test('summary defers holding lots and stock trade detail; profit detail loads annual aggregate',async({page})=>{
 await setup(page);const reads:URL[]=[];page.on('request',r=>{if(r.method()==='GET')reads.push(new URL(r.url()));});
 await open(page);await expect(page.getByTestId('stock-profit-summary')).toContainText('2,000원');
 expect(reads.filter(u=>u.pathname.endsWith('/buy-lots')&&u.searchParams.get('securityId')==='1')).toHaveLength(0);
 expect(reads.filter(u=>u.pathname.endsWith('/trades')&&u.searchParams.get('securityId')==='1')).toHaveLength(0);
 expect(reads.filter(u=>u.pathname.endsWith('/investment-capital'))).toHaveLength(0);
 await page.getByRole('tab',{name:'보유 현황',exact:true}).click();await expect.poll(()=>reads.filter(u=>u.pathname.endsWith('/buy-lots')).length).toBeGreaterThan(0);
 await page.getByRole('tab',{name:'요약',exact:true}).click();await page.getByTestId('stock-profit-summary').click();await expect(page.getByTestId('profit-detail-summary')).toBeVisible();
 // Account-wide navigation and the stock-scoped summary must have independent cache entries.
 await expect.poll(()=>reads.filter(u=>u.pathname.endsWith('/investment-profit')).map(u=>u.searchParams.get('securityId')).sort()).toEqual([null,'1'].sort());
 expect(reads.filter(u=>u.pathname.endsWith('/investment-profit')&&u.searchParams.get('securityId')==='1')).toHaveLength(1);
 expect(reads.filter(u=>u.pathname.endsWith('/investment-capital'))).toHaveLength(0);
 expect(reads.filter(u=>u.pathname.endsWith('/trades')&&u.searchParams.has('to')&&!u.searchParams.has('securityId'))).toHaveLength(0);
});

test('trades list and year totals include sells only while retaining linked buy details',async({page})=>{
 await setup(page);let buysOnly=false;
 const buy=(id:string,year:number)=>({id,type:'BUY',security:{id:'1',name:'종목1',symbol:'000001'},tradedAt:`${year}-01-01T03:00:00Z`,quantity:'10',unitPrice:'100',amount:'1000',realizedProfitLoss:null});
 await page.route('**/api/accounts/*/trades?*',async route=>{const rows=[buy('b24',2024),buy('b25',2025),buy('b26',2026),...buysOnly?[]:[{id:'s25',type:'SELL',security:{id:'1',name:'종목1',symbol:'000001'},tradedAt:'2025-07-01T03:00:00Z',quantity:'5',unitPrice:'150',amount:'750',realizedProfitLoss:'250',buyTradeId:'b25'}]];await route.fulfill({json:{data:tradeFixtureData(new URL(route.request().url()),rows),summary:{realizedProfitLoss:buysOnly?'0':'250',buyAmount:'3000',sellAmount:buysOnly?'0':'750'},daily:[]}});});
 await open(page,'trades');const year=page.getByTestId('trade-year-2025');await expect(page.getByTestId('trade-year-title')).toHaveCount(1);await expect(year.getByTestId('trade-year-title')).toContainText('1건');await expect(year.getByTestId('trade-year-title')).toContainText('250원');await expect(page.getByTestId('sell-s25')).toContainText('5 × 100원');await expect(page.locator('[data-testid^="buy-"]')).toHaveCount(0);await expect(page.getByRole('button',{name:'s25 매도 수정',exact:true})).toBeAttached();
 buysOnly=true;await page.reload();await expect(page.getByTestId('stock-detail-content')).toContainText('내용이 없습니다.');await expect(page.getByTestId('trade-year-title')).toHaveCount(0);
});
