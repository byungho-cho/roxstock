import {test,expect} from '@playwright/test';
import {fixture} from './phase3-fixture';
test('bug reports open search and list from compact monitoring summary',async({page})=>{
 await fixture(page);let listCalls=0;
 await page.route('**/api/collection/bug-reports**',async route=>{const u=new URL(route.request().url());if(u.pathname.endsWith('/summary'))return route.fulfill({json:{data:{open:3,reviewing:2,resolved:1,lastSeenAt:'2026-10-17T12:00:00Z'}}});listCalls++;return route.fulfill({json:{data:{rows:[],hasNext:false,nextOffset:20}}});});
 await page.goto('/detail/collection-monitoring');const summary=page.getByTestId('collection-bug-report-summary');await expect(summary).toContainText('신규 3건');await expect(page.getByLabel('리포트 상태')).toHaveCount(0);expect(listCalls).toBe(0);
 await summary.getByRole('button',{name:'상세보기'}).click();await expect(page).toHaveURL(/collection-monitoring\/bug-reports$/);await expect(page.getByLabel('리포트 발생일')).toBeVisible();await expect(page.getByText('해당 조건의 리포트가 없습니다.')).toBeVisible();
 const select=await page.getByRole('combobox',{name:'리포트 상태'}).boundingBox(),day=await page.getByLabel('리포트 발생일').boundingBox();expect(select).not.toBeNull();expect(day).not.toBeNull();expect(Math.abs(select!.y-day!.y)).toBeLessThan(2);expect(select!.width+day!.width).toBeGreaterThan(240);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
