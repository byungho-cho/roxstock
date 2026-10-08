import {test,expect,type Page,type Locator} from '@playwright/test';
import {setup} from './financial-ui-fixture';
async function ready(page:Page){await setup(page,{allMetrics:true});await page.goto('/detail/value?view=chart&selected=1&centerYear=2024');await expect(page.getByTestId('value-chart-수익성')).toBeVisible();}
async function select(chart:Locator,fraction=.5,touch=false){const svg=chart.locator('svg'),box=(await svg.boundingBox())!;const position={x:38+(box.width-76)*fraction,y:40};if(touch)await svg.tap({position});else await svg.click({position});}
test('annual and quarter cards select values, drag and reset outside without tooltips',async({page},info)=>{
 await ready(page);
 for(const mode of ['연간','분기']){
  await page.getByRole('button',{name:mode,exact:true}).click();if(mode==='분기')await expect(page.getByTestId('value-chart-수익성').locator('svg text').last()).toContainText('Q');
  for(const title of ['수익성','가치지표','안정성','성장성']){
   const chart=page.getByTestId('value-chart-'+title);await select(chart,.5,true);
   await expect(chart.getByTestId('financial-drag-guide')).toHaveCount(1);await expect(chart.getByTestId('financial-chart-tooltip')).toHaveCount(0);
   const values=chart.locator('[data-period-value][data-selected="true"]');await expect(values).toHaveCount(title==='안정성'?1:title==='성장성'?2:3);for(const value of await values.all())await expect(value).toHaveCSS('color','rgb(251, 191, 36)');
   await expect(chart.locator('svg')).toHaveCSS('outline-style','none');await expect(chart.locator('svg title')).toHaveCount(0);
   const box=(await chart.locator('svg').boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+40);await page.mouse.down();await page.mouse.move(box.x+box.width-39,box.y+40,{steps:8});await page.mouse.up();
   const keys=await chart.locator('[data-period-value]').evaluateAll(ns=>ns.map(n=>n.getAttribute('data-period-value')));await expect(values.first()).toHaveAttribute('data-period-value',keys[keys.length-1]!);
   await chart.locator('[data-period-value]').first().tap();await expect(chart.getByTestId('financial-drag-guide')).toHaveCount(0);await expect(chart.locator('[data-selected="true"]')).toHaveCount(0);
   await select(chart);await chart.locator('..').getByTestId('financial-card-titlebar').getByText(title,{exact:true}).tap();await expect(chart.getByTestId('financial-drag-guide')).toHaveCount(0);
  }
 }
 await page.screenshot({path:info.outputPath('cards-quarter.png')});
});
test('title, separator and centered legends fit without overlap',async({page},info)=>{
 await ready(page);await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{level:1})).toHaveText('종목1 (000001)');
 await expect(page.getByTestId('financial-sticky-header')).toHaveCSS('padding-bottom','0px');await expect(page.getByTestId('financial-sticky-header')).toHaveCSS('margin-bottom','0px');await expect(page.getByTestId('financial-sticky-header')).toHaveCSS('border-bottom-width','1px');
 for(const bar of await page.getByTestId('financial-card-titlebar').all()){
  const box=(await bar.boundingBox())!,legend=(await bar.getByTestId('financial-chart-legend').boundingBox())!,left=(await bar.locator(':scope > div').first().boundingBox())!,right=(await bar.getByRole('button',{name:'상세보기'}).boundingBox())!;
  expect(Math.abs(box.x+box.width/2-legend.x-legend.width/2)).toBeLessThan(1);expect(left.x+left.width).toBeLessThanOrEqual(legend.x+1);expect(legend.x+legend.width).toBeLessThanOrEqual(right.x+1);expect(Math.abs(box.y+box.height/2-legend.y-legend.height/2)).toBeLessThan(1);
 }
 await page.screenshot({path:info.outputPath('cards-annual.png')});
});
test('fullscreen compact tooltip, selected points, all periods and chrome reset',async({page},info)=>{
 await ready(page);await page.getByRole('button',{name:'상세보기',exact:true}).nth(1).click();const dialog=page.getByRole('dialog',{name:'재무지표 차트 상세보기'}),chart=dialog.getByTestId('value-chart-가치지표');await expect(chart).toContainText('2015');await select(chart,.75,true);
 const tip=chart.getByTestId('financial-chart-tooltip');await expect(tip).toBeVisible();await expect(tip).toContainText('데이터 없음');await expect(tip).toHaveCSS('width','133px');await expect(chart.locator('circle[data-selected="true"]')).toHaveCount(1);
 const ends=await tip.locator('span').evaluateAll(ns=>ns.filter((_,i)=>i%2===1).map(n=>n.getBoundingClientRect().right));expect(Math.max(...ends)-Math.min(...ends)).toBeLessThan(1);
 expect(await tip.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);await page.screenshot({path:info.outputPath('fullscreen-tooltip.png')});
 await chart.getByTestId('financial-chart-legend').tap();await expect(tip).toHaveCount(0);await expect(chart.getByTestId('financial-drag-guide')).toHaveCount(0);await expect(chart.locator('circle[data-selected="true"]')).toHaveCount(0);
 await select(chart);await dialog.getByText('가치지표',{exact:true}).tap();await expect(tip).toHaveCount(0);await page.getByRole('button',{name:'차트 상세보기 뒤로가기'}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'재무지표 중앙연도'})).toHaveText('2024');
});
test('value refresh common Small has eight pixel price gap',async({page},info)=>{
 await setup(page);await page.goto('/detail/value?view=detail&selected=1');await expect(page.getByTestId('value-detail')).toBeVisible();await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toHaveCount(0);
 const price=page.getByTestId('value-detail').getByTestId('value-current-price'),refresh=page.getByRole('button',{name:'재무제표 갱신',exact:true});await expect(refresh).toHaveCSS('height','28px');const p=(await price.boundingBox())!,r=(await refresh.boundingBox())!;expect(Math.abs(r.x-p.x-p.width-8)).toBeLessThan(1);await refresh.tap();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'재무제표 갱신 닫기'}).click();await page.screenshot({path:info.outputPath('value-detail.png')});
});
test('long stock title stays one line with visible code; no-data cards have no selection',async({page})=>{
 await setup(page,{longName:true,empty:true});await page.goto('/detail/value?view=chart&selected=1');const heading=page.getByRole('heading',{level:1});await expect(heading).toContainText('(000001)');const code=heading.locator('span').last();await expect(code).toBeVisible();const h=(await heading.boundingBox())!,c=(await code.boundingBox())!;expect(c.x+c.width).toBeLessThanOrEqual(h.x+h.width+1);expect(c.y+c.height).toBeLessThanOrEqual(h.y+h.height+1);await expect(page.getByText('내용이 없습니다.',{exact:true})).toHaveCount(4);await expect(page.getByTestId('financial-drag-guide')).toHaveCount(0);
});
test('chart touch horizontal drag selects last period and vertical gesture scrolls main',async({page})=>{
 await ready(page);const chart=page.getByTestId('value-chart-수익성'),svg=chart.locator('svg'),box=(await svg.boundingBox())!,cdp=await page.context().newCDPSession(page);const y=box.y+40;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+40,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width-40,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(chart.locator('[data-period-value][data-selected="true"]').first()).toHaveAttribute('data-period-value','2025:annual');await expect(page.getByRole('heading',{level:1})).toContainText('종목1');
 const before=await page.locator('main').evaluate(e=>e.scrollTop);const main=(await page.locator('main').boundingBox())!;if(await page.locator('main').evaluate(e=>e.scrollHeight>e.clientHeight)){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:Math.min(main.y+main.height-20,box.y+90)}]});
  for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+box.width/2,y:Math.min(main.y+main.height-20,box.y+90)-i*12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(()=>page.locator('main').evaluate(e=>e.scrollTop)).toBeGreaterThan(before);
 }
});

test('period change clears old selection while year collection colors stay intact',async({page})=>{
 await ready(page);const chart=page.getByTestId('value-chart-수익성');await select(chart);await expect(chart.getByTestId('financial-drag-guide')).toHaveCount(1);await page.getByRole('button',{name:'이전 연도 2023'}).tap();await expect(page.getByRole('button',{name:'재무지표 중앙연도'})).toHaveText('2023');await expect(chart.locator('svg text').first()).toHaveText('2022');await expect(chart.getByTestId('financial-drag-guide')).toHaveCount(0);await expect(chart.locator('[data-period-value][data-selected="true"]')).toHaveCount(0);
});
