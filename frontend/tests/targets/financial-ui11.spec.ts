import {test,expect,type Page} from '@playwright/test';
import {setup} from './financial-ui-fixture';
const center=(page:Page)=>page.getByRole('button',{name:'재무지표 중앙연도'});
async function ready(page:Page){await setup(page);await page.goto('/detail/value?view=chart&selected=1&centerYear=2024');await expect(page.getByTestId('value-chart-수익성')).toBeVisible();}
async function top(page:Page){return page.locator('main').evaluate(e=>e.scrollTop);}
async function scroll(page:Page,bottom=false){await page.locator('main').evaluate((e,bottom)=>{e.scrollTop=bottom?e.scrollHeight:e.scrollHeight/2;},bottom);await expect.poll(()=>top(page)).toBeGreaterThan(100);}
async function sticky(page:Page){const main=await page.locator('main').boundingBox(),header=await page.getByTestId('financial-sticky-header').boundingBox();expect(Math.abs(main!.y-header!.y)).toBeLessThan(1);}
test('common Small buttons and year column centers match, sticky has opaque background',async({page},info)=>{
 await ready(page);const buttons=[page.getByRole('button',{name:'재무제표 갱신',exact:true}),page.getByRole('button',{name:'연간',exact:true}),page.getByRole('button',{name:'분기',exact:true})];
 for(const b of buttons){await expect(b).toHaveCSS('height','28px');await expect(b).toHaveCSS('border-radius','8px');await expect(b).toHaveCSS('padding','0px 8px');}
 await expect(buttons[0]).toHaveCSS('background-color','rgb(30, 41, 59)');await expect(buttons[2]).toHaveCSS('background-color','rgb(30, 41, 59)');await expect(buttons[1]).toHaveCSS('background-color','rgb(59, 130, 246)');
 const years=page.getByTestId('financial-period-header').locator(':scope > button');
 const positions=await page.getByTestId('value-chart-수익성').evaluate(e=>{const grid=[...e.querySelectorAll<HTMLElement>('div')].find(n=>getComputedStyle(n).gridTemplateColumns.startsWith('94px'));return grid?[...grid.querySelectorAll('span')].slice(1,4).map(n=>{const r=n.getBoundingClientRect();return r.x+r.width/2;}):[];});expect(positions).toHaveLength(3);
 for(let i=0;i<3;i++){const box=await years.nth(i).boundingBox();expect(Math.abs(box!.x+box!.width/2-positions[i])).toBeLessThan(1);await expect(years.nth(i)).toHaveCSS('font-weight','400');await expect(years.nth(i)).toHaveCSS('background-color','rgba(0, 0, 0, 0)');}
 await scroll(page);await sticky(page);await expect(page.getByTestId('financial-sticky-header')).toHaveCSS('background-color','rgb(8, 13, 24)');await page.screenshot({path:info.outputPath('sticky-middle.png')});
});
test('year picker supports touch, keyboard, Escape, outside click, viewport and refresh layering',async({page},info)=>{
 await ready(page);await scroll(page);await center(page).tap();const list=page.getByRole('listbox',{name:'재무지표 연도 선택'});await expect(list).toBeVisible();await expect(list.locator('..')).toHaveCSS('opacity','1');await expect(page.getByRole('option',{name:'2024',exact:true})).toHaveAttribute('aria-selected','true');
 const box=await list.locator('..').boundingBox(),viewport=page.viewportSize()!;expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width);expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height);
 await page.screenshot({path:info.outputPath('year-options.png')});await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(center(page)).toHaveText('2023');await expect(list).toHaveCount(0);await expect(center(page)).toBeFocused();
 await center(page).press('ArrowDown');await expect(list).toBeVisible();await page.keyboard.press('Escape');await expect(list).toHaveCount(0);await center(page).tap();await page.mouse.click(4,150);await expect(list).toHaveCount(0);
 await page.getByRole('button',{name:'재무제표 갱신',exact:true}).tap();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByRole('dialog').locator('..')).toHaveCSS('opacity','1');await expect(list).toHaveCount(0);await page.screenshot({path:info.outputPath('refresh-over-sticky.png')});await page.getByRole('button',{name:'재무제표 갱신 닫기'}).click();await sticky(page);
});
for(const bottom of [false,true])test(`year moves and picker preserve ${bottom?'bottom':'middle'} position during delayed data replacement`,async({page})=>{
 await ready(page);await scroll(page,bottom);const before=await top(page);await sticky(page);let release!:()=>void;const hold=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/value-analysis/1?**',async route=>{if(new URL(route.request().url()).searchParams.get('startYear')==='2022')await hold;await route.fallback();});
 await page.getByRole('button',{name:'이전 연도 2023'}).tap();await expect(center(page)).toHaveText('2023');expect(Math.abs(await top(page)-before)).toBeLessThan(2);await expect(page.getByTestId('value-chart-수익성')).toBeVisible();release();await expect(page.getByTestId('value-chart-수익성')).toContainText('2022');expect(Math.abs(await top(page)-before)).toBeLessThan(2);
 await page.getByRole('button',{name:'다음 연도 2024'}).tap();await expect(center(page)).toHaveText('2024');expect(Math.abs(await top(page)-before)).toBeLessThan(2);
 await center(page).tap();await page.getByRole('option',{name:'2016',exact:true}).tap();await expect(center(page)).toHaveText('2016');await expect(page.getByRole('button',{name:'이전 연도 2015'})).toBeDisabled();expect(Math.abs(await top(page)-before)).toBeLessThan(2);await sticky(page);
});
test('shorter data clamps to maximum position without resetting to top',async({page})=>{
 await ready(page);await scroll(page,true);const before=await top(page);
 await page.route('**/api/value-analysis/1?**',route=>route.fulfill({json:{data:{security:{id:'1',name:'종목1',symbol:'000001',currentPrice:'100',w:'1'},year:2026,mode:'annual',valuation:null,fairPrices:[],notices:[],rows:[],chartRows:[]}}}));
 await page.getByRole('button',{name:'이전 연도 2023'}).tap();await expect(page.getByText('내용이 없습니다.',{exact:true})).toHaveCount(4);const positions=await page.locator('main').evaluate(e=>({top:e.scrollTop,max:e.scrollHeight-e.clientHeight}));expect(positions.top).toBe(Math.min(before,positions.max));expect(positions.top).toBeGreaterThan(0);await sticky(page);
});
test('fullscreen and both back paths retain selected year and scroll',async({page})=>{
 await ready(page);await scroll(page);await center(page).tap();await page.getByRole('option',{name:'2023',exact:true}).tap();await expect(page.getByTestId('value-chart-수익성')).toContainText('2022');
 const link=page.getByRole('button',{name:'상세보기',exact:true}).last();await link.evaluate(n=>n.scrollIntoView({block:'center'}));
 for(const browserBack of [true,false]){
  // Measure the actual entry position after Playwright's visibility scroll, before React navigation.
  await link.evaluate(n=>n.addEventListener('pointerdown',()=>{const main=n.closest('main')!;main.dataset.chartEntryScroll=String(main.scrollTop);},{once:true}));
  await link.click();const before=Number(await page.locator('main').getAttribute('data-chart-entry-scroll'));
  await expect(page.getByRole('dialog',{name:'재무지표 차트 상세보기'})).toBeVisible();
  if(browserBack)await page.goBack();else await page.getByRole('button',{name:'차트 상세보기 뒤로가기'}).click();
  await expect(center(page)).toHaveText('2023');expect(Math.abs(await top(page)-before)).toBeLessThan(2);
 }
});
