import {test,expect} from '@playwright/test';
import {fixture} from './phase28-fixture';
test('dashboard layout, shared periods, weights and single scroll',async({page},info)=>{
 await fixture(page,{trend:true,analysis:true});
 await page.goto('/detail/assets');const card=page.getByTestId('asset-composition-card');await expect(card.getByTestId('composition-total')).toContainText('2,500원');
 await expect(page.getByTestId('asset-holdings-card')).toHaveCount(0);await expect(page.getByTestId('asset-summary-column')).toHaveCount(0);
 const tablet=page.viewportSize()!.width>=600;
 if(tablet){
  await expect(card.getByTestId('dashboard-trend')).toHaveCount(0);const panel=page.getByTestId('dashboard-analysis-panel');
  await expect(panel.getByTestId('analysis-chart')).toBeVisible();await expect(panel.locator('[data-testid^="analysis-metric-"]')).toHaveCount(4);await expect(panel.getByTestId('analysis-compound')).toHaveCount(0);
  const left=(await card.boundingBox())!,right=(await panel.boundingBox())!;expect(Math.round(right.x-left.x-left.width)).toBe(8);
  expect((await panel.getByTestId('analysis-performance').boundingBox())!.y).toBeLessThan((await panel.getByTestId('analysis-trend').boundingBox())!.y);
  for(const label of ['1개월','3개월','6개월','1년','전체']){await panel.getByRole('button',{name:label,exact:true}).click();await expect(panel.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');await expect(panel.getByTestId('analysis-trend-period')).toHaveText(await panel.getByTestId('analysis-performance-period').textContent()??'');}
  await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});await expect(panel.getByTestId('analysis-metric-기간 종료자산')).toContainText('7,000원');
 }else{
  await expect(card.getByTestId('asset-trend-chart')).toBeVisible();const t=(await card.getByTestId('dashboard-trend').boundingBox())!,d=(await card.getByTestId('asset-donut').boundingBox())!;expect(t.y+t.height).toBeLessThanOrEqual(d.y);
 }
 await card.getByRole('button',{name:'종목별 비중 차트 방식 변경'}).click();await expect(card).toContainText('누적형');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await page.locator('main').evaluate(n=>Array.from(n.querySelectorAll('*')).filter(e=>['auto','scroll'].includes(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+1).length)).toBe(0);
 await page.locator('main').evaluate(n=>n.scrollTop=0);await page.screenshot({path:info.outputPath('dashboard-after.png'),fullPage:true});
 await page.setViewportSize({width:page.viewportSize()!.width,height:1000});await page.screenshot({path:info.outputPath('dashboard-layout-after.png')});
});
test('history error retries and missing values remain unavailable',async({page})=>{
 const f=await fixture(page,{trend:true,analysis:true});f.history.mode='error';
 await page.goto('/detail/assets');const tablet=page.viewportSize()!.width>=600;
 if(tablet){await expect(page.getByTestId('analysis-metric-기간 투자손익')).toContainText('—');await expect(page.getByTestId('analysis-chart-region')).toContainText('실패');f.history.mode='empty';await page.getByTestId('analysis-chart-region').getByRole('button',{name:'다시 시도'}).click();await expect(page.getByTestId('analysis-chart-region')).toContainText('내용이 없습니다.');}
 else {await expect(page.getByTestId('dashboard-trend-region')).toContainText('실패');f.history.mode='empty';await page.getByTestId('dashboard-trend-region').getByRole('button',{name:'재시도'}).click();await expect(page.getByTestId('dashboard-trend-region')).toContainText('내용이 없습니다.');}
});

test('capture previous main dashboard',async({page},info)=>{
 test.skip(!process.env.PHASE30_BASELINE_URL,'Baseline server supplied by CI');
 await fixture(page,{trend:true});await page.goto(process.env.PHASE30_BASELINE_URL+'/detail/assets');await expect(page.getByTestId('asset-donut')).toBeVisible();
 await page.screenshot({path:info.outputPath('dashboard-before.png')});await page.setViewportSize({width:page.viewportSize()!.width,height:1000});await page.screenshot({path:info.outputPath('dashboard-layout-before.png')});
});
