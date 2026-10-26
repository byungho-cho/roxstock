import {test,expect,type Page} from './authenticated-test';
import {fixture} from './phase3-fixture';
async function setup(page:Page){
 await fixture(page,{read:url=>url.pathname.endsWith('/investment-baseline')?{json:{data:{date:'2025-12-31',investmentAmount:'50000',updatedAt:'2025-12-31T14:00:00Z'}}}:undefined});
}
test('analysis defaults to this year; principal toggle changes totals and chart without changing actual performance',async({page})=>{
 await setup(page);await page.goto('/assets');
 await expect(page.getByRole('button',{name:'올해',exact:true})).toHaveAttribute('aria-pressed','true');
 const actual=page.getByTestId('analysis-metric-기간 투자손익');
 await expect(actual).toContainText('65,000');const before=await actual.textContent();
 await expect(page.getByTestId('asset-trend-chart')).toHaveAttribute('data-dates',/^2026/);
 await page.getByRole('button',{name:'자산분석 금액 기준 변경'}).click();
 await expect(page.getByTestId('analysis-total')).toContainText('투자총액');
 await expect(page.getByTestId('analysis-total-value')).toHaveText('165,000원');
 await expect(page.getByTestId('analysis-composition')).toContainText('투자자산');
 await expect(actual).toHaveText(before);
 await expect(page.getByTestId('asset-trend-chart-key-amounts')).toContainText('10만원');
});
test('dashboard legend, donut and header follow selected principal basis',async({page})=>{
 await setup(page);await page.goto('/detail/assets');
 const toggle=page.getByRole('button',{name:'대시보드 금액 기준 변경'});
 await expect(toggle).toHaveText('평가금');
 await expect(page.getByTestId('asset-legend-row').first()).toContainText('%');
 const size=await toggle.boundingBox();expect(size?.height).toBe(22);
 await toggle.click();await expect(toggle).toHaveText('투자금');
 await expect(page.getByTestId('composition-total-title')).toHaveText('투자총액');
 await expect(page.getByTestId('asset-donut')).toContainText('주식투자금');
});
test('year-opening return, selectable years and emulated pinch/pan/reset',async({page})=>{
 await setup(page);await page.goto('/detail/investment');
 await expect(page.getByTestId('investment-current')).toContainText('올해 평가손익(1/1일 기준) +2.6%');
 await page.goto('/detail/investment?chart=detail');
 await expect(page.getByRole('combobox',{name:'차트 시작년도'})).toHaveText('2021년');
 await expect(page.getByRole('combobox',{name:'차트 종료년도'})).toHaveText('2026년');
 const range=page.getByTestId('investment-visible-range');await expect(range).toHaveText('2021.01.01 ~ 2026.10.07');
 const chart=page.getByTestId('investment-zoom-chart').getByTestId('investment-chart');await expect(chart.locator('svg')).toBeVisible();
 const rect=(await chart.locator('svg').boundingBox())!,x=rect.x+rect.width/2,y=rect.y+rect.height/2;
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-20,y,id:1},{x:x+20,y,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-70,y,id:1},{x:x+70,y,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect(page.getByRole('button',{name:'전체 보기',exact:true})).toBeEnabled();
 await expect(range).not.toHaveText('2021.01.01 ~ 2026.10.07');
 const zoomRange=await range.innerText();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+40,y,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect(range).not.toHaveText(zoomRange);
 await page.getByRole('button',{name:'전체 보기',exact:true}).click();
 await expect(range).toHaveText('2021.01.01 ~ 2026.10.07');
 await page.getByRole('combobox',{name:'차트 종료년도'}).click();await page.getByRole('option',{name:'2024년',exact:true}).click();
 await expect(range).toHaveText('2021.01.01 ~ 2024.12.31');
});
