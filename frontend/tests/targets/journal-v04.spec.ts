import { test, expect, type Page } from '@playwright/test';
import { fixture } from './stock-input-fixture';
import { journalTotals, type JournalEntry } from '../../src/pages/journal/journalMath';
const isTablet = (page: Page) => page.viewportSize()!.width >= 600;
const scroll = (page: Page) => isTablet(page) ? page.locator('[data-scroll-region="journal-detail"]') : page.locator('main');
const left = (page: Page) => page.locator('[data-scroll-region="journal-calendar"]');
const name = '긴종목명 검증용 우선주';
const entries: JournalEntry[] = [
  ...Array.from({length: 12}, (_, i) => ({ id: i===0?'linked0':'b'+i, type: 'buy' as const, date: '2026-09-18', stockId: '1', stockName: i ? '매수종목'+i : name, quantity: 10+i, price: 70000+i*1000 })),
  ...Array.from({length: 12}, (_, i) => ({ id: 's'+i, type: 'sell' as const, date: '2026-09-18', stockId: '1', stockName: i ? '매도종목'+i : name+' 긴 이름을 여러 줄로 표시해도 원가와 금액 열을 침범하지 않습니다', quantity: 2+i, price: i===1 ? 90000 : 110000+i*1000, buyPrice: i===1 ? 100000 : 70000+i*2000, lotId: 'linked'+i })),
];
const totals = journalTotals(entries);
const format = (n: number) => Math.round(n).toLocaleString('ko-KR')+'원';
async function setup(page: Page) {
 await fixture(page);
 let linkedPrice=70000;
 await page.route('**/api/accounts',route=>route.fulfill({json:{data:[{id:'a',name:'계좌 A',brokerName:'검사',cashBalance:'1',isActive:true,isDefault:true},{id:'b',name:'계좌 B',brokerName:'검사',cashBalance:'1',isActive:true}]}}));
 await page.route('**/api/accounts/*/trades**', route => {
  const url = new URL(route.request().url());
  const data = (url.pathname.includes('/accounts/a/')?entries:[]).filter(entry => entry.date >= (url.searchParams.get('from')??'') && entry.date <= (url.searchParams.get('to')??'9999')).map(entry => ({
   id: entry.id, type: entry.type.toUpperCase(), buyTradeId: entry.lotId??entry.id, tradedAt: entry.date+'T03:00:00Z',
   security: {id: '1', symbol: '005380', name: entry.stockName, marketType: 'KOSPI'},
   quantity: String(entry.quantity), unitPrice: String(entry.price), amount: String(entry.quantity*entry.price),
   realizedProfitLoss: entry.type==='sell' ? String((entry.price-entry.buyPrice!)*entry.quantity) : null, memo: null,
  }));
  return route.fulfill({json: {data, summary:{buyAmount:String(totals.buy),sellAmount:String(totals.sell),realizedProfitLoss:String(totals.profit)},daily:[]}});
 });
 await page.route('**/api/accounts/*/buy-lots**', route => {
  const remainingOnly = new URL(route.request().url()).searchParams.get('remainingOnly');
  expect(['true', 'false']).toContain(remainingOnly);
  if (remainingOnly === 'true') return route.fulfill({json:{data:[]}});
  return route.fulfill({json:{data:entries.filter(entry=>entry.type==='sell').map(entry=>({id:entry.lotId,boughtAt:'2026-08-01T03:00:00Z',buyDate:'2026-08-01',unitPrice:String(entry.lotId==='linked0'?linkedPrice:entry.buyPrice),quantity:'30',remainingQuantity:'0',soldQuantity:'30',security:{id:'1',symbol:'005380',name:entry.stockName,marketType:'KOSPI'},sellTrades:[]}))}});
 });
 await page.route('**/api/buy-trades/linked0**',route=>{
  if(route.request().method()==='PATCH'){linkedPrice=Number(route.request().postDataJSON().unitPrice);return route.fulfill({json:{data:{id:'linked0',remainingQuantity:'0',cashBalanceAdjusted:false}}});}
  return route.fulfill({json:{data:{id:'linked0',type:'BUY',account:{id:'a',name:'계좌 A'},security:{id:'1',name:name,symbol:'005380',marketType:'KOSPI'},boughtAt:'2026-08-01T03:00:00Z',quantity:'30',soldQuantity:'30',remainingQuantity:'0',unitPrice:String(linkedPrice),memo:null,cashTransaction:null,sellTrades:[]}}});
 });
 await page.goto('/journal?date=2026-09-18');
 await expect(page.getByTestId('journal-entry-s0')).toContainText('140,000원');
}
async function shot(page: Page, tag: string, project: string) {
 const buffer=await page.screenshot({path:'test-results/targets/journal-'+tag+'-'+project+'.png'});
 console.log('ROX_JOURNAL_SCREENSHOT '+JSON.stringify({tag,project,image:buffer.toString('base64')}));
}

test('calendar keeps six rows, equal columns, opaque chip text and existing period/swipe/date navigation', async({page}, info)=>{
 await setup(page);
 const grid=page.getByTestId('journal-calendar-grid'), card=page.getByTestId('journal-calendar-card');
 await expect(grid.getByRole('button')).toHaveCount(42);
 expect((await card.boundingBox())!.height).toBe(302);
 const metrics=await grid.getByRole('button').evaluateAll(cells=>cells.slice(0,7).map(el=>el.getBoundingClientRect().width));
 expect(Math.max(...metrics)-Math.min(...metrics)).toBeLessThan(.1);
 const cell=grid.getByRole('button',{name:/^2026-09-18 /});
 await expect(cell).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(cell).toHaveAttribute('aria-pressed','true');
 for(const type of ['buy','sell']) {
  const chip=cell.getByTestId('journal-chip-'+type);
  await expect(chip).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(chip).toHaveCSS('opacity','1');
  await expect(chip).toHaveCSS('border-top-width','0px');
  await expect(chip).toHaveCSS('background-color',type==='buy'?'rgba(64, 134, 87, 0.7)':'rgba(207, 74, 83, 0.7)');
 }
 await page.getByRole('button',{name:'이전 달',exact:true}).click();
 await expect(grid.getByRole('button',{name:/^2026-08-18 /})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'다음 달',exact:true}).click();
 await expect(cell).toHaveAttribute('aria-pressed','true');
 const swipe=isTablet(page)?left(page):card.locator('..');
 await swipe.dispatchEvent('touchstart',{touches:[{identifier:1,clientX:300,clientY:100}]});
 await swipe.dispatchEvent('touchend',{changedTouches:[{identifier:1,clientX:30,clientY:105}]});
 await expect(grid.getByRole('button',{name:/^2026-10-18 /})).toHaveAttribute('aria-pressed','true');
 await page.waitForTimeout(360);
 await page.getByRole('button',{name:'2026년 10월, 월 선택'}).click();
 await page.getByRole('button',{name:'2026년 2월 선택'}).click();
 await expect(grid.getByRole('button')).toHaveCount(42);
 expect((await card.boundingBox())!.height).toBe(302);
 await page.getByRole('button',{name:'2026년 2월, 월 선택'}).click();
 await page.getByRole('button',{name:'2026년 9월 선택'}).click();
 await grid.getByRole('button',{name:/^2026-09-18 /}).click();
 await shot(page,'calendar',info.project.name);
});

test('shared buy/sell rows use matching Lot and partial quantity, real counts and totals; long text stays in its column',async({page},info)=>{
 await setup(page);
 const transactions=page.getByTestId('journal-transactions');
 await expect(transactions.getByRole('button')).toHaveCount(24);
 await expect(page.getByTestId('journal-entry-s0').getByTestId('transaction-cost')).toHaveText('140,000원');
 await expect(page.getByTestId('journal-entry-s0').getByTestId('transaction-profit')).toHaveText('+80,000원');
 await expect(page.getByTestId('journal-entry-s1').getByTestId('transaction-cost')).toHaveText('300,000원');
 await expect(page.getByTestId('journal-entry-s1').getByTestId('transaction-profit')).toHaveText('−30,000원');
 await expect(page.getByTestId('journal-day-summary')).toContainText(format(totals.buy));
 await expect(page.getByTestId('journal-day-summary')).toContainText(format(totals.sell));
 const overflow=await transactions.locator('p').evaluateAll(elements=>elements.filter(el=>el.scrollWidth>el.clientWidth+1).map(el=>el.textContent));
 expect(overflow).toEqual([]);
 await page.getByRole('button',{name:'일별손익 보기'}).click();
 await expect(page.getByTestId('journal-total-profit')).toHaveText('+'+format(totals.profit!));
 await expect(page.getByTestId('journal-transactions').getByRole('button')).toHaveCount(24);
 await expect(page.getByTestId('journal-entry-s0').getByTestId('transaction-cost')).toHaveText('140,000원');
 await shot(page,'profit',info.project.name);
});

test('cover body or tablet columns scroll independently, date stays pinned, clearance and scrollbars preserve geometry',async({page},info)=>{
 await setup(page);
 const main=page.locator('main'), right=scroll(page);
 const header=page.locator('header'), nav=page.locator('.MuiBottomNavigation-root:visible');
 expect((await header.boundingBox())!.height).toBe(44);
 expect((await page.getByRole('button',{name:'오늘 날짜로 이동'}).boundingBox())!.height).toBe(32);
 expect((await nav.boundingBox())!.height).toBe(44);
 expect(await main.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 const calendar=page.getByTestId('journal-calendar-card');
 expect((await calendar.boundingBox())!.x).toBe(8);
 if(isTablet(page)){
  const r=page.locator('[data-scroll-region="journal-detail"]');
  const l=left(page);
  expect((await r.boundingBox())!.x-((await l.boundingBox())!.x+(await l.boundingBox())!.width)).toBe(8);
  const maximum=await l.evaluate(el=>Math.max(0,el.scrollHeight-el.clientHeight));
  const expected=Math.min(40,maximum);
  if(page.viewportSize()!.height===396)expect(maximum).toBeGreaterThan(40);
  else {expect(maximum).toBe(0);await expect(page.getByRole('scrollbar',{name:'매매일지 달력 스크롤'})).toHaveCount(0);}
  await l.evaluate((el, top)=>el.scrollTop=top,expected);
  await expect.poll(()=>l.evaluate(el=>el.scrollTop)).toBe(expected);
  expect(await main.evaluate(el=>el.scrollTop)).toBe(0);
  await r.evaluate(el=>el.scrollTop=420);
  await expect.poll(()=>r.evaluate(el=>el.scrollTop)).toBe(420);
  expect(await l.evaluate(el=>el.scrollTop)).toBe(expected);
 }
 await page.getByRole('button',{name:'일별손익 보기'}).click();
 await expect(page.getByTestId('journal-date-selector')).toBeVisible();
 const before=(await page.getByTestId('journal-date-selector').boundingBox())!;
 expect(before.y).toBe(44);
 expect(before.height).toBe(52);
 expect((await page.getByTestId('journal-date-card').boundingBox())!.height).toBe(44);
 expect(await right.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(420);
 await right.evaluate(el=>el.scrollTop=420);
 await expect.poll(()=>right.evaluate(el=>el.scrollTop)).toBe(420);
 expect((await page.getByTestId('journal-date-selector').boundingBox())!.y).toBe(44);
 const pinned=await page.getByTestId('journal-date-selector').boundingBox();
 expect(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('[data-testid="journal-date-selector"]'),{x:pinned!.x+20,y:pinned!.y+48})).toBe(true);
 expect((await page.getByTestId('journal-bottom-clearance').boundingBox())!.height).toBe(80);
 const geometry=await main.boundingBox();
 await page.waitForTimeout(1300);
 expect(await main.boundingBox()).toEqual(geometry);
 if(isTablet(page)) {
  const bar=page.getByRole('scrollbar',{name:'매매일지 상세 스크롤'});
  await expect(bar).toHaveCSS('opacity','0');
  await right.evaluate(el=>el.scrollTop=430);
  await expect(bar).toHaveCSS('opacity','1');
  expect((await bar.boundingBox())!.width).toBe(4);
  expect((await bar.boundingBox())!.x).toBeLessThanOrEqual(page.viewportSize()!.width-4);
 }
 await right.evaluate(el=>el.scrollTop=el.scrollHeight);
 await shot(page,'bottom',info.project.name);
});

test('month date and real scrolling survive daily return and external browser return',async({page})=>{
 await setup(page);
 const target=scroll(page);
 await target.evaluate(el=>el.scrollTop=420);
 await expect.poll(()=>target.evaluate(el=>el.scrollTop)).toBe(420);
 const leftBefore=isTablet(page)?Math.min(40,await left(page).evaluate(el=>Math.max(0,el.scrollHeight-el.clientHeight))):0;
 if(isTablet(page))await left(page).evaluate((el, top)=>el.scrollTop=top,leftBefore);
 // Keyboard activation leaves the saved list position intact.
 await page.getByRole('button',{name:'일별손익 보기'}).evaluate(el=>(el as HTMLElement).click());
 await expect(page.getByTestId('journal-date-selector')).toBeVisible();
 await page.getByRole('button',{name:'다음 날짜',exact:true}).click();
 await expect(page.getByTestId('journal-date-selector')).toContainText('9월 19일');
 await page.getByRole('button',{name:'이전 날짜',exact:true}).click();
 await expect(page.getByTestId('journal-entry-s0')).toContainText('140,000원');
 if(isTablet(page)) {
  // Calendar selection restores the existing selected-date transactions mode.
  await page.getByRole('button',{name:/^2026-09-18 /}).evaluate(el=>(el as HTMLElement).click());
 } else await page.getByRole('button',{name:'뒤로가기',exact:true}).click();
 await expect.poll(()=>target.evaluate(el=>el.scrollTop)).toBe(420);
 if(isTablet(page))await expect.poll(()=>left(page).evaluate(el=>el.scrollTop)).toBe(leftBefore);
 await page.locator('.MuiBottomNavigation-root:visible').getByRole('button',{name:'종목목록',exact:true}).click();
 await expect(page).toHaveURL(/stocks/);
 await page.goBack();
 await expect(page).toHaveURL(/journal\?date=2026-09-18/);
 await expect.poll(()=>scroll(page).evaluate(el=>el.scrollTop)).toBe(420);
 await expect(page.getByRole('button',{name:/^2026-09-18 /})).toHaveAttribute('aria-pressed','true');
 if(isTablet(page))await expect.poll(()=>left(page).evaluate(el=>el.scrollTop)).toBe(leftBefore);
});

test('query failure and missing matched Lot stay distinct from valid empty and zero',async({page})=>{
 await setup(page);
 await page.route('**/api/accounts/*/buy-lots**',route=>route.fulfill({json:{data:[]}}));
 await page.reload();
 await expect(page.getByTestId('journal-entry-s0').getByTestId('transaction-cost')).toHaveText('—');
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','b');window.dispatchEvent(new Event('roxstock-selected-account'));});
 await expect(page.getByTestId('journal-transactions')).toContainText('내용이 없습니다.');
 await expect(page.getByTestId('journal-entry-s0')).toHaveCount(0);
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','a');window.dispatchEvent(new Event('roxstock-selected-account'));});
 await expect(page.getByTestId('journal-entry-s0')).toBeAttached();
 await page.route('**/api/accounts/*/trades**',route=>route.fulfill({status:500,json:{error:{message:'검사 조회 실패'}}}));
 await page.reload();
 await expect(page.getByRole('alert')).toContainText('거래 조회 실패',{timeout:20000});
 await expect(page.getByTestId('journal-day-summary')).toContainText('—');
 await expect(page.getByTestId('journal-transactions')).toHaveCount(0);
});

test('raw decimals are evaluated before display rounding and unknown profits do not become zero',async()=>{
 const partial: JournalEntry={id:'partial',type:'sell',date:'2026-09-18',stockId:'1',stockName:'검사',quantity:3,price:100.49,buyPrice:90.11};
 const result=journalTotals([partial]);
 expect(result.cost).toBeCloseTo(270.33,8);
 expect(result.sell).toBeCloseTo(301.47,8);
 expect(result.profit).toBeCloseTo(31.14,8);
 expect(journalTotals([{...partial,buyPrice:undefined,profit:undefined}]).profit).toBeUndefined();
 expect(journalTotals([]).profit).toBe(0);
});

test('existing buy edit refreshes matched Lot costs on return and keeps the selected journal day',async({page})=>{
 await setup(page);
 await page.getByRole('button',{name:'일별손익 보기'}).click();
 await page.getByTestId('journal-entry-linked0').click();
 await expect(page).toHaveURL(/journal\/trade\/buy\/linked0/);
 await page.getByRole('button',{name:'거래 수정',exact:true}).click();
 await expect(page.getByTestId('trade-form')).toBeVisible();
 const price=page.getByRole('textbox',{name:'매수가격',exact:true});
 await price.fill('80000');await price.press('Tab');
 await page.getByRole('button',{name:'변경',exact:true}).click();
 await expect(page).toHaveURL(/journal\/trade\/buy\/linked0/);
 await page.getByRole('button',{name:'뒤로가기',exact:true}).click();
 await expect(page).toHaveURL(/journal\?date=2026-09-18/);
 await expect(page.getByTestId('journal-entry-s0').getByTestId('transaction-cost')).toHaveText('160,000원');
 await expect(page.getByTestId('journal-entry-s0').getByTestId('transaction-profit')).toHaveText('+60,000원');
 if(isTablet(page))await expect(page.getByRole('button',{name:/^2026-09-18 /})).toHaveAttribute('aria-pressed','true');
});

test('monthly summary follows the calendar month independently of selected day and replaces navigation profit',async({page},info)=>{
 await setup(page);const monthly=page.getByTestId('journal-month-summary');
 await expect(monthly.getByRole('heading',{name:'월별 거래현황'})).toBeAttached();
 await expect(monthly.getByTestId('journal-month-buy')).toContainText('12건');await expect(monthly.getByTestId('journal-month-buy')).toContainText(format(totals.buy));
 await expect(monthly.getByTestId('journal-month-sell')).toContainText('12건');await expect(monthly.getByTestId('journal-month-sell')).toContainText(format(totals.sell));await expect(monthly.getByTestId('journal-month-profit')).toContainText(format(totals.profit!));
 await expect(page.getByText(/월손익/)).toHaveCount(0);
 await page.getByRole('button',{name:/^2026-09-17 /}).click();await expect(monthly.getByTestId('journal-month-buy')).toContainText('12건');await expect(page.getByTestId('journal-day-card')).toContainText('총 0건');
 await page.getByRole('button',{name:'다음 달',exact:true}).click();await expect(monthly).toContainText('2026년 10월');await expect(monthly.getByTestId('journal-month-buy')).toContainText('0건');await expect(monthly.getByTestId('journal-month-sell')).toContainText('0원');
 await page.getByRole('button',{name:'이전 달',exact:true}).click();await expect(monthly.getByTestId('journal-month-sell')).toContainText('12건');
 await monthly.scrollIntoViewIfNeeded();const frame=await monthly.boundingBox();expect(frame!.width).toBeGreaterThan(300);expect(await monthly.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:info.outputPath('monthly-summary.png')});
});

test('daily summary aligns labels and counts/rate; daily and monthly sell amounts follow profit colors',async({page},info)=>{
 await setup(page);const day=page.getByTestId('journal-day-summary'),monthly=page.getByTestId('journal-month-summary');
 for(const type of ['buy','sell','profit']){const cell=day.getByTestId('journal-day-'+type);await expect(cell.getByTestId('day-summary-label')).toHaveCSS('text-align','left');await expect(cell.getByTestId('day-summary-detail')).toHaveCSS('text-align','right');await expect(cell.getByTestId('day-summary-label')).toHaveText(type==='buy'?'매수':type==='sell'?'매도':'손익');}
 await expect(day.getByTestId('journal-day-buy')).toHaveCSS('border-left-width','0px');for(const key of ['sell','profit']){await expect(day.getByTestId('journal-day-'+key)).toHaveCSS('border-left-width','1px');await expect(day.getByTestId('journal-day-'+key)).toHaveCSS('border-left-color','rgb(51, 65, 85)');}await day.scrollIntoViewIfNeeded();await day.screenshot({path:info.outputPath('daily-summary-dividers.png')});
 await expect(day.getByTestId('journal-day-buy').getByTestId('day-summary-detail')).toHaveText('12건');await expect(day.getByTestId('journal-day-sell').getByTestId('day-summary-detail')).toHaveText('12건');await expect(day.getByTestId('journal-day-profit').getByTestId('day-summary-detail')).toHaveText('+36.7%');
 await expect(day.getByTestId('journal-day-sell').getByTestId('day-summary-amount')).toHaveCSS('color','rgb(255, 92, 102)');await expect(monthly.getByTestId('journal-month-sell').locator('div').last()).toHaveCSS('color','rgb(255, 92, 102)');
 await page.route('**/api/accounts/*/trades**',route=>route.fulfill({json:{data:[{id:'negative',type:'SELL',buyTradeId:'missing',security:{id:'1',symbol:'005380',name:'검증'},tradedAt:'2026-09-18T03:00:00Z',quantity:'1',unitPrice:'80',amount:'80',realizedProfitLoss:'-20'}],summary:{buyAmount:'0',sellAmount:'80',realizedProfitLoss:'-20'},daily:[]}}));await page.reload();await expect(day.getByTestId('journal-day-sell').getByTestId('day-summary-amount')).toHaveCSS('color','rgb(66, 158, 255)');await expect(monthly.getByTestId('journal-month-sell').locator('div').last()).toHaveCSS('color','rgb(66, 158, 255)');
 await page.route('**/api/accounts/*/trades**',route=>route.fulfill({json:{data:[],summary:{buyAmount:'0',sellAmount:'0',realizedProfitLoss:'0'},daily:[]}}));await page.reload();await expect(day.getByTestId('journal-day-buy').getByTestId('day-summary-detail')).toHaveText('0건');await expect(day.getByTestId('journal-day-profit').getByTestId('day-summary-detail')).toHaveText('—');await expect(day.getByTestId('journal-day-sell').getByTestId('day-summary-amount')).toHaveCSS('color','rgb(248, 250, 252)');await expect(monthly.getByTestId('journal-month-sell').locator('div').last()).toHaveCSS('color','rgb(248, 250, 252)');
});

test('day arrows and swipes keep monthly summary at the viewport top across long and empty days',async({page},info)=>{
 await setup(page);const monthly=page.getByTestId('journal-month-summary'),day=page.getByTestId('journal-day-card');
 const gap=()=>monthly.evaluate(el=>{const host=innerWidth>=600?document.querySelector('[data-scroll-region="journal-calendar"]')!:document.querySelector('main')!;return Math.abs(el.getBoundingClientRect().top-host.getBoundingClientRect().top);});
 const pinned=async()=>{await expect.poll(gap).toBeLessThan(1);if(isTablet(page))await expect.poll(()=>page.locator('[data-scroll-region="journal-detail"]').evaluate(el=>el.scrollTop)).toBe(0);};
 await day.scrollIntoViewIfNeeded();await page.getByRole('button',{name:'거래내역 다음 날짜',exact:true}).click();await expect(page.getByTestId('journal-day-heading')).toContainText('2026.09.19');await pinned();
 await expect.poll(()=>day.evaluate(el=>{const main=document.querySelector('main')!;const monthly=document.querySelector('[data-testid="journal-month-summary"]')!;return el.getBoundingClientRect().height-(innerWidth>=600?main.clientHeight:main.clientHeight-monthly.getBoundingClientRect().height-8);})).toBeGreaterThanOrEqual(-1);
 await page.getByRole('button',{name:'거래내역 이전 날짜',exact:true}).click();await expect(page.getByTestId('journal-entry-s0')).toBeAttached();await pinned();
 const swipe=async(dx:number)=>page.getByTestId('journal-day-summary').evaluate((el,dx)=>{for(const [type,x] of [['touchstart',200],['touchmove',200+dx],['touchend',200+dx]] as const){const touch=new Touch({identifier:1,target:el,clientX:x,clientY:180});el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[touch],changedTouches:[touch]}));}},dx);
 await swipe(-120);await expect(page.getByTestId('journal-day-heading')).toContainText('2026.09.19');await pinned();await swipe(120);await expect(page.getByTestId('journal-day-heading')).toContainText('2026.09.18');await pinned();
 // A month-crossing response changes many rows after the initial day navigation.
 let release!:()=>void;await page.route('**/api/accounts/*/trades**',async route=>{const url=new URL(route.request().url());if(url.searchParams.get('from')==='2027-01-01'&&url.searchParams.get('to')==='2027-01-31')await new Promise<void>(resolve=>release=resolve);return route.fallback();});
 await page.getByRole('button',{name:'2026년 9월, 월 선택',exact:true}).first().click();await page.getByRole('button',{name:'2026년 12월 선택',exact:true}).click();await page.getByRole('button',{name:/^2026-12-31 /}).evaluate(el=>(el as HTMLElement).click());await day.scrollIntoViewIfNeeded();await page.getByRole('button',{name:'거래내역 다음 날짜',exact:true}).click();await expect(page.getByTestId('journal-day-heading')).toContainText('2027.01.01');await pinned();await expect.poll(()=>!!release).toBe(true);release();await expect(monthly).toHaveAttribute('aria-busy','false');await pinned();
 await page.screenshot({path:info.outputPath('day-navigation-pinned.png')});
});
