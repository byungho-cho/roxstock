import {test,expect,type Locator} from '@playwright/test';
import {fixture} from './stock-input-fixture';
async function gesture(target:Locator, dx=0,dy=160) {
  await target.evaluate((el,{dx,dy})=>{
    const point=(x:number,y:number)=>new Touch({identifier:1,target:el,clientX:x,clientY:y});
    const emit=(type:string,x:number,y:number)=>el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[point(x,y)],changedTouches:[point(x,y)]}));
    emit('touchstart',180,100);emit('touchmove',180+dx,100+dy);emit('touchend',180+dx,100+dy);
  },{dx,dy});
}

test('stock quote time survives pending and failure; top pull preserves conditions and blocks duplicate refresh',async({page})=>{
  await fixture(page);let fail=false,delay=false,time='2026-10-02T00:00:00Z',reads=0,release:()=>void=()=>{};
  await page.route('**/api/securities?**',async route=>{
    reads++;if(delay)await new Promise<void>(r=>{release=r;});
    return route.fulfill({status:fail?500:200,json:fail?{error:{message:'조회 실패'}}:{data:Array.from({length:30},(_,i)=>({id:String(2+i),symbol:String(2+i).padStart(6,'0'),name:'삼성전자'+i,marketType:'KOSPI',listType:'WATCHLIST',watchlistItemId:String(2+i),currentPrice:'70000',previousClosePrice:'69000',priceUpdatedAt:time}))}});
  });
  await page.goto('/stocks?tab=watchlist');await expect(page.locator('[data-scroll-item="2"]').getByTestId('price-timestamp')).toHaveText('09:00');
  await page.getByRole('textbox',{name:'목록 종목 검색'}).fill('삼성');
  const condition=await page.getByTestId('stock-list').getAttribute('data-list-condition'), main=page.viewportSize()!.width>=600?page.locator('[data-scroll-region="stock-table"]'):page.locator('main');
  await main.evaluate(el=>el.scrollTop=40);const count=reads;await gesture(page.viewportSize()!.width>=600?main:page.getByTestId('stock-list'));expect(reads).toBe(count);
  await main.evaluate(el=>el.scrollTop=0);
  await gesture(page.viewportSize()!.width>=600?main:page.getByTestId('stock-list'));
  await expect(page.getByTestId('pull-refresh')).toHaveCount(0);expect(reads).toBe(count);
  expect(await page.getByTestId('stock-list').getAttribute('data-list-condition')).toBe(condition);
  await expect(page.locator('[data-scroll-item="2"]').getByTestId('price-timestamp')).toHaveText('09:00');
  expect(await page.locator('main').evaluate(el=>getComputedStyle(el).overscrollBehaviorY)).toBe('auto');
});

test('native pull has no duplicate app refresh; other screens do not refresh',async({page})=>{
  const state=await fixture(page);await page.route('**/api/accounts/*/buy-lots**',route=>route.fulfill({json:{data:[]}}));await page.goto('/');await expect(page.getByTestId('home-trend-card')).toBeVisible();
  const before=state.reads.filter(path=>path.endsWith('/dashboard')).length;
  await gesture(page.locator('main'));await expect.poll(()=>state.reads.filter(path=>path.endsWith('/dashboard')).length).toBe(before);
  await page.goto('/assets');await expect(page.getByTestId('asset-analysis')).toBeVisible();const count=state.reads.length;
  await gesture(page.getByTestId('asset-analysis'));expect(state.reads.length).toBe(count);await expect(page.getByTestId('pull-refresh')).toHaveCount(0);
});

test('journal day arrows and swipe cross months, synchronize calendar and exclude vertical/buttons',async({page})=>{
  const state=await fixture(page);await page.goto('/journal?date=2026-09-30');
  const heading=page.getByTestId('journal-day-heading');await expect(heading).toContainText('2026.09.30');
  await expect.poll(()=>state.reads.filter(path=>path.endsWith('/trades')).length).toBeGreaterThanOrEqual(3);
  await gesture(heading, -90,3);await expect(heading).toContainText('2026.10.01');
  await expect(page.getByRole('button',{name:'2026년 10월, 월 선택'})).toBeVisible();
  await expect(page.locator('[data-testid="journal-calendar-grid"] [aria-pressed="true"]')).toContainText('1');
  await page.getByRole('button',{name:'거래내역 다음 날짜'}).click();await expect(heading).toContainText('2026.10.02');
  await gesture(heading,90,0);await expect(heading).toContainText('2026.10.01');
  await gesture(heading,10,110);await expect(heading).toContainText('2026.10.01');
  await gesture(page.getByRole('button',{name:'거래내역 다음 날짜'}),-90,0);await expect(heading).toContainText('2026.10.01');
  await page.getByRole('button',{name:'거래내역 이전 날짜'}).click();await expect(heading).toContainText('2026.09.30');
  await expect(page.getByTestId('journal-transactions')).not.toContainText('현대자동차');
  for(let i=0;i<8;i++)await page.getByRole('button',{name:'거래내역 다음 날짜'}).click();await expect(heading).toContainText('2026.10.08');
});

test('analysis displays API breakdown and plan, exact selected interval and states',async({page})=>{
  await fixture(page);let fail=false,empty=false,missing=false;const ranges:URL[]=[];
  await page.route('**/api/accounts/*/asset-history**',route=>{
    const url=new URL(route.request().url());ranges.push(url);
    return route.fulfill({status:fail?500:200,json:fail?{error:{message:'fail'}}:{data:empty?[]:[{date:'2026-09-01',totalAssetValue:'1000',cashBalance:'400',stockValue:'600'},{date:'2026-09-30',totalAssetValue:'1500',cashBalance:'600',stockValue:'900'}],compoundPlan:{id:'1',name:'기준계획',assetBasis:'PLAN_INITIAL_ASSET',initialAssetValue:'1000',yearTarget:'1200',targetYear:2026,goalName:'기본'},summary:{from:'2026-09-01',to:'2026-09-30',openingAssetValue:'1000',closingAssetValue:'1500',depositAmount:'200',withdrawalAmount:'0',profitLoss:'300',returnRate:'30',unrealizedChange:missing?null:'150',realizedProfitLoss:'100',dividendIncome:'100',feeTaxAmount:'30',reconciliationDifference:'-20'}}});
  });
  await page.goto('/assets');await expect(page.getByTestId('analysis-metric-평가손익')).toContainText('+150원');
  await expect(page.getByTestId('analysis-metric-수수료·세금')).toContainText('-30원');
  await expect(page.getByTestId('analysis-compound')).toContainText('1,000원');await expect(page.getByTestId('analysis-compound')).toContainText('1,200원');
  await expect(page.getByTestId('analysis-performance-period')).toHaveText('26.09.01 ~ 26.09.30');
  await expect(page.locator('.MuiToolbar-root').first()).toHaveCSS('padding-left','0px');expect((await page.getByTestId('analysis-total').boundingBox())!.x).toBe(8);
  missing=true;await page.getByRole('button',{name:'3개월',exact:true}).click();await expect(page.getByTestId('analysis-metric-평가손익')).toContainText('—');
  empty=true;await page.getByRole('button',{name:'전체',exact:true}).click();await expect(page.getByTestId('analysis-performance').getByText('내용이 없습니다.')).toBeVisible();
  fail=true;await page.getByRole('button',{name:'6개월',exact:true}).click();await expect(page.getByTestId('analysis-performance').getByRole('alert')).toBeVisible({timeout:15000});
});

test('cash chart is 1.5 times taller; every successful more scrolls to final clearance, failures keep position',async({page})=>{
  await fixture(page);let fail=false,older=0;
  await page.route('**/api/accounts/*/cash-overview**',route=>route.fulfill({json:{data:{account:{id:'a',name:'기본',currentBalance:'1000',updatedAt:'2026-10-04T00:00:00Z'},monthly:{deposit:'0',withdrawal:'0',dividend:'0',netChange:'0'},yearly:{deposit:'0',withdrawal:'0',dividend:'0',netChange:'0'},recentTransactions:[]}}}));
  await page.route('**/api/accounts/*/cash-transactions**',route=>{
    const url=new URL(route.request().url());const from=url.searchParams.get('from')!;if(from<'2026-10-01')older++;
    if(fail)return route.fulfill({status:500,json:{error:{message:'조회 실패'}}});
    const total=from<'2026-10-01'?30+older:30;
    return route.fulfill({json:{data:Array.from({length:total},(_,i)=>({id:String(i),transactionType:'DEPOSIT',transactionDate:'2026-10-01T00:00:00Z',amount:'1000',signedAmount:'1000',balanceAfter:'1000',memo:''})),meta:{total,offset:0,limit:100}}});
  });
  await page.clock.setFixedTime(new Date('2026-10-04T03:00:00Z'));
  await page.goto('/detail/cash');await expect(page.getByTestId('cash-history-total')).toHaveText('총 30개');
  await expect(page.getByTestId('cash-trend')).toHaveCSS('height','123px');
  const body=page.locator('[data-scroll-region="cash-body"]'),more=page.getByRole('button',{name:'이전 1개월 불러오기'});
  for(let i=1;i<=2;i++){
    await more.click();await expect(page.getByTestId('cash-history-total')).toHaveText(`총 ${30+i}개`);
    await expect.poll(()=>body.evaluate(el=>Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop))).toBeLessThan(2);
    expect(await body.evaluate(el=>getComputedStyle(el).paddingBottom)).toBe('80px');
  }
  fail=true;await more.click();const top=await body.evaluate(el=>el.scrollTop);
  await expect(page.getByText('추가 내역 조회 실패 · 다시 시도')).toBeAttached({timeout:15000});expect(await body.evaluate(el=>el.scrollTop)).toBe(top);
});
