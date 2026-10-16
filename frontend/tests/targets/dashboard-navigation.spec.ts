import {test,expect} from '@playwright/test';
import {fixture} from './phase3-fixture';
test('home stock valuation and performance open the requested screens',async({page})=>{
 await fixture(page);await page.goto('/');
 await page.getByTestId('home-quick-cards').getByRole('button').filter({hasText:'주식평가액'}).click();await expect(page).toHaveURL(/\/assets$/);
 await page.goBack();await expect(page.getByTestId('home-shell')).toBeVisible();
 const performance=page.getByRole('button',{name:'평가손익 · 투자금 보기'});await performance.focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/\/detail\/investment$/);
 await page.goBack();await expect(page.getByTestId('home-shell')).toBeVisible();
});
test('dashboard donut, legend, weights, title and allocation bar navigate independently',async({page},info)=>{
 await fixture(page);await page.goto('/detail/assets');await expect(page.getByTestId('asset-donut')).toBeVisible();
 const donut=page.getByTestId('asset-donut');await expect.poll(async()=> (await donut.boundingBox())?.height??0).toBeCloseTo(124.8,0);await donut.click();await expect(page).toHaveURL(/\/stocks\?tab=holding$/);
 await page.goBack();const legend=page.getByTestId('asset-legend-row').first();await legend.click();await expect(page).toHaveURL(/\/stocks\/1\?detailTab=summary$/);await expect(page.getByRole('tab',{name:'요약',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('banner')).toContainText('000001');expect(await page.evaluate(()=>history.state.usr.stockNavigation.accountId)).toBe('1');
 await page.goBack();await page.getByRole('button',{name:'종목별 비중 차트 방식 변경'}).click();const row=page.getByTestId('asset-weight-row').first();await row.scrollIntoViewIfNeeded();const scroll=await page.locator('main').evaluate(e=>e.scrollTop);await row.focus();await page.keyboard.press('Space');await expect(page).toHaveURL(/\/stocks\/1\?detailTab=summary$/);await expect(page.getByRole('tab',{name:'요약',exact:true})).toHaveAttribute('aria-selected','true');
 await page.goBack();await expect(page.getByTestId('asset-weight-row').first()).toBeVisible();await expect(page.getByRole('button',{name:'종목별 비중 차트 방식 변경'})).toHaveText('누적형');await expect.poll(()=>page.locator('main').evaluate(e=>e.scrollTop)).toBeCloseTo(scroll,0);
 await page.getByRole('button',{name:'자산총액 · 홈 보기'}).click();await expect(page).toHaveURL(/\/$/);await page.goBack();const bar=page.getByRole('button',{name:/홈 보기 · 주식/});expect((await bar.locator(':scope > div').first().boundingBox())?.height).toBe(12);await bar.click();await expect(page).toHaveURL(/\/$/);
 await page.goBack();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('dashboard-links.png'),fullPage:true});
});
