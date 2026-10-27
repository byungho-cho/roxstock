import {assertRetiredEntry} from './security-data-retired';
import {test,expect} from './authenticated-test';
import {setup} from './financial-ui-fixture';
import {swipeStock} from './financial-chart-gestures';
test('center boundaries clamp 2015 and 2026, preserve stock and quarter selection',async({page},info)=>{
 const s=await setup(page);await page.goto('/detail/value?view=chart&selected=1&centerYear=2015');await expect(page.getByLabel('재무지표 중앙연도')).toHaveText('2016');await expect(page.getByRole('button',{name:'이전 연도 2015'})).toBeDisabled();await page.getByRole('button',{name:'다음 연도 2017'}).click();await expect(page.getByLabel('재무지표 중앙연도')).toHaveText('2017');
 await page.goto('/detail/value?view=chart&selected=1&centerYear=2026');await expect(page.getByLabel('재무지표 중앙연도')).toHaveText('2025');await expect(page.getByRole('button',{name:'다음 연도 2026'})).toBeDisabled();await swipeStock(page,true);await expect(page.getByRole('heading',{level:1})).toContainText('종목2');await expect(page.getByLabel('재무지표 중앙연도')).toHaveText('2025');
 await page.getByRole('button',{name:'분기',exact:true}).click();await page.getByLabel('재무지표 중앙분기').click();await page.getByRole('option',{name:'2026 1Q',exact:true}).click();await swipeStock(page,false);await expect(page.getByRole('heading',{level:1})).toContainText('종목1');await expect(page.getByLabel('재무지표 중앙분기')).toHaveText('2026 1Q');expect(s.posts).toBe(0);await page.screenshot({path:info.outputPath('quarter-header.png')});
});
for(const mode of ['annual','quarter'])test(`full ${mode} chart reads all periods and restores both backs`,async({page},info)=>{
 const s=await setup(page);await page.goto(`/detail/value?view=chart&selected=1&mode=${mode}`);
 const link=page.getByRole('button',{name:'상세보기',exact:true}).first();await link.scrollIntoViewIfNeeded();const before=await page.locator('main').evaluate(e=>e.scrollTop);await link.click();const dialog=page.getByRole('dialog',{name:'재무지표 차트 상세보기'});await expect(dialog).toBeVisible();await expect(dialog.getByRole('img')).toBeVisible();
 expect(s.reads.some(u=>u.searchParams.get('startYear')==='2015'&&u.searchParams.get('count')==='10')).toBe(true);await expect.poll(()=>s.reads.map(u=>u.searchParams.get('startYear')+':'+u.searchParams.get('count'))).toContain(mode==='annual'?'2025:2':'2025:8');
 const svg=dialog.getByRole('img'),b=await svg.boundingBox();await page.mouse.click(b!.x+38,b!.y+50);await expect(dialog.getByTestId('financial-chart-tooltip')).toContainText('2015');await expect(dialog.getByTestId('financial-drag-guide')).toHaveAttribute('stroke','#FBBF24');await page.screenshot({path:info.outputPath(`full-${mode}.png`)});
 await dialog.getByRole('button',{name:'차트 상세보기 뒤로가기'}).click();await expect(dialog).toBeHidden();await page.getByRole('button',{name:'상세보기',exact:true}).first().click();await expect(dialog).toBeVisible();await page.goBack();await expect(dialog).toBeHidden();expect(Math.abs(await page.locator('main').evaluate(e=>e.scrollTop)-before)).toBeLessThan(3);expect(s.posts).toBe(0);
});
test('retired running job cannot restart through report view',async({page},info)=>{const state=await setup(page);await assertRetiredEntry(page);expect(state.posts).toBe(0);});
test('full chart keeps leading missing and real zero distinct, does not fill internal gaps',async({page})=>{
 await setup(page);await page.route('**/api/value-analysis/1?**',route=>{
  const u=new URL(route.request().url()),start=Number(u.searchParams.get('startYear')),count=Number(u.searchParams.get('count'));
  const rows=Array.from({length:count},(_,i)=>{const year=start+i,value=year<2023||year===2024?null:year===2025?'0':'10000000000';return {key:String(year),label:String(year),year,quarter:null,revenue:value,operatingProfit:null,netIncome:null,per:null,pbr:null,roe:null,metricReasons:{},source:value===null?null:'DART:CFS'};});
  return route.fulfill({json:{data:{security:{id:'1',name:'종목1',symbol:'000001'},year:2026,mode:'annual',rows,notices:[]}}});
 });
 await page.goto('/detail/value?view=chart&selected=1');await page.getByRole('button',{name:'상세보기',exact:true}).first().click();const dialog=page.getByRole('dialog',{name:'재무지표 차트 상세보기'});await expect(dialog.getByText('매출액: 2023년도부터 데이터가 제공됩니다.')).toBeVisible();
 const svg=dialog.getByRole('img'),b=await svg.boundingBox();await page.mouse.click(b!.x+38,b!.y+50);await expect(dialog.getByTestId('financial-chart-tooltip')).toContainText('데이터 없음');await svg.focus();for(let i=0;i<10;i++)await page.keyboard.press('ArrowRight');await expect(dialog.getByTestId('financial-chart-tooltip')).toContainText('2025');await expect(dialog.getByTestId('financial-chart-tooltip')).toContainText('매출액 0');await page.keyboard.press('ArrowLeft');await expect(dialog.getByTestId('financial-chart-tooltip')).toContainText('2024');await expect(dialog.getByTestId('financial-chart-tooltip')).toContainText('매출액 데이터 없음');
 await dialog.getByRole('button',{name:'차트 상세보기 뒤로가기'}).click();await page.getByRole('button',{name:'상세보기',exact:true}).nth(1).click();await expect(dialog.getByText('내용이 없습니다.',{exact:true})).toBeVisible();await expect(dialog.getByRole('img')).toHaveCount(0);
});

test('API forecast marker uses server blue state and bold and touch guide selects the last period',async({page})=>{
 await setup(page);await page.route('**/api/value-analysis/1?**',route=>{
 const u=new URL(route.request().url()),start=Number(u.searchParams.get('startYear')),count=Number(u.searchParams.get('count'));
 const rows=Array.from({length:count},(_,i)=>({key:String(start+i),label:String(start+i),year:start+i,quarter:null,isEstimated:start+i===2026,collectionState:start+i===2026?'ESTIMATE_READY':'COMPLETE',revenue:'100',operatingProfit:'10',netIncome:'5',source:'DART:CFS',metricReasons:{}}));
 return route.fulfill({json:{data:{security:{id:'1',name:'종목1',symbol:'000001'},year:2026,mode:'annual',rows,notices:[]}}});});
 await page.goto('/detail/value?view=chart&selected=1');const year=page.getByRole('button',{name:'다음 연도 2026'});await expect(year).toHaveText('2026E');await expect(year).toHaveCSS('color','rgb(96, 165, 250)');await expect(year).toHaveCSS('font-weight','700');
 await page.getByRole('button',{name:'상세보기',exact:true}).first().click();const dialog=page.getByRole('dialog',{name:'재무지표 차트 상세보기'}),svg=dialog.getByRole('img');await expect(svg).toBeVisible();let box:Awaited<ReturnType<typeof svg.boundingBox>>;await expect.poll(async()=>{box=await svg.boundingBox();return box;}).not.toBeNull();const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box!.x+40,y:box!.y+50}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box!.x+box!.width-40,y:box!.y+50}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(dialog.getByTestId('financial-chart-tooltip')).toContainText('2026E');
});

test('retired refresh entry navigates to management without a POST',async({page})=>{const state=await setup(page);await assertRetiredEntry(page);expect(state.posts).toBe(0);});

test('retired report queue stays untouched while opening management',async({page})=>{const state=await setup(page);await assertRetiredEntry(page);expect(state.posts).toBe(0);});
