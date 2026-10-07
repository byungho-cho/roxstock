import { expect, test, type Page, type Locator } from '@playwright/test';
import { fixture as stockFixture } from './stock-input-fixture';
import { calculateProfit, sortProfit, rate, amount } from '../../src/pages/investment-profit/profitData';
import { QueryClient } from '@tanstack/react-query';
import { storedQueryOptions } from '../../src/data/storedQueryOptions';
import { invalidatePortfolio } from '../../src/data/invalidatePortfolio';
const names=['아주긴이름의이익종목','손실이큰종목','보합종목','작은손실종목'];
const profits=[350,-1000,0,-10];
const trades=names.flatMap((name,i)=>[
 {id:'b'+i,type:'BUY' as const,buyTradeId:'b'+i,tradedAt:'2024-01-02T03:00:00Z',security:{id:String(i),symbol:String(i),name,marketType:'KOSPI' as const},quantity:'10',unitPrice:'100',amount:'1000',realizedProfitLoss:null,memo:null},
 {id:'s'+i,type:'SELL' as const,buyTradeId:'b'+i,tradedAt:'2026-09-30T15:00:00Z',security:{id:String(i),symbol:String(i),name,marketType:'KOSPI' as const},quantity:'5',unitPrice:String(100+profits[i]/5),amount:String(500+profits[i]),realizedProfitLoss:String(profits[i]),memo:null},
]);
async function fixture(page:Page){
 const requests:string[]=[];let release:()=>void=()=>{},held=false;
 await page.clock.install({time:new Date('2026-10-07T03:00:00Z')});
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;requests.push(url.pathname+url.search);
  if(path==='/api/accounts')return route.fulfill({json:{data:[{id:'1',isActive:true,isDefault:true,name:'기본'},{id:'2',isActive:true,name:'다른 계좌'}]}});
  if(path.endsWith('/dashboard'))return route.fulfill({json:{data:{account:{id:'1'},cashBalance:'1000',purchaseAmount:'2000',stockValue:'3000',totalAssetValue:'4000',holdings:[],pricingComplete:true,latestPriceUpdatedAt:'2026-10-07T03:00:00Z'}}});
  if(path.endsWith('/target-arrivals'))return route.fulfill({json:{data:[],meta:{accountId:'1',total:0,enabled:true,unavailableCount:0,priceAsOf:'2026-10-07T03:00:00Z'}}});
  if(held&&path.includes('/1/')&&path.endsWith('/trades'))await new Promise<void>(r=>{release=r;});
  if(path.endsWith('/investment-capital'))return route.fulfill({json:{data:[{year:2026,date:'2026-10-01',investmentAmount:'107317732',status:'AVAILABLE'},{year:2024,date:null,investmentAmount:null,status:'YEAR_END_MISSING'}]}});
  if(path.endsWith('/trades')){const empty=path.includes('/2/');let records=empty?[]:trades;
   if(url.searchParams.has('from'))records=records.filter(r=>r.tradedAt.slice(0,10)>=url.searchParams.get('from')!&&r.tradedAt.slice(0,10)<=url.searchParams.get('to')!);
   return route.fulfill({json:{data:records,daily:[],summary:{buyAmount:'4000',sellAmount:'1340',realizedProfitLoss:path.includes('/2/')?'0':'39720500'}}});}
  if(path.endsWith('/asset-history'))return route.fulfill({json:{data:[{date:'2026-10-01',investmentAmount:'107317732',totalAssetValue:'81845732',updatedAt:'2026-10-01T14:00:00Z'}],summary:{}}});
  if(path.endsWith('/investment-baseline'))return route.fulfill({json:{data:null}});
  if(path.endsWith('/cash-transactions')){const rows=url.searchParams.get('types')==='DIVIDEND'?[{id:'d',transactionType:'DIVIDEND',transactionDate:'2026-10-01T03:00:00Z',dividend:{securityId:'0',securityName:names[0],netAmount:'10'}}]:[];return route.fulfill({json:{data:rows,meta:{total:rows.length}}});}
  if(path.endsWith('/buy-lots'))return route.fulfill({json:{data:[]}});
  return route.fulfill({json:{data:[]}});
 });
 return {requests,hold:()=>{held=true;},release:()=>{held=false;release();}};
}
async function swipe(node:Locator, dx:number, dy=0){
 await node.evaluate((target,{dx,dy})=>{
  const start={identifier:0,target,clientX:180,clientY:200};
  const dispatch=(type:string,x:number,y:number,end=false)=>{
   const t=new Touch({...start,clientX:x,clientY:y});target.dispatchEvent(new TouchEvent(type,{bubbles:true,touches:end?[]:[t],changedTouches:[t]}));
  };
  dispatch('touchstart',180,200);dispatch('touchmove',180+dx,200+dy);dispatch('touchend',180+dx,200+dy,true);
 },{dx,dy});
}
test('signed sorting, total-buy denominator, zero and mutation-invalidated cache',async({},info)=>{
 test.skip(info.project.name!=='cover-370x465');
 const data=calculateProfit(trades,[],'2026-10-07');
 expect(sortProfit(data.stocks).map(r=>r.id)).toEqual(['0','2','3','1']);
 expect(sortProfit(data.stocks,true).map(r=>r.id)).toEqual(['1','3','2','0']);
 expect(rate(data.stocks.find(r=>r.id==='0')!.totals.trading,data.stocks.find(r=>r.id==='0')!.totals.buy)).toBe('+35.0%');
 expect(rate(amount('39720500'),amount('107317732'))).toBe('+37.0%');expect(rate(0n,0n)).toBe('—');
 const client=new QueryClient();let reads=0;const options={...storedQueryOptions,queryKey:['investment-profit','1'],queryFn:async()=>++reads};
 await client.fetchQuery(options);await client.fetchQuery(options);expect(reads).toBe(1);
 await invalidatePortfolio(client);await client.fetchQuery(options);expect(reads).toBe(2);client.clear();
});
test('profit capital, signed order toggle, neighbors and body swipe stop at ends; static cache survives focus/re-entry',async({page},info)=>{
 const f=await fixture(page);await page.goto('/detail/investment-profit');await expect(page.getByTestId('profit-total')).toHaveText('-650원');
 if(info.project.name.startsWith('cover'))await page.getByTestId('profit-list-row').filter({hasText:'2026'}).click();
 await expect(page.getByTestId('profit-capital-asof')).toContainText('2026-10-01');
 await expect(page.getByTestId('profit-detail-summary')).toContainText('107,317,732원');
 if(info.project.name.startsWith('cover'))await page.goBack();
 await page.getByRole('button',{name:'종목별',exact:true}).click();
 expect(await page.getByTestId('profit-list-row').evaluateAll(n=>n.map(x=>x.getAttribute('data-id')))).toEqual(['0','2','3','1']);
 await page.getByRole('button',{name:'손익액 오름차순 정렬'}).click();
 expect(await page.getByTestId('profit-list-row').evaluateAll(n=>n.map(x=>x.getAttribute('data-id')))).toEqual(['1','3','2','0']);
 await page.getByTestId('profit-list-row').first().click();await expect(page.getByTestId('profit-selected')).toHaveText(names[1]);
 await expect(page.getByRole('button',{name:/이전 상세/})).toBeDisabled();
 await swipe(page.getByTestId('profit-detail'),70);await expect(page.getByTestId('profit-selected')).toHaveText(names[1]);
 await swipe(page.getByTestId('profit-detail'),-50);await expect(page.getByTestId('profit-selected')).toHaveText(names[3]);
 await swipe(page.getByTestId('profit-detail'),-70,100);await expect(page.getByTestId('profit-selected')).toHaveText(names[3]);
 await page.getByRole('button',{name:/다음 상세/}).click();await expect(page.getByTestId('profit-selected')).toHaveText(names[2]);
 await page.getByRole('button',{name:/다음 상세/}).click();await expect(page.getByTestId('profit-selected')).toHaveText(names[0]);
 await expect(page.getByRole('button',{name:/다음 상세/})).toBeDisabled();
 await expect(page.getByTestId('profit-detail-summary')).toContainText('+35.0%');
 const monthly=page.getByTestId('profit-compact-row');
 expect(await monthly.filter({hasText:'매매'}).getByTestId('profit-percent').evaluate(n=>getComputedStyle(n).color)).toBe('rgb(251, 113, 133)');
 expect(await monthly.filter({hasText:'배당'}).getByTestId('profit-percent').evaluate(n=>getComputedStyle(n).color)).toBe('rgb(250, 199, 31)');
 const previous=page.getByRole('button',{name:/이전 상세/});expect(await previous.evaluate(n=>getComputedStyle(n).whiteSpace)).toBe('nowrap');
 const before=f.requests.length;await page.clock.fastForward(600000);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));expect(f.requests.length).toBe(before);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('profit.png')});
 await page.locator('.MuiBottomNavigation-root:visible').getByRole('button',{name:'홈',exact:true}).click();
 await expect(page).toHaveURL(/\/$/);
 await page.goBack();await expect(page.getByTestId('profit-selected')).toHaveText(names[0]);
 expect(f.requests.filter(r=>r.includes('investment-capital'))).toHaveLength(1);
});
test('annual realized summary is independent of evaluation and quarterly chart filter',async({page},info)=>{
 await fixture(page);await page.goto('/detail/investment');await expect(page.getByTestId('investment-value')).toHaveText('81,845,732원');
 await expect(page.getByTestId('investment-trading-profit')).toHaveText('+39,720,500원');
 await expect(page.getByTestId('investment-current')).toContainText('올해 평가손익 +37.0%');
 await page.getByRole('button',{name:'1분기',exact:true}).click();await expect(page.getByTestId('investment-row')).toHaveCount(0);
 await expect(page.getByTestId('investment-trading-profit')).toHaveText('+39,720,500원');
 await page.screenshot({path:info.outputPath('investment.png')});
});
test('journal entire transaction/empty card and daily-profit body swipe; buttons and taps remain active',async({page},info)=>{
 await fixture(page);await page.goto('/journal?date=2026-10-01');await expect(page.getByTestId('journal-day-heading')).toContainText('2026.10.01');
 const card=page.getByTestId('journal-day-card');await swipe(card,-50);await expect(page.getByTestId('journal-day-heading')).toContainText('2026.10.02');
 await swipe(page.getByTestId('journal-transactions'),50);await expect(page.getByTestId('journal-day-heading')).toContainText('2026.10.01');
 await swipe(card,-50,100);await expect(page.getByTestId('journal-day-heading')).toContainText('2026.10.01');
 await swipe(page.getByRole('button',{name:'거래내역 다음 날짜'}),-50);await expect(page.getByTestId('journal-day-heading')).toContainText('2026.10.01');
 await page.getByRole('button',{name:'거래내역 다음 날짜'}).click();await expect(page.getByTestId('journal-day-heading')).toContainText('2026.10.02');
 await page.getByRole('button',{name:/일별손익 보기/}).click();await expect(page.getByTestId('journal-date-card')).toContainText('2일');
 await swipe(page.getByTestId('journal-total-profit'),-50);await expect(page.getByTestId('journal-date-card')).toContainText('3일');
 await swipe(page.getByTestId('journal-date-card'),50);await expect(page.getByTestId('journal-date-card')).toContainText('2일');
 await swipe(page.getByTestId('journal-total-profit'),0);await page.getByRole('button',{name:'다음 날짜',exact:true}).click();await expect(page.getByTestId('journal-date-card')).toContainText('3일');
 await page.screenshot({path:info.outputPath('daily-profit.png')});
});
test('stock holding lots descend with deterministic tie-break; trades header retains buy control',async({page},info)=>{
 await stockFixture(page);
 await page.route('**/api/accounts/a/buy-lots**',route=>route.fulfill({json:{data:[{id:'3',boughtAt:'2026-09-10T00:00:00Z'},{id:'2',boughtAt:'2026-10-01T00:00:00Z'},{id:'10',boughtAt:'2026-10-01T00:00:00Z'}].map(row=>({...row,security:{id:'1',name:'현대자동차'},quantity:'10',soldQuantity:'0',remainingQuantity:'10',unitPrice:'100',sellTrades:[]}))}}));
 await page.goto('/stocks/1?detailTab=holding');await expect(page.getByTestId('lot-10')).toBeVisible();
 expect(await page.locator('[data-testid^="lot-"]').evaluateAll(n=>n.map(x=>x.getAttribute('data-testid')))).toEqual(['lot-10','lot-2','lot-3']);
 await page.getByRole('tab',{name:'거래내역'}).click();await expect(page.getByTestId('stock-realized-profit')).toContainText('+20,230,000원');
 await expect(page.getByTestId('stock-realized-profit')).toContainText('+125.7%');
 await expect(page.getByTestId('stock-detail-content').getByRole('button',{name:'매수',exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('stock-trades.png')});
});

test('home shows ready cards while history loads, preserves account isolation and has no horizontal overflow',async({page},info)=>{
 let releaseHistory!:()=>void,releaseSecond!:()=>void;const reads:string[]=[];
 await page.clock.install({time:new Date('2026-10-07T03:00:00Z')});
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;reads.push(path);
  if(path==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'기본',isDefault:true,isActive:true},{id:'2',name:'다른 계좌',isActive:true}]}});
  const second=path.includes('/2/');
  if(path.endsWith('/dashboard')){if(second)await new Promise<void>(r=>{releaseSecond=r;});return route.fulfill({json:{data:{account:{id:second?'2':'1'},cashBalance:'1000',purchaseAmount:'2000',stockValue:'3000',totalAssetValue:second?'9000':'4000',holdings:[],pricingComplete:true,latestPriceUpdatedAt:'2026-10-07T03:00:00Z'}}});}
  if(path.endsWith('/asset-history')){if(!second)await new Promise<void>(r=>{releaseHistory=r;});return route.fulfill({json:{data:[{date:'2026-10-06',totalAssetValue:'3900'},{date:'2026-10-07',totalAssetValue:'4000'}],summary:{}}});}
  if(path.endsWith('/target-arrivals'))return route.fulfill({json:{data:[],meta:{accountId:second?'2':'1',total:0,enabled:true,unavailableCount:0,priceAsOf:'2026-10-07T03:00:00Z'}}});
  return route.fulfill({json:{data:[]}});
 });
 await page.goto('/');await expect(page.getByTestId('home-summary-area')).toContainText('4,000원');
 await expect(page.getByTestId('target-arrival-card')).toContainText('내용이 없습니다.');await expect(page.getByTestId('recent-buys-card')).toContainText('내용이 없습니다.');
 await expect(page.getByTestId('home-trend-loading')).toBeVisible();
 expect(reads.filter(p=>p.endsWith('/dashboard'))).toHaveLength(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('home-partial.png')});releaseHistory();await expect(page.getByRole('img',{name:'자산추이 · 날짜별 금액 조회'})).toBeVisible();
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
 await expect(page.getByTestId('home-summary-area')).not.toContainText('4,000원');await expect.poll(()=>Boolean(releaseSecond)).toBe(true);releaseSecond();
 await expect(page.getByTestId('home-summary-area')).toContainText('9,000원');await page.screenshot({path:info.outputPath('home-ready.png')});
});

// A historical transaction is static too; returning from its edit form must reuse the cache.
test('historical trade detail reuses cache on focus and edit cancellation',async({page})=>{
 const f=await stockFixture(page);
 await page.goto('/journal/trade/buy/lot1');
 await expect(page.getByRole('button',{name:'거래 수정',exact:true})).toBeVisible();
 const reads=()=>f.reads.filter(path=>path==='/api/buy-trades/lot1').length;
 expect(reads()).toBe(1);
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'));});
 await page.getByRole('button',{name:'거래 수정',exact:true}).click();
 await expect(page.getByTestId('trade-form')).toBeVisible();
 await page.getByRole('button',{name:'취소',exact:true}).click();
 await expect(page.getByRole('button',{name:'거래 수정',exact:true})).toBeVisible();
 expect(reads()).toBe(1);
});
