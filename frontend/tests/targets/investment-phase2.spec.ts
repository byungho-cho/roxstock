import { test, expect } from '@playwright/test';
test('stored chart/table, pointer selection, detail return and quarter boundaries',async({page},info)=>{
 await page.clock.install({time:new Date('2026-10-07T03:00:00Z')});
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),p=url.pathname;
  if(p==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'기본',isActive:true,isDefault:true}]}});
  if(p.endsWith('/asset-history')){
   expect(url.searchParams.get('storedOnly')).toBe('true');expect(url.searchParams.get('from')).toBe('2025-12-31');
   return route.fulfill({json:{data:[['2025-12-31','100000000'],['2026-01-01','150000000'],['2026-03-31','150000000'],['2026-04-01','150010000'],['2026-04-03','150020000']].map(([date,totalAssetValue])=>({date,totalAssetValue,investmentAmount:'100000000',updatedAt:`${date}T14:00:00Z`})),summary:{}}});
  }
  if(p.endsWith('/investment-baseline'))return route.fulfill({json:{data:null}});
  if(p.endsWith('/trades'))return route.fulfill({json:{data:[],summary:{realizedProfitLoss:'20000'}}});
  if(p.endsWith('/cash-transactions'))return route.fulfill({json:{data:[{id:'1',transactionType:'DEPOSIT',amount:'50000000',transactionDate:'2026-01-01T03:00:00Z'}],meta:{total:1}}});
  return route.fulfill({json:{data:[]}});
 });
 await page.goto('/detail/investment');await expect(page.getByTestId('investment-row')).toHaveCount(4);
 await expect(page.getByTestId('investment-row').filter({hasText:'26.01.01'})).toContainText('0원');
 await expect(page.getByTestId('investment-row').filter({hasText:'26.04.01'})).toContainText('+10,000원');
 await expect(page.getByTestId('investment-row').first()).toContainText('—');
 await page.getByTestId('investment-quarters').getByRole('button',{name:'2분기'}).click();
 await expect(page.getByTestId('investment-row')).toHaveCount(2);
 const chart=page.getByTestId('investment-chart');await chart.scrollIntoViewIfNeeded();const svg=chart.locator('svg');const rect=(await svg.boundingBox())!;
 await page.mouse.move(rect.x+rect.width*.1,rect.y+60);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.7,rect.y+60);await page.mouse.up();
 await expect(page.getByTestId('investment-tooltip')).toContainText('150,020,000원');
 const before=await page.locator('main').evaluate(e=>e.scrollTop);
 await page.screenshot({path:info.outputPath('summary.png')});
 await page.getByRole('button',{name:'상세보기'}).click();await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('dialog').getByRole('button',{name:'2분기'})).toHaveAttribute('aria-pressed','true');
 const detailChart=page.getByRole('dialog').locator('svg');const d=(await detailChart.boundingBox())!;
 await page.touchscreen.tap(d.x+10,d.y+40);await expect(page.getByRole('dialog').getByTestId('investment-tooltip')).toBeVisible();
 await page.screenshot({path:info.outputPath('detail.png')});
 await page.getByRole('button',{name:'차트 상세 뒤로가기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.locator('main').evaluate(e=>e.scrollTop)).toBe(before);
 await expect(page.getByTestId('investment-quarters').getByRole('button',{name:'2분기'})).toHaveAttribute('aria-pressed','true');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
