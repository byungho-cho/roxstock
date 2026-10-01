import { expect, test } from '@playwright/test';

test('financial refresh is explicit, scoped, preserves data and reports no filing', async ({ page }, info) => {
  let posts = 0; let reads = 0; let finished = false;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/accounts') return route.fulfill({ json: { data: [{id:'1',name:'테스트',isActive:true,isDefault:true,cashBalance:'0'}] } });
    if (path.endsWith('/analysis')) { reads++; return route.fulfill({json:{data:{security:{id:'1',name:'현대차',symbol:'005380',currentPrice:'200000',previousClosePrice:'190000'},valuation:null,statements:[{fiscalYear:2025,periodType:'ANNUAL',revenue:'1000000000000',dartSource:{receiptNo:'20260301000001',fsDivision:'CFS',collectedAt:'2026-10-01T04:00:00Z'}}]}}}); }
    if (path.endsWith('/financial-refresh') && route.request().method()==='POST') { posts++; expect(route.request().postDataJSON()).toEqual({fiscalYear:2025,period:'ALL'}); return route.fulfill({status:202,json:{data:{requestId:'99',state:'QUEUED'}}}); }
    if (path.endsWith('/financial-refresh/99')) return route.fulfill({json:{data:{state:finished?'FINISHED':'QUEUED',status:finished?'SKIPPED':'RUNNING',fiscalYear:2025,period:'ALL',finishedAt:finished?'2026-10-01T05:00:00Z':null,results:finished?[{period:'Q1',status:'NO_DATA'}]:[]}}});
    return route.fulfill({json:{data:[]}});
  });
  await page.goto('/stocks/1/financials');
  await expect(page.getByText('DART 재무제표 업데이트')).toBeVisible();
  expect(posts).toBe(0); expect(reads).toBeGreaterThan(0);
  await page.getByRole('combobox',{name:'갱신 범위'}).click(); await page.getByRole('option',{name:'연도 전체',exact:true}).click();
  expect(posts).toBe(0);
  await page.getByRole('button',{name:'2025년 연도 전체 업데이트'}).click();
  await expect(page.getByRole('button',{name:'요청 처리 대기 중'})).toBeDisabled();
  await expect(page.getByText('매출액 · 조원')).toBeVisible(); expect(posts).toBe(1);
  await page.screenshot({path:info.outputPath('financial-refresh-pending.png')});
  await page.reload();
  await expect(page.getByRole('button',{name:'요청 처리 대기 중'})).toBeDisabled();
  expect(posts).toBe(1);
  finished=true;
  await expect(page.getByText('1분기: 공시·재무제표 없음 · 기존 데이터 유지')).toBeVisible({timeout:10000});
  await expect(page.getByText('매출액 · 조원')).toBeVisible();
  await expect(page.getByRole('button',{name:'2025년 연도 전체 업데이트'})).toBeEnabled();
  expect(posts).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  await page.screenshot({path:info.outputPath('financial-refresh-no-filing.png')});
});
