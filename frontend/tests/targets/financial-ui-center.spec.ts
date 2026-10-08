import {test,expect} from '@playwright/test';
import {setup} from './financial-ui-fixture';
import {swipeStock} from './financial-chart-gestures';
test('center boundaries clamp 2015 and 2026, preserve stock and quarter selection',async({page},info)=>{
 const s=await setup(page);await page.goto('/detail/value?view=chart&selected=1&centerYear=2015');await expect(page.getByLabel('재무지표 중앙연도')).toHaveText('2016');await expect(page.getByRole('button',{name:'이전 연도 2015'})).toBeDisabled();await page.getByRole('button',{name:'다음 연도 2017'}).click();await expect(page.getByLabel('재무지표 중앙연도')).toHaveText('2017');
 await page.goto('/detail/value?view=chart&selected=1&centerYear=2026');await expect(page.getByLabel('재무지표 중앙연도')).toHaveText('2025');await expect(page.getByRole('button',{name:'다음 연도 2026'})).toBeDisabled();await swipeStock(page,true);await expect(page.getByRole('heading',{level:1})).toContainText('종목2');await expect(page.getByLabel('재무지표 중앙연도')).toHaveText('2025');
 await page.getByRole('button',{name:'분기',exact:true}).click();await page.getByLabel('시작기간').selectOption('2025:4');await swipeStock(page,false);await expect(page.getByRole('heading',{level:1})).toContainText('종목1');await expect(page.getByLabel('시작기간')).toHaveValue('2025:4');expect(s.posts).toBe(0);await page.screenshot({path:info.outputPath('quarter-header.png')});
});
for(const mode of ['annual','quarter'])test(`full ${mode} chart reads all periods and restores both backs`,async({page},info)=>{
 const s=await setup(page);await page.goto(`/detail/value?view=chart&selected=1&mode=${mode}`);
 const link=page.getByRole('button',{name:'상세보기',exact:true}).first();await link.scrollIntoViewIfNeeded();const before=await page.locator('main').evaluate(e=>e.scrollTop);await link.click();const dialog=page.getByRole('dialog',{name:'재무지표 차트 상세보기'});await expect(dialog).toBeVisible();await expect(dialog.getByRole('img')).toBeVisible();
 expect(s.reads.some(u=>u.searchParams.get('startYear')==='2015'&&u.searchParams.get('count')==='10')).toBe(true);await expect.poll(()=>s.reads.map(u=>u.searchParams.get('startYear')+':'+u.searchParams.get('count'))).toContain(mode==='annual'?'2025:2':'2025:8');
 const svg=dialog.getByRole('img'),b=await svg.boundingBox();await page.mouse.click(b!.x+38,b!.y+50);await expect(dialog.getByTestId('financial-chart-tooltip')).toContainText('2015');await expect(dialog.getByTestId('financial-drag-guide')).toHaveAttribute('stroke','#FBBF24');await page.screenshot({path:info.outputPath(`full-${mode}.png`)});
 await dialog.getByRole('button',{name:'차트 상세보기 뒤로가기'}).click();await expect(dialog).toBeHidden();await page.getByRole('button',{name:'상세보기',exact:true}).first().click();await expect(dialog).toBeVisible();await page.goBack();await expect(dialog).toBeHidden();expect(Math.abs(await page.locator('main').evaluate(e=>e.scrollTop)-before)).toBeLessThan(3);expect(s.posts).toBe(0);
});
test('server discovers running job with cleared session and enables after completion',async({page},info)=>{
 const s=await setup(page);let finished=false;
 await page.route('**/api/securities/1/financial-refresh/active',route=>route.fulfill({json:{data:finished?null:{requestId:'99',state:'PROCESSING'}}}));
 await page.goto('/detail/value?view=chart&selected=1');await expect(page.getByRole('button',{name:'재무제표 갱신',exact:true})).toContainText('갱신 중');await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:/갱신 중/})).toBeDisabled();
 await page.getByRole('button',{name:'재무제표 갱신 닫기'}).click();await page.evaluate(()=>sessionStorage.clear());await page.reload();await expect(page.getByRole('button',{name:'재무제표 갱신',exact:true})).toContainText('갱신 중');await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();
 finished=true;s.finished=true;await expect(dialog.getByRole('button',{name:/수동 업데이트/})).toBeEnabled({timeout:12000});expect(s.posts).toBe(0);await page.screenshot({path:info.outputPath('discovered-job.png')});
});
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
 await page.getByRole('button',{name:'상세보기',exact:true}).first().click();const dialog=page.getByRole('dialog',{name:'재무지표 차트 상세보기'}),svg=dialog.getByRole('img');await expect(svg).toBeVisible();const box=await svg.boundingBox();const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box!.x+40,y:box!.y+50}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box!.x+box!.width-40,y:box!.y+50}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(dialog.getByTestId('financial-chart-tooltip')).toContainText('2026E');
});

test('new refresh remains visible in header after popup closes without duplicate POST',async({page})=>{
 const s=await setup(page);
 await page.route('**/api/securities/1/financial-refresh/active',route=>route.fulfill({json:{data:s.posts&&!s.finished?{requestId:'99',state:'QUEUED'}:null}}));
 await page.goto('/detail/value?view=chart&selected=1');await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();await page.getByRole('button',{name:/수동 업데이트/}).click();await expect(page.getByRole('button',{name:/갱신 중/})).toBeDisabled();await page.getByRole('button',{name:'재무제표 갱신 닫기'}).click();await expect(page.getByRole('button',{name:'재무제표 갱신',exact:true})).toContainText('갱신 중');expect(s.posts).toBe(1);
});

test('collector provided report counts take precedence over the compatibility fallback',async({page})=>{
 await setup(page);await page.route('**/api/securities/1/financial-refresh/99',route=>route.fulfill({json:{data:{requestId:'99',state:'FINISHED',status:'PARTIAL',fiscalYear:2024,startYear:2024,endYear:2026,period:'ALL',finishedAt:'2026-10-08T00:00:00Z',results:[],counts:{processed:12,disclosureCompleted:10,valuationCompleted:8,noDisclosure:1,disclosureFailed:1,supplementFailed:2}}}}));
 await page.goto('/detail/value?view=chart&selected=1');await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();await page.getByRole('button',{name:/수동 업데이트/}).click();await expect(page.getByText('보고서 기준: 공시 확인 완료 10 · 미공시 1 · 수집 실패 1')).toBeVisible();await expect(page.getByText('가치지표 보충 완료 8 · 보충 실패/근거 부족 2')).toBeVisible();
});
