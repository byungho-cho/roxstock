import {test,expect} from '@playwright/test';
import {fixture,selected,screenshot} from './stock-input-fixture';
const tablet=(width:number)=>width>=600;

test('v0.4 layout, 36px toolbar, correct menus and data-only table scrolling',async({page},info)=>{
 await fixture(page);await page.goto('/stocks?tab=holding');
 await expect(page.getByTestId('stock-list')).toHaveAttribute('data-restoration-ready','true');
 const width=page.viewportSize()!.width,wide=tablet(width);
 expect(await page.locator('main').evaluate(el=>{const s=getComputedStyle(el);return[s.paddingTop,s.paddingLeft,s.paddingRight];})).toEqual(['0px','8px','8px']);
 expect((await page.locator('header').boundingBox())!.height).toBe(44);
 const nav=page.locator('.MuiBottomNavigation-root:visible');
 expect((await nav.boundingBox())!.height).toBe(44);
 await expect(nav.getByRole('button')).toHaveCount(wide?9:5);
 if(wide)await expect(nav.getByRole('button',{name:'시세수집'})).toBeVisible();
 expect((await page.getByRole('combobox',{name:'정렬 기준'}).boundingBox())!.height).toBe(36);
 const input=page.getByRole('textbox',{name:'목록 종목 검색'});await input.fill('보유');await input.blur();await input.focus();expect(await input.evaluate((el:HTMLInputElement)=>el.selectionEnd!-el.selectionStart!)).toBe(2);await input.fill('');
 if(wide){const rows=page.locator('[data-scroll-region="stock-table"]'),header=page.getByRole('columnheader',{name:'종목',exact:true}),before=(await header.boundingBox())!.y;await rows.evaluate(el=>el.scrollTop=100);expect((await header.boundingBox())!.y).toBe(before);expect(await page.locator('main').evaluate(el=>el.scrollTop)).toBe(0);await rows.evaluate(el=>el.scrollTop=0);}
 await screenshot(page,'v04-list',info.project.name);
 await selected(page);await screenshot(page,'v04-detail',info.project.name);
 for(const img of await page.locator('img:visible').all()){expect(await img.evaluate((el:HTMLImageElement)=>el.complete&&el.naturalWidth>0)).toBe(true);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('tablet columns have 8px gap and keep the left position when replacing selected detail',async({page})=>{
 test.skip(!tablet(page.viewportSize()!.width));
 await fixture(page);await selected(page);
 const left=page.getByTestId('stock-left'),right=page.getByTestId('stock-right');
 const a=(await left.boundingBox())!,b=(await right.boundingBox())!;expect(b.x-a.x-a.width).toBeCloseTo(8,1);expect(a.width).toBeCloseTo(b.width,1);
 await left.evaluate(el=>el.scrollTop=150);await right.evaluate(el=>el.scrollTop=120);
 const top=await left.evaluate(el=>el.scrollTop);
 await page.getByTestId('stock-card-20').dispatchEvent('click');
 await expect(page).toHaveURL(/selected=20/);await expect.poll(()=>left.evaluate(el=>el.scrollTop)).toBeCloseTo(top,0);await expect.poll(()=>right.evaluate(el=>el.scrollTop)).toBe(0);
 await expect(page.getByRole('tab',{name:'보유종목',exact:true})).toHaveCount(0);
});

test('missing quote retains purchase values and hides all stale evaluation values',async({page},info)=>{
 await fixture(page);await page.goto('/stocks?tab=holding');
 const row=tablet(page.viewportSize()!.width)?page.locator('[role="row"][data-scroll-item="30"]'):page.getByTestId('stock-card-30');
 await row.scrollIntoViewIfNeeded();await expect(row).toContainText('161,000,000');await expect(row).toContainText('—');
 expect(await row.innerText()).not.toContain('NaN');await screenshot(page,'v04-missing',info.project.name);
 await page.route('**/api/accounts/a/holdings',route=>route.fulfill({json:{data:[{securityId:'1',symbol:'005380',name:'현대자동차',marketType:'KOSPI',quantity:'70',purchaseAmount:'16100000',averagePurchasePrice:'230000',currentPrice:null,previousClosePrice:'454000',marketValue:'36330000',unrealizedProfitLoss:'20230000',unrealizedReturnRate:'125.7',priceChangeRate:null,priceUpdatedAt:null,marketStatus:'NORMAL'}]}}));
 await selected(page);const lot=page.getByTestId('lot-lot1');
 await expect(lot).toContainText('16,100,000원');const evaluation=lot.getByText('평가',{exact:true}).locator('..');await expect(evaluation).toContainText('—');await expect(evaluation).not.toContainText('36,330,000원');
});

test('linked buy deletion is restricted and sends no delete request',async({page})=>{
 const f=await fixture(page);await selected(page);
 await page.route('**/api/buy-trades/lot1**',route=>route.fulfill({json:{data:{id:'lot1',type:'BUY',account:{id:'a',name:'기본 계좌'},security:{id:'1',name:'현대자동차',symbol:'005380'},quantity:'70',unitPrice:'230000',remainingQuantity:'60',soldQuantity:'10',boughtAt:'2026-09-10T03:00:00Z',sellTrades:[{id:'linked',quantity:'10',unitPrice:'519000',soldAt:'2026-09-18T03:00:00Z'}]}}}));
 await page.getByRole('button',{name:'lot1 매수 삭제'}).click();const dialog=page.getByRole('dialog');
 await expect(dialog).toContainText('매수 Lot을 삭제할 수 없습니다.');await expect(dialog.getByRole('button',{name:'삭제',exact:true})).toBeDisabled();
 expect(f.writes.filter(w=>w.method==='DELETE')).toHaveLength(0);
});

test('previous-year expansion preserves entries and year titles stick inside their own scroll area',async({page},info)=>{
 await fixture(page);await selected(page);await page.getByRole('tab',{name:'거래내역',exact:true}).click();
 await expect(page.getByTestId('trade-year-2026')).toBeVisible();await expect(page.getByTestId('trade-year-2025')).toHaveCount(0);
 const scroll=tablet(page.viewportSize()!.width)?page.getByTestId('stock-right'):page.locator('main');
 await page.getByRole('button',{name:'이전 연도 더보기'}).scrollIntoViewIfNeeded();const before=await scroll.evaluate(el=>el.scrollTop);
 await page.getByRole('button',{name:'이전 연도 더보기'}).click();await expect(page.getByTestId('trade-year-2025')).toHaveCount(1);expect(await scroll.evaluate(el=>el.scrollTop)).toBe(before);await expect(page.getByTestId('sell-s1')).toHaveCount(1);
 await scroll.evaluate(el=>el.scrollTop=130);expect((await page.getByTestId('trade-year-2026').getByTestId('trade-year-title').boundingBox())!.y).toBeCloseTo((await scroll.boundingBox())!.y,0);
 await screenshot(page,'v04-years',info.project.name);
});
