import { test, expect, type Page, type Locator } from '@playwright/test';
import { fixture } from './phase3-fixture';
async function setup(page:Page) {
 const control=await fixture(page);
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url());if(!u.pathname.endsWith('/trades'))return route.fallback();
  const rows=[1,2,3,4,5,6].flatMap(id=>[2025,2026].flatMap(year=>['BUY','SELL'].map((type,i)=>({id:`${id}${year}${i}`,type,security:{id:String(id),name:`종목${id}`,symbol:String(id).padStart(6,'0')},tradedAt:`${year}-07-01T03:00:00Z`,quantity:'10',unitPrice:i?'150':'100',amount:i?'1500':'1000',realizedProfitLoss:i?'500':null,buyTradeId:'1'}))));
  const data=u.pathname.includes('/2/')?[]:rows.filter(r=>!u.searchParams.has('securityId')||r.security.id===u.searchParams.get('securityId'));
  return route.fulfill({json:{data,summary:{realizedProfitLoss:'1000',buyAmount:'2000',sellAmount:'3000'},daily:[]}});
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
  if(destination==='list')await expect(page.getByTestId('profit-tabs').getByRole('button',{name:'연도별',exact:true})).toHaveAttribute('aria-pressed','true');
  if(destination==='year'){await expect(page.getByTestId('profit-selected')).toHaveText('2026년');await expect(page.getByTestId('profit-detail-summary')).toContainText('+3,000원');}
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
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
 await expect(page.getByTestId('stock-profit-summary')).not.toContainText('2,000원');
});
