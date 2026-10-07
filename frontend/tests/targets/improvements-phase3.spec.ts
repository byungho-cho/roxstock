import { test, expect, type Page } from '@playwright/test';

async function fixture(page:Page) {
  await page.clock.setFixedTime(new Date('2026-10-07T03:00:00Z'));
  const pnl=[100,10,0,-100,-10,null];
  let missing=false, hold=false, fail=false;
  const pending:Array<()=>void>=[];
  const history=[['2024-01-01','100000'],['2024-06-01','110000'],['2025-01-01','120000'],['2025-12-31','120000'],['2026-01-01','130000'],['2026-04-01','140000'],['2026-09-07','150000'],['2026-09-20','155000'],['2026-10-02','160000'],['2026-10-07','165000']];
  const securities=pnl.map((profit,i)=>({id:String(i+1),symbol:String(i+1).padStart(6,'0'),name:`종목${i+1}`,marketType:'KOSPI',listType:'HOLDING',currentPrice:profit===null?null:String(100+profit),previousClosePrice:'100',priceUpdatedAt:'2026-10-07T03:00:00Z'}));
  const holdings=pnl.map((profit,i)=>({securityId:String(i+1),symbol:securities[i].symbol,name:securities[i].name,quantity:'1',averagePurchasePrice:'100',purchaseAmount:'100',currentPrice:profit===null?null:String(100+profit),marketValue:profit===null?null:String(100+profit),unrealizedProfitLoss:profit===null?null:String(profit),unrealizedReturnRate:profit===null?null:String(profit),priceUpdatedAt:'2026-10-07T03:00:00Z'}));
  const lots=Array.from({length:11},(_,i)=>({id:String(i+1),buyDate:i<3?'2026-10-01':i<9?'2026-09-03':i===9?'2026-08-01':'2026-07-31',boughtAt:`${i<3?'2026-10-01':i<9?'2026-09-03':i===9?'2026-08-01':'2026-07-31'}T03:00:00Z`,holdingDays:6,currentPrice:'150',unitPrice:'100',quantity:'10',soldQuantity:'8',remainingQuantity:'2',remainingPurchaseAmount:'200',returnRate:'50',profitLoss:'100',valuationStatus:'AVAILABLE',priceUpdatedAt:'2026-10-07T03:00:00Z',security:{id:'1',symbol:'000001',name:'종목1',marketType:'KOSPI'},sellTrades:[]}));
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),p=url.pathname;
    if(p==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'기본',isActive:true,isDefault:true},{id:'2',name:'다른',isActive:true}]}});
    if(hold && /asset-history|dashboard|buy-lots/.test(p))await new Promise<void>(resolve=>pending.push(resolve));
    if(fail && /asset-history|dashboard/.test(p))return route.fulfill({status:500,json:{error:{message:'테스트 조회 실패'}}});
    const second=p.includes('/2/');
    if(p.endsWith('/securities'))return route.fulfill({json:{data:securities}});
    if(p.endsWith('/holdings'))return route.fulfill({json:{data:second?[]:holdings}});
    if(p.endsWith('/trades'))return route.fulfill({json:{data:[],daily:[],summary:{realizedProfitLoss:'200',buyAmount:'0',sellAmount:'0'}}});
    if(p.endsWith('/buy-lots'))return route.fulfill({json:{data:second?[]:lots.map((lot,i)=>({...lot,currentPrice:missing&&i===0?null:lot.currentPrice}))}});
    if(p.endsWith('/asset-history')){
      const rows=history.filter(([date])=>date>=(url.searchParams.get('from')??'')&&date<=url.searchParams.get('to')! || !url.searchParams.has('to'));
      return route.fulfill({json:{data:rows.map(([date,totalAssetValue])=>({date,totalAssetValue,stockValue:'100000',cashBalance:'20000',investmentAmount:'100000',updatedAt:`${date}T14:00:00Z`})),summary:{from:rows[0]?.[0],to:rows.at(-1)?.[0],openingAssetValue:'100000',closingAssetValue:'165000',profitLoss:'65000',returnRate:'65',depositAmount:'0',withdrawalAmount:'0',unrealizedChange:'100',realizedProfitLoss:'200',dividendIncome:'300',feeTaxAmount:'10'},compoundPlan:null}});
    }
    if(p.endsWith('/investment-baseline'))return route.fulfill({json:{data:null}});
    if(p.endsWith('/cash-transactions'))return route.fulfill({json:{data:[],meta:{total:0}}});
    if(p.endsWith('/dashboard'))return route.fulfill({json:{data:{account:{id:second?'2':'1',name:'기본'},totalAssetValue:'165000',stockValue:'100000',cashBalance:'65000',purchaseAmount:'100000',unrealizedProfitLoss:'1000',unrealizedReturnRate:'1',pricingComplete:true,latestPriceUpdatedAt:'2026-10-07T03:00:00Z',holdings:second?[]:holdings}}});
    if(p.endsWith('/target-arrivals'))return route.fulfill({json:{data:[],meta:{total:0,unavailableCount:0,calculatedAt:'2026-10-07T03:00:00Z',priceAsOf:null}}});
    return route.fulfill({json:{data:[]}});
  });
  return {missing:()=>{missing=true;},hold:()=>{hold=true;},release:()=>{hold=false;pending.splice(0).forEach(resolve=>resolve());},fail:()=>{fail=true;},success:()=>{fail=false;}};
}
async function noOverflow(page:Page) { expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); }
async function selectChart(page:Page,chart=page.getByTestId('asset-trend-chart').first()) {
  await chart.scrollIntoViewIfNeeded();const svg=chart.locator('svg'),r=(await svg.boundingBox())!;
  await page.mouse.move(r.x+r.width*.1,r.y+r.height*.5);await page.mouse.down();await page.mouse.move(r.x+r.width*.9,r.y+r.height*.5);await page.mouse.up();
  const tooltip=chart.getByTestId('asset-trend-tooltip');await expect(tooltip).toBeVisible();
  const t=(await tooltip.boundingBox())!;expect(t.x).toBeGreaterThanOrEqual(0);expect(t.x+t.width).toBeLessThanOrEqual(page.viewportSize()!.width);
}

test('stock card labels, grouped amount/rate ordering and query-only clear',async({page},info)=>{
  await fixture(page);await page.goto('/stocks?tab=holding');
  const search=page.getByRole('textbox',{name:'목록 종목 검색'});await expect(search).toBeVisible();
  await page.getByRole('combobox',{name:'정렬 기준'}).click();await page.getByRole('option',{name:'손익률',exact:true}).click();
  const names=()=>page.locator('[data-testid="stock-list"] [data-scroll-item]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-scroll-item')));
  // Card and table representations share the same ordering, including missing last.
  const list=info.project.name==='cover'?page.locator('[data-testid="stock-list"] .MuiCard-root'):page.getByRole('row').filter({has:page.getByRole('cell')});
  await expect.poll(()=>list.allTextContents()).toHaveLength(6);
  const texts=await list.allTextContents();expect(texts.map(t=>t.match(/종목\d/)?.[0])).toEqual(['종목1','종목2','종목3','종목4','종목5','종목6']);
  await page.getByRole('button',{name:'내림차순 · 오름차순으로 변경'}).click();
  expect((await list.allTextContents()).map(t=>t.match(/종목\d/)?.[0])).toEqual(['종목2','종목1','종목3','종목5','종목4','종목6']);
  await search.fill('종목1');await expect(list).toHaveCount(1);await page.getByRole('button',{name:'검색어 지우기'}).click();await expect(search).toHaveValue('');await expect(list).toHaveCount(6);await expect(page.getByRole('button',{name:'검색어 지우기'})).toHaveCount(0);
  await expect(page.getByRole('combobox',{name:'정렬 기준'})).toContainText('손익률');
  if(info.project.name==='cover'){await expect(list.first()).toContainText('손익');expect(await list.first().getByText(/손익　/).evaluate(e=>getComputedStyle(e).fontWeight)).toBe('600');}
  await noOverflow(page);await page.screenshot({path:info.outputPath('stocks.png')});
});

test('home month count, local month expansion, holdings navigation and asset chart',async({page},info)=>{
  await fixture(page);await page.goto('/');const recent=page.getByTestId('recent-buys-card');
  await expect(recent).toContainText('이달 3건');await expect(recent.getByTestId('recent-buy-lot')).toHaveCount(5);
  await recent.getByRole('button',{name:'더보기'}).dblclick();await expect(recent.getByTestId('recent-buy-lot')).toHaveCount(9);await expect(page).toHaveURL(/\/$/);await expect(recent).toContainText('이달 3건');
  await page.waitForTimeout(210);await recent.getByRole('button',{name:'더보기'}).click();await expect(recent.getByTestId('recent-buy-lot')).toHaveCount(10);
  await page.waitForTimeout(210);await recent.getByRole('button',{name:'더보기'}).click();await expect(recent.getByTestId('recent-buy-lot')).toHaveCount(11);await expect(recent.getByRole('button',{name:'더보기'})).toHaveCount(0);
  await expect(recent.getByText(/시세·거래 데이터 판정 불가/)).toHaveCount(0);
  await selectChart(page);await expect(page.getByTestId('asset-trend-tooltip')).toContainText('165,000원');
  expect(await page.getByTestId('asset-trend-chart').locator('svg').evaluate(e=>e.getBoundingClientRect().height)).toBe(info.project.name==='cover'?64:148);
  await page.screenshot({path:info.outputPath('home-chart.png')});
  const title=page.getByRole('button',{name:'보유종목 (상세보기)'});await title.click();await expect(page).toHaveURL(/stocks\?tab=holding/);await page.goBack();await expect(page).toHaveURL(/\/$/);
  await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});await expect(page.getByTestId('recent-buy-lot')).toHaveCount(0);await expect(recent).toContainText('이달 0건');
  await noOverflow(page);
});

test('analysis order, full-year dates and month dates; chart has no detail link',async({page},info)=>{
  await fixture(page);await page.goto('/assets');await expect(page.getByTestId('analysis-performance')).toBeVisible();
  const expected=['기간 시작자산','기간 종료자산','기간 투자손익','투자수익률','총입금','총출금','순입출금','평가손익','실현손익','배당수익','수수료·세금'];
  await expect.poll(()=>page.locator('[data-testid^="analysis-metric-"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-testid')?.replace('analysis-metric-','')))).toEqual(expected);
  expect(await page.getByTestId('analysis-performance-period').evaluate(e=>getComputedStyle(e).fontWeight)).toBe('700');
  await expect(page.getByTestId('analysis-trend').getByText('상세보기 ›')).toHaveCount(0);
  await page.getByRole('button',{name:'전체',exact:true}).click();await expect(page.getByTestId('asset-trend-date')).toHaveText(['2024','2025','2026']);await selectChart(page);
  expect(await page.getByTestId('asset-trend-chart').locator('svg').evaluate(e=>e.getBoundingClientRect().height)).toBe(200);
  await page.screenshot({path:info.outputPath('analysis-all.png')});
  await page.getByRole('button',{name:'1개월',exact:true}).click();await expect(page.getByTestId('asset-trend-date').first()).toHaveText('09/07');await selectChart(page);
  await noOverflow(page);await page.screenshot({path:info.outputPath('analysis-month.png')});
});

test('current-year remaining lot profit, historical year, browser/detail return and native scroll',async({page},info)=>{
  const f=await fixture(page);await page.goto('/assets');await page.getByTestId('analysis-total').click();
  await expect(page.getByTestId('investment-trading-profit')).toHaveText('+1,300원');await expect(page.getByTestId('investment-current')).toContainText('올해 평가손익 +1.3%');
  await page.getByTestId('investment-quarters').getByRole('button',{name:'2분기'}).click();
  const chart=page.getByTestId('investment-chart');await chart.scrollIntoViewIfNeeded();await expect(chart.getByTestId('investment-legend')).toBeVisible();
  const saved=await page.locator('main').evaluate(e=>e.scrollTop);
  await page.getByRole('button',{name:'상세보기 ›',exact:true}).click();await expect(page).toHaveURL(/chart=detail/);await expect(page.getByRole('dialog')).toBeVisible();await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(/detail\/investment/);
  await expect(page.getByTestId('investment-quarters').getByRole('button',{name:'2분기'})).toHaveAttribute('aria-pressed','true');expect(await page.locator('main').evaluate(e=>e.scrollTop)).toBe(saved);
  await page.getByRole('button',{name:'상세보기 ›',exact:true}).click();await page.getByRole('button',{name:'차트 상세 뒤로가기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'이전 연도',exact:true}).click();await expect(page.getByTestId('investment-current')).toContainText('2025년 누적 매매손익');await expect(page.getByTestId('investment-trading-profit')).toHaveText('+200원');
  f.missing();await page.getByRole('button',{name:'다음 연도',exact:true}).click();
  // Invalidate the cached current-year response by a full reload.
  await page.reload();await expect(page.getByTestId('investment-trading-profit')).toHaveText('—');await expect(page.getByTestId('investment-profit-basis')).toContainText('시세 미수집');
  await noOverflow(page);await page.screenshot({path:info.outputPath('investment.png')});
});

test('one top loading bar spans concurrent foreground queries, failure and navigation; refresh remains quiet',async({page},info)=>{
  const f=await fixture(page);f.hold();await page.goto('/assets');await expect(page.getByTestId('main-loading-bar')).toHaveCount(1);expect((await page.getByTestId('main-loading-bar').boundingBox())!.height).toBe(3);
  f.release();await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);
  f.hold();await page.getByRole('button',{name:'전체',exact:true}).click();await expect(page.getByTestId('main-loading-bar')).toHaveCount(1);f.fail();f.release();await expect(page.getByRole('button',{name:'다시 시도',exact:true})).toBeVisible();await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);
  f.success();await page.getByRole('button',{name:'다시 시도',exact:true}).click();await expect(page.getByTestId('asset-trend-chart')).toBeVisible();
  await page.goto('/');await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);
  await page.clock.install({time:new Date('2026-10-07T03:00:00Z')});f.hold();await page.clock.fastForward(60_000);await page.waitForTimeout(200);await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);
  // A request from an unmounted screen must not keep the next screen's bar active.
  await page.locator('.MuiBottomNavigation-root').getByRole('button',{name:'종목목록',exact:true}).click();await expect(page).toHaveURL(/stocks/);
  f.release();await expect(page.getByTestId('main-loading-bar')).toHaveCount(0);
  expect(await page.locator('main').evaluate(e=>getComputedStyle(e).overscrollBehaviorY)).toBe('auto');
  await noOverflow(page);await page.screenshot({path:info.outputPath('loading-complete.png')});
});
