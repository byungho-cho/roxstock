import {test,expect,type Page} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {fixture} from './phase27-fixture';
const nav=(page:Page)=>page.getByTestId('stock-navigation');
async function swipe(page:Page,direction:number){
 const region=page.locator('[data-detail-swipe]').last();
 await region.evaluate((target,direction)=>{
  const touch=(x:number,y:number)=>new Touch({identifier:1,target,clientX:x,clientY:y});
  target.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch(180,160)]}));
  target.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,touches:[touch(180-direction*100,162)]}));
  target.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[touch(180-direction*100,162)]}));
 },direction);
}
async function code(page:Page,id:string){await expect(nav(page).getByTestId('stock-navigation-code')).toHaveText(id.padStart(6,'0'));}
test('first/last wrap through header clicks and swipes; adjacent prefetch includes both ends',async({page})=>{
 const f=await fixture(page);await page.goto('/stocks/1?detailTab=holding');await code(page,'1');
 await expect(nav(page).getByRole('button',{name:'이전 종목 순환4'})).toBeEnabled();
 await expect.poll(()=>f.reads.some(p=>p.includes('securityId=4')&&p.includes('buy-lots'))).toBe(true);
 await nav(page).getByRole('button',{name:'이전 종목 순환4'}).click();await code(page,'4');
 await swipe(page,1);await code(page,'1');await swipe(page,-1);await code(page,'4');
 await nav(page).getByRole('button',{name:'다음 종목 순환1'}).click();await code(page,'1');
});
for(const count of [1,2])test(`${count} stock list never refetches itself; two rows wrap to the sole neighbor`,async({page})=>{
 const f=await fixture(page,{count});await page.goto('/stocks/1?detailTab=holding');await expect(page.getByTestId('lot-1-0')).toBeVisible();
 if(count===1){const before=f.reads.length;await swipe(page,1);await swipe(page,-1);await expect(page.getByTestId('lot-1-0')).toBeVisible();expect(f.reads.length).toBe(before);expect(f.reads.filter(p=>p.includes('buy-lots')&&p.includes('securityId=1'))).toHaveLength(1);}
 else{await code(page,'1');await nav(page).getByRole('button',{name:'이전 종목 순환2'}).click();await code(page,'2');await nav(page).getByRole('button',{name:'이전 종목 순환1'}).click();await code(page,'1');}
});
test('filtered sorted entry and favorites keep the same cycle after navigation',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('roxstock:favorite-stocks-v1','["4"]'));
 await fixture(page);await page.goto('/stocks?tab=holding');await page.getByRole('textbox',{name:'목록 종목 검색'}).fill('순환');
 await page.getByRole('combobox',{name:'정렬 기준'}).click();await page.getByRole('option',{name:'종목명',exact:true}).click();
 const wide=page.viewportSize()!.width>=600;
 await (wide?page.getByRole('row',{name:'순환4 상세보기'}):page.getByRole('button',{name:'순환4 상세보기',exact:true})).click();
 await code(page,'4');const previous=await nav(page).getByRole('button').first().getAttribute('aria-label');
 expect(previous).not.toContain('제외');await nav(page).getByRole('button').first().click();
 await expect(nav(page).getByRole('button').last()).toHaveAttribute('aria-label','다음 종목 순환4');
 await nav(page).getByRole('button').last().click();await code(page,'4');
});
test('rapid navigation cannot let delayed stock lots replace the current stock',async({page})=>{
 const f=await fixture(page,{delayStock:'2'});await page.goto('/stocks/2?detailTab=holding');await code(page,'2');
 await swipe(page,1);await code(page,'3');await swipe(page,1);await code(page,'4');await swipe(page,1);await code(page,'1');
 f.release();await expect(page.getByTestId('lot-1-0')).toBeVisible();await expect(page.getByTestId('lot-2-0')).toHaveCount(0);await code(page,'1');
});
test('profit-only targets update with prices; remaining quantity total and all tooltip close paths',async({page},info)=>{
 const f=await fixture(page);await page.goto('/stocks/1?detailTab=holding');const card=page.getByTestId('lot-1-0');await expect(card).toBeVisible();
 await expect(card.getByText('수익',{exact:true})).toBeVisible();await expect(card.getByText('목표수익률',{exact:true})).toHaveCount(0);
 const target=card.getByRole('button',{name:'5% 목표 총액',exact:true});await expect(target).toHaveText('5% · 319,200원');
 await target.click();await expect(page.getByRole('tooltip')).toHaveText('목표 총액 2,234,400원');await expect(page.getByRole('tooltip')).toBeInViewport();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('tooltip.png')});await target.click();await expect(page.getByRole('tooltip')).toHaveCount(0);
 await target.click();await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);
 await target.click();await page.mouse.click(2,100);await expect(page.getByRole('tooltip')).toHaveCount(0);
 const profitHeight=(await card.boundingBox())!.height;
 for(const price of [300000,304000,null]){await f.setPrice(price);await expect(card.getByTestId('lot-targets')).toHaveCount(0);await expect(card.getByRole('button',{name:'1-0 매수 수정'})).toBeVisible();expect((await card.boundingBox())!.height).toBeLessThan(profitHeight);}
 await f.setPrice(350000);await expect(card.getByTestId('lot-target')).toHaveCount(3);expect(f.writes).toHaveLength(0);
 await card.getByRole('button',{name:'1-0 매수 삭제'}).click();await expect(page.getByRole('dialog')).toContainText('연결된 매도');await expect(page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true})).toBeDisabled();
});
test('before/after measurements preserve fixed chrome and fit two cards after scrolling',async({page},info)=>{
 await fixture(page);const measurements:any={};
 for(const [version,origin] of [['before','http://127.0.0.1:3127'],['after','http://127.0.0.1:3027']]){
  await page.goto(origin+'/stocks/1?detailTab=holding');const first=page.getByTestId('lot-1-0');await expect(first).toBeVisible();
  const boxes=await page.locator('[data-testid^="lot-1-"]').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {y:r.y,bottom:r.bottom,height:r.height};}));
  const height=page.viewportSize()!.height,bottom=height-44;
  measurements[version]={cards:boxes,fullyVisible:boxes.filter(b=>b.y>=44&&b.bottom<=bottom).length,visibleEquivalent:boxes.reduce((sum,b)=>sum+Math.max(0,Math.min(bottom,b.bottom)-Math.max(44,b.y))/b.height,0)};
  await page.screenshot({path:info.outputPath(version+'.png')});
  if(version==='after'){
   expect(boxes[0].height).toBeLessThan(measurements.before.cards[0].height);
   expect(await page.getByRole('navigation',{name:'하단 메뉴'}).evaluate(n=>n.getBoundingClientRect().height)).toBe(44);
   const scroll=page.viewportSize()!.width>=600?page.getByTestId('stock-right'):page.locator('main');
   await scroll.evaluate(n=>{const card=n.querySelector('[data-testid="lot-1-0"]')!;n.scrollTop+=card.getBoundingClientRect().top-n.getBoundingClientRect().top;});
   await expect(page.getByTestId('lot-1-1')).toBeInViewport();
   const scrolled=await page.locator('[data-testid^="lot-1-"]').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {y:r.y,bottom:r.bottom,height:r.height};}));
   measurements.after.scrolledFullyVisible=scrolled.filter(b=>b.y>=44&&b.bottom<=bottom).length;
   await page.screenshot({path:info.outputPath('after-scrolled.png')});
  }
 }
 writeFileSync(info.outputPath('measurements.json'),JSON.stringify(measurements,null,2));
});
test('long holding period and large amounts remain readable without overlap or overflow',async({page},info)=>{
 await fixture(page,{large:true});await page.goto('/stocks/1?detailTab=holding');const card=page.getByTestId('lot-1-0');await expect(card).toBeVisible();
 const date=(await card.getByTestId('lot-date').boundingBox())!,actions=(await card.getByTestId('lot-actions').boundingBox())!;
 expect(date.x+date.width).toBeLessThanOrEqual(actions.x);await expect(card).toContainText('1990.01.01');
 expect(await card.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);
 await card.getByRole('button',{name:'15% 목표 총액'}).click();await expect(page.getByRole('tooltip')).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('large.png')});
});
