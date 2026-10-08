import {test,expect,type Page} from '@playwright/test';
import {fixture} from './stock-input-fixture';
async function prepare(page:Page){
 const state=await fixture(page);let fail=false;
 await page.route('**/api/value-analysis/*',async route=>{
  if(fail)return route.fulfill({status:500,json:{error:{message:'조회 실패'}}});
  const id=new URL(route.request().url()).pathname.split('/').at(-1)!,empty=id==='3',estimate=id==='1';
  const rows=[2024,2025,2026].map((year,i)=>({key:String(year),label:String(year)+(year===2026&&estimate?'E':''),year,quarter:null,isEstimated:year===2026&&estimate,source:empty?null:'DART:CFS',revenue:empty?null:String((i+1)*1e12),operatingProfit:empty?null:String((i+1)*1e11),netIncome:empty?null:String((i+1)*1e10),per:null,pbr:empty?null:String(i+1),roe:empty?null:String(i+5)}));
  return route.fulfill({json:{data:{security:{id,name:id==='1'?'현대자동차':id==='2'?'삼성전자':'삼성미수집',symbol:id==='1'?'005380':'00000'+id,currentPrice:'50000'},year:2026,valuation:empty?null:{kind:estimate?'ANNUAL_ESTIMATE':'FINAL_ANNUAL',fiscalYear:estimate?2026:2025,metricDate:estimate?'2026-12-31':'2025-12-31',roe:'10',bps:'50000'},fairPrices:['0.7','0.8','0.9','1.0'].map((persistence,i)=>({persistence,price:empty?null:String((i+1)*10000)})),w:empty?null:'1.2',rows,notices:[]}}});
 });return {...state,breakRead:()=>{fail=true;}};
}
test('report icon is isolated, popup matches periods, scrolls internally and restores source',async({page},info)=>{
 const state=await prepare(page);await page.goto('/stocks?tab=holding');const report=page.getByRole('button',{name:'현대자동차 가치지표 보고서',exact:true});await expect(report).toBeVisible();
 const image=report.locator('img');expect(await image.evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0)).toBe(true);const bounds=await image.boundingBox();expect(bounds?.width).toBe(18);expect(bounds?.height).toBe(18);
 const name=page.getByRole('button',{name:'현대자동차 가치지표',exact:true});const r=(await report.boundingBox())!,n=(await name.boundingBox())!;expect(n.x-r.x-r.width).toBeCloseTo(4,0);
 await page.screenshot({path:info.outputPath('list.png')});await report.click();await expect(page).toHaveURL(/tab=holding$/);const dialog=page.getByRole('dialog');await expect(dialog.getByText('2026E 추정 기준',{exact:true})).toBeVisible();expect(state.writes).toHaveLength(0);
 await expect(dialog.getByTestId('fair-price-card')).toContainText('10,000원');const body=dialog.getByTestId('value-popup-body'),footer=dialog.getByTestId('value-popup-footer');const before=(await footer.boundingBox())!;
 await expect(dialog.locator('..')).toHaveCSS('opacity','1');await page.screenshot({path:info.outputPath('popup-top.png')});await body.evaluate(e=>e.scrollTop=e.scrollHeight);const after=(await footer.boundingBox())!;expect(after.y).toBeCloseTo(before.y,0);expect(after.y+after.height).toBeLessThanOrEqual(page.viewportSize()!.height);
 const card=dialog.getByTestId('popup-card-가치지표');await expect(card.locator('[data-period-value="2024"]').first()).toHaveText('—');await expect(card.locator('[data-period-value="2026"]').nth(1)).toHaveText('3.0');await card.locator('svg').dispatchEvent('pointerdown',{clientX:150,clientY:150,pointerId:1});await expect(dialog.getByTestId('financial-chart-tooltip')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('popup-bottom.png')});await dialog.getByRole('button',{name:'가치지표 닫기'}).click();await expect(dialog).toHaveCount(0);await name.click();await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'상세보기 ›',exact:true}).click();await expect(page).toHaveURL(u=>u.pathname==="/stocks/1/value");await expect(page.getByTestId('stock-navigation')).toBeVisible();await page.goBack();await expect(report).toBeVisible();
 const fav=page.getByRole('button',{name:/현대자동차 즐겨찾기/}).first();await fav.click();await expect(dialog).toHaveCount(0);await expect(page).toHaveURL(/tab=holding$/);
});
test('watchlist uses selected stock, actual basis, empty values and retry',async({page},info)=>{
 const state=await prepare(page);await page.goto('/stocks?tab=watchlist');await page.getByRole('button',{name:'삼성전자 가치지표 보고서',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByText('2025년 연간 실적 기준')).toBeVisible();await expect(dialog).toContainText('삼성전자 · 000002');await dialog.getByRole('button',{name:'가치지표 닫기'}).click();await page.getByRole('button',{name:'삼성미수집 가치지표 보고서',exact:true}).click();await expect(dialog.getByText('적정주가 계산 근거 부족')).toBeVisible();await expect(dialog.getByTestId('fair-price-card')).not.toContainText('0원');await expect(dialog.getByTestId('popup-card-수익성').locator('[data-period-value]')).toHaveText(Array(9).fill('—'));await expect(dialog.locator('..')).toHaveCSS('opacity','1');await page.screenshot({path:info.outputPath('popup-empty.png')});await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 state.breakRead();await page.reload();await page.getByRole('button',{name:'삼성전자 가치지표 보고서',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();
});
