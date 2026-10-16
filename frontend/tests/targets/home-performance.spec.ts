import {test,expect,type Page} from '@playwright/test';
import {fixture} from './phase28-fixture';
async function geometry(page:Page){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect((await page.locator('header').boundingBox())!.height).toBe(44);
 expect((await page.getByRole('navigation',{name:'하단 메뉴'}).boundingBox())!.height).toBe(44);
 expect(await page.locator('main').evaluate(main=>Array.from(main.querySelectorAll('*')).filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)&&n.scrollHeight>n.clientHeight+1).length)).toBe(0);
}
async function captureCard(page:Page,card:ReturnType<Page['getByTestId']>,path:string){
 const viewport=page.viewportSize()!;const height=(await card.boundingBox())!.height;
 await page.setViewportSize({width:viewport.width,height:Math.max(viewport.height,Math.ceil(height)+110)});
 await card.scrollIntoViewIfNeeded();await card.screenshot({path});await page.setViewportSize(viewport);
}
test('home performance centers the profit rate, keeps amounts right, and uses equal compact padding',async({page},info)=>{
 await fixture(page);await page.goto('/');const card=page.getByTestId('asset-performance-card');await expect(card).toContainText('500원');
 const measured=await card.evaluate(n=>({height:n.getBoundingClientRect().height,padding:[getComputedStyle(n).paddingTop,getComputedStyle(n).paddingBottom],gap:getComputedStyle(n).gap,lines:Array.from(n.children).map(e=>e.getBoundingClientRect().height)}));
 expect(measured).toEqual({height:142,padding:['8px','8px'],gap:'4px',lines:[24,20,20,20,20]});
 const day=card.getByTestId('asset-previous-day');await expect(day).toContainText('+50원');await expect(day).toContainText('2.0%');
 const positions=await card.evaluate(el=>{const box=(id:string)=>el.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();const day=box('asset-previous-day'),rate=box('previous-day-rate'),amount=box('previous-day-amount'),profit=box('performance-profit-value'),profitRate=box('performance-profit-rate'),row=el.querySelector('[data-testid="performance-profit-value"]')!.parentElement!.getBoundingClientRect();return {dayCenter:day.x+day.width/2,rateCenter:rate.x+rate.width/2,rateTop:rate.y,amountTop:amount.y,amountRight:amount.right,dayRight:day.right,profitRight:profit.right,rowRight:row.right,profitRateCenter:profitRate.x+profitRate.width/2,rowCenter:row.x+row.width/2};});
 expect(positions.rateCenter).toBeCloseTo(positions.dayCenter,0);expect(positions.rateTop).toBe(positions.amountTop);expect(positions.amountRight).toBeCloseTo(positions.dayRight,0);expect(positions.profitRight).toBeCloseTo(positions.rowRight,0);expect(positions.profitRateCenter).toBeCloseTo(positions.rowCenter,0);
 await expect(card.getByTestId('performance-heading').getByRole('heading',{name:'평가손익',exact:true})).toBeVisible();await expect(card.getByTestId('performance-heading').getByText('상세보기 ›',{exact:true})).toBeVisible();await expect(card.getByTestId('performance-profit-rate')).toHaveText('50.0%');for(const id of ['performance-profit-rate','performance-profit-value','previous-day-rate','previous-day-amount']){await expect(card.getByTestId(id)).toHaveCSS('font-size','12px');await expect(card.getByTestId(id)).toHaveCSS('font-weight','600');}await expect(card.getByTestId('performance-row').nth(0)).toContainText('1,000원');await expect(card.getByTestId('performance-row').nth(2)).toContainText('1,500원');
 await expect(card.getByTestId('performance-row').nth(1).getByText('500원')).toHaveCSS('color','rgb(248, 113, 113)');
 await expect(page.getByTestId('home-trend-card')).toHaveCount(0);await geometry(page);
 console.log(JSON.stringify({kind:'phase29-home-measurement',project:info.project.name,...measured}));await page.screenshot({path:info.outputPath('home-after.png')});await captureCard(page,card,info.outputPath('performance-after.png'));
});
