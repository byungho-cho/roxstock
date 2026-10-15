import {profitFixture} from './profit-aggregate-fixture';
import {tradeFixtureData} from './trade-summary-fixture';
import {test,expect,type Page,type Locator} from '@playwright/test';
import {fixture} from './phase3-fixture';
async function setup(page:Page){
 const f=await fixture(page);await page.route('**/api/**',async route=>{
    // Legacy endpoint fixture: exercise rollback compatibility; tuning-01 covers the unified APIs.
    if(new URL(route.request().url()).pathname.startsWith('/api/pages/'))return route.fulfill({status:404,json:{error:{message:'Legacy API fixture'}}});

  const u=new URL(route.request().url());if(!u.pathname.endsWith('/trades')&&!u.pathname.endsWith('/investment-profit'))return route.fallback();
  const data=u.pathname.includes('/2/')?[]:[2024,2025,2026].flatMap(year=>[1,2,3,4,5,6].map(id=>({id:`${year}${id}`,type:'SELL',security:{id:String(id),name:`종목${id}`,symbol:String(id).padStart(6,'0')},tradedAt:`${year}-07-01T03:00:00Z`,quantity:'10',unitPrice:'150',amount:'1500',realizedProfitLoss:'500',buyTradeId:'1'})));
  if(u.pathname.endsWith('/investment-profit'))return route.fulfill({json:profitFixture(u.pathname.includes('/2/')?'2':'1',data,[],[],undefined,u.searchParams.get('securityId')??undefined)});
  return route.fulfill({json:{data:tradeFixtureData(u,data),summary:{realizedProfitLoss:'500',buyAmount:'1000',sellAmount:'1500'},daily:[]}});
 });return f;
}
async function chartGeometry(page:Page,chart:Locator,buttons:Locator){
 const svg=chart.locator('svg');await expect(svg).toBeVisible();const r=(await svg.boundingBox())!,b=(await buttons.boundingBox())!;
 expect(r.height).toBeGreaterThan(page.viewportSize()!.height-220);expect(r.y+r.height).toBeLessThanOrEqual(b.y);expect(b.y+b.height).toBeLessThanOrEqual(page.viewportSize()!.height);
 const axis=chart.locator('[data-testid$="-amount"]').first(),a=(await axis.boundingBox())!;expect(a.x+a.width).toBeLessThanOrEqual(r.x+2);expect(r.x-a.x-a.width).toBeLessThan(18);await expect(axis).toContainText('만');
 await page.mouse.move(r.x+r.width*.9,r.y+r.height*.5);const tooltip=chart.locator('[role="status"]');await expect(tooltip).toBeVisible();const t=(await tooltip.boundingBox())!;expect(t.x).toBeGreaterThanOrEqual(0);expect(t.x+t.width).toBeLessThanOrEqual(page.viewportSize()!.width);expect(t.y+t.height).toBeLessThan(b.y);
}
test('asset detail fills viewport and all periods preserve entry on both back paths',async({page},info)=>{
 await setup(page);await page.goto('/assets');await page.getByRole('button',{name:'3개월',exact:true}).click();const entry=page.getByRole('button',{name:'자산추이 상세보기'});await entry.scrollIntoViewIfNeeded();const region=page.viewportSize()!.width<600?page.locator('main'):page.locator('[data-scroll-region="analysis-left"]');const saved=await region.evaluate(e=>e.scrollTop);
 await entry.click();const dialog=page.getByRole('dialog'),buttons=dialog.getByTestId('analysis-detail-periods');await expect(buttons.getByRole('button')).toHaveCount(5);await expect(buttons.getByRole('button',{name:'3개월',exact:true})).toHaveAttribute('aria-pressed','true');
 for(const label of ['1개월','6개월','1년','전체']){await buttons.getByRole('button',{name:label,exact:true}).click();await expect(buttons.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');await expect(dialog.getByTestId('asset-trend-chart')).toBeVisible();}
 await chartGeometry(page,dialog.getByTestId('asset-trend-chart'),buttons);await page.screenshot({path:info.outputPath('asset-detail.png')});await page.goBack();await expect(page.getByRole('button',{name:'3개월',exact:true})).toHaveAttribute('aria-pressed','true');await expect.poll(()=>region.evaluate(e=>e.scrollTop)).toBeCloseTo(saved,0);
 await entry.click();await dialog.getByRole('button',{name:'자산 차트 상세 뒤로가기'}).click();await expect.poll(()=>region.evaluate(e=>e.scrollTop)).toBeCloseTo(saved,0);
});
test('investment detail year quarter empty state latest response and left axis',async({page},info)=>{
 const f=await setup(page);
 await page.addInitScript(()=>{const events:unknown[]=[];(window as any).__investmentSelectionEvents=events;document.addEventListener('click',event=>{const button=(event.target as Element).closest('button');if(!button||!['3분기','상세보기 ›'].includes(button.textContent??''))return;events.push({button:button.textContent,shell:!!document.querySelector('[data-testid="investment-download-shell"]'),selected:[...document.querySelectorAll('[aria-pressed="true"]')].map(e=>e.textContent),memory:Object.fromEntries(Object.entries(sessionStorage).filter(([key])=>key.includes('investment-quarter')))});},true);});
 await page.goto('/detail/investment');await expect(page.getByTestId('investment-page')).toHaveAttribute('data-restoration-ready','true');await page.getByRole('button',{name:'3분기',exact:true}).click();await expect(page.getByTestId('investment-quarters').getByRole('button',{name:'3분기',exact:true})).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'상세보기 ›',exact:true}).click();const d=page.getByRole('dialog'),buttons=d.getByTestId('investment-detail-quarters');await expect(d).toContainText('투자금 차트');await expect(buttons).toHaveCount(0);
 await expect(d.getByTestId('investment-chart')).toBeVisible();await page.screenshot({path:info.outputPath('investment-detail.png')});
 const year=async(value:string)=>{await d.getByRole('combobox',{name:'차트 연도'}).click();await page.getByRole('option',{name:value+'년',exact:true}).click();};
 f.hold();await year('2023');await year('2025');f.release();await expect(d.getByTestId('investment-chart')).toHaveAttribute('data-dates',/2025/);await expect(d.getByTestId('investment-chart')).toHaveAttribute('data-dates',/2026/);
 await year('2023');await expect(d.getByTestId('investment-chart')).toHaveAttribute('data-dates',/2026/);await expect(buttons).toHaveCount(0);
 await d.getByRole('button',{name:'차트 상세 뒤로가기'}).click();await expect(page.getByTestId('investment-year')).toContainText('2026년');await expect(page.getByTestId('investment-quarters').getByRole('button',{name:'3분기',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('profit stock year links restore exact origin sort and scroll',async({page})=>{
 await setup(page);await page.goto('/detail/investment-profit?profitDetail=year&year=2025');const compact=page.getByTestId('profit-compact').filter({has:page.getByText('종목별 손익',{exact:false})}).first();await compact.getByRole('button',{name:'손익액 오름차순 정렬'}).click();const row=compact.locator('[data-id="3"]');await row.scrollIntoViewIfNeeded();const region=page.viewportSize()!.width<600?page.locator('main'):page.locator('[data-scroll-region="profit-right"]');const saved=await region.evaluate(e=>e.scrollTop);
 await row.click();await expect(page.getByTestId('profit-selected')).toHaveText('종목3');await expect(page.getByTestId('profit-detail-summary')).toContainText('전체 거래 요약');
 const annual=page.getByTestId('profit-compact').filter({has:page.getByTestId('profit-annual-heading')});await annual.locator('[data-id="2024"]').click();await expect(page.getByTestId('profit-selected')).toHaveText('2024년');await expect(page.getByTestId('profit-detail-summary')).toContainText('매수총액');await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page.getByTestId('profit-selected')).toHaveText('종목3');
 await page.getByTestId('profit-annual-heading').click();await expect(page.getByTestId('profit-tabs').getByRole('button',{name:'연도별',exact:true})).toHaveAttribute('aria-pressed','true');await page.goBack();await expect(page.getByTestId('profit-selected')).toHaveText('종목3');await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page.getByTestId('profit-selected')).toHaveText('2025년');await expect(compact.getByRole('button',{name:'손익액 내림차순 정렬'})).toBeAttached();await expect.poll(()=>region.evaluate(e=>e.scrollTop)).toBeCloseTo(saved,0);
 await page.goto('/stocks/1?detailTab=summary');await expect(page.getByTestId('stock-annual-profit')).not.toContainText('거래내역');await expect(page.getByRole('tab',{name:'거래내역',exact:true})).toBeAttached();
});

test.afterEach(async({page},info)=>{if(info.status!==info.expectedStatus)await info.attach('investment-selection-events',{body:JSON.stringify(await page.evaluate(()=>(window as any).__investmentSelectionEvents??[]),null,2),contentType:'application/json'});});
