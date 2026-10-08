import {expect,test,type Page} from '@playwright/test';
import {fixture} from './phase3-fixture';
async function setup(page:Page){
 const stocks=[1,2].map(i=>({id:String(i),name:'종목'+i,symbol:'00000'+i,market:'KOSPI',currentPrice:'100',w:'1',fairPrices:[],valuation:null}));
 const state={posts:0,finished:false,fail:false,body:null as unknown,reads:[] as URL[]};
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url()),p=u.pathname;
  if(p==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'계좌',isActive:true,isDefault:true}]}});
  if(p.endsWith('/financial-refresh/active'))return route.fulfill({json:{data:null}});
  if(p.endsWith('/financial-refresh')&&route.request().method()==='POST'){state.posts++;state.body=route.request().postDataJSON();return route.fulfill({status:202,json:{data:{requestId:'99',state:'QUEUED'}}});}
  if(p.endsWith('/financial-refresh/99'))return route.fulfill({json:{data:{state:state.finished?'FINISHED':'QUEUED',status:state.fail?'FAILED':state.finished?'PARTIAL':'RUNNING',startYear:2024,endYear:2025,fiscalYear:2024,period:'ALL',finishedAt:state.finished?'2026-10-07T05:00:00Z':null,results:state.finished?[{fiscalYear:2024,period:'ANNUAL',status:state.fail?'FAILED':'SUCCESS',valuationStatus:'PARTIAL',valuationReasons:{per:'기간 말 과거 종가 부족'}}]:[]}}});
  if(p==='/api/value-analysis'||p==='/api/financial-statements')return route.fulfill({json:{data:{year:2026,rows:stocks,total:2}}});
  if(p.startsWith('/api/value-analysis/')||p.startsWith('/api/financial-statements/')){
   state.reads.push(u);const id=p.split('/').at(-1),custom=u.searchParams.get('period'),mode=u.searchParams.get('mode')??'annual';
   const end=Number(u.searchParams.get('endYear')??2026),start=Number(u.searchParams.get('startYear')??end-2),count=custom?Number(u.searchParams.get('endYear'))-start+1:p.includes('value-analysis')?Number(u.searchParams.get('count')):3;
   const chartRows=Array.from({length:count},(_,i)=>({key:`${mode==='quarter'?start*4+Number(u.searchParams.get('startQuarter')??1)-1+i:start+i}:${mode}`,label:mode==='quarter'?`${Math.floor((start*4+Number(u.searchParams.get('startQuarter')??u.searchParams.get('quarter')??1)-1+i)/4)} ${(Number(u.searchParams.get('startQuarter')??u.searchParams.get('quarter')??1)-1+i)%4+1}Q`:String(start+i),year:mode==='quarter'?Math.floor((start*4+Number(u.searchParams.get('startQuarter')??u.searchParams.get('quarter')??1)-1+i)/4):start+i,quarter:mode==='quarter'?(Number(u.searchParams.get('startQuarter')??u.searchParams.get('quarter')??1)-1+i)%4+1:null,revenue:'10000000000',operatingProfit:'100000000',netIncome:'10000000',roe:'10',per:null,pbr:null,metricStatus:'PARTIAL',metricReasons:{per:'기간 말 과거 종가 부족'},source:'DART:CFS',collectedAt:'2026-10-07T01:00:00Z',isDerived:false}));
   return route.fulfill({json:{data:{security:stocks.find(s=>s.id===id),year:2026,mode,valuation:null,fairPrices:[],notices:['저장 데이터'],collectedAt:'2026-10-07T01:00:00Z',chartRows,rows:p.includes('financial-statements')?chartRows.map(r=>({...r,values:{revenue:r.revenue,operatingProfit:r.operatingProfit,netIncome:r.netIncome},growth:{},basis:'DART:CFS'})):chartRows}}});
  }return route.fulfill({json:{data:[]}});
 });return state;
}
async function select(page:Page,label:string,value:string){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:value,exact:true}).click();}
test('central year and quarter survive neighbors and legacy URLs',async({page})=>{
 await setup(page);await page.goto('/detail/financials?selected=1&view=detail&startYear=2024');await expect(page.getByLabel('재무제표 중앙연도')).toHaveValue('2025');await expect(page).toHaveURL(/centerYear=2025/);
 await page.getByLabel('재무제표 중앙연도').selectOption('2016');await page.getByRole('button',{name:'종목2',exact:true}).click();await expect(page.getByLabel('재무제표 중앙연도')).toHaveValue('2016');
 await page.getByRole('button',{name:'분기',exact:true}).click();await page.getByLabel('재무제표 시작연도').selectOption('2025');await page.getByLabel('재무제표 시작분기').selectOption('4');await page.getByRole('button',{name:'종목1',exact:true}).click();await expect(page.getByLabel('재무제표 시작분기')).toHaveValue('4');
 await page.goto('/detail/value?view=chart&selected=1&annualStart=2024');await expect(page.getByLabel('재무지표 중앙연도')).toHaveValue('2025');await page.getByLabel('재무지표 중앙연도').selectOption('2016');await expect(page.getByRole('button',{name:'이전 연도 2015'})).toBeDisabled();await page.getByRole('button',{name:'종목2',exact:true}).click();await expect(page.getByLabel('재무지표 중앙연도')).toHaveValue('2016');
});
test('popup validates range; persists request and reenables after failure',async({page},info)=>{
 const s=await setup(page);await page.goto('/stocks/1/financials?endYear=2026');await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(page.getByRole('combobox',{name:'시작연도',exact:true})).toContainText('2024');await expect(page.getByRole('combobox',{name:'종료연도',exact:true})).toContainText('2026');
 await select(page,'시작연도','2026년');await select(page,'종료연도','2025년');await expect(page.getByText('시작연도가 종료연도보다 늦습니다.')).toBeVisible();await expect(dialog.getByRole('button',{name:/수동 업데이트/})).toBeDisabled();expect(s.posts).toBe(0);
 await select(page,'시작연도','2024년');await expect(dialog.getByRole('button',{name:'저장 데이터 차트 보기'})).toHaveCount(0);expect(s.posts).toBe(0);
 await dialog.getByRole('button',{name:/수동 업데이트/}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('phase9-popup-stored.png')});await dialog.getByRole('button',{name:/수동 업데이트/}).click();await expect(dialog.getByRole('button',{name:/갱신 중/})).toBeDisabled();expect(s.body).toEqual({startYear:2024,endYear:2025,period:'ALL'});expect(s.posts).toBe(1);
 await page.getByRole('button',{name:'재무제표 갱신 닫기'}).click();await page.reload();await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();await expect(page.getByRole('button',{name:/갱신 중/})).toBeDisabled();expect(s.posts).toBe(1);
 s.finished=true;s.fail=true;await expect(page.getByRole('button',{name:/수동 업데이트/})).toBeEnabled({timeout:10000});await dialog.locator('summary').click();await expect(page.getByText('업데이트에 실패했습니다. 잠시 후 다시 시도해 주세요.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);const box=await dialog.boundingBox();expect(box!.width).toBeLessThanOrEqual(info.project.use.viewport!.width);await page.screenshot({path:info.outputPath('phase9-popup-failed.png')});
 await page.getByRole('button',{name:'재무제표 갱신 닫기'}).click();await page.goto('/detail/value?view=chart&selected=1&endYear=2025');await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();await expect(page.getByRole('combobox',{name:'시작연도',exact:true})).toContainText('2023');await expect(page.getByRole('combobox',{name:'종료연도',exact:true})).toContainText('2025');
});
test('lot date styling and financial link preserve selection',async({page},info)=>{
 await fixture(page);await page.goto('/stocks/1?detailTab=holding');const date=page.getByTestId('lot-1').getByText('2026.10.01',{exact:true});await expect(date).toBeVisible();await expect(date).toHaveCSS('font-size','14px');await expect(date).toHaveCSS('font-weight','700');await expect(date).toHaveCSS('color','rgb(255, 255, 255)');await page.screenshot({path:info.outputPath('phase9-lot-date.png')});
 await setup(page);await page.getByRole('tab',{name:'요약',exact:true}).click();await page.getByRole('button',{name:'(재무제표)',exact:true}).click();await expect(page).toHaveURL(/stocks\/1\/financials/);await expect(page.getByTestId('financial-page')).toBeVisible();
});

test('phase10 single-row header and bounded touch tooltip',async({page},info)=>{
 await setup(page);await page.goto('/detail/value?view=chart&selected=1&endYear=2025');
 const title=page.getByText('재무지표',{exact:true}),button=page.getByRole('button',{name:'재무제표 갱신',exact:true}),mode=page.getByRole('button',{name:'연간',exact:true});
 await expect(title).toHaveCSS('font-size','14px');
 const bounds=await Promise.all([title,button,mode].map(x=>x.boundingBox()));
 const centers=bounds.map(b=>b!.y+b!.height/2);expect(Math.max(...centers)-Math.min(...centers)).toBeLessThan(2);
 for(let i=1;i<bounds.length;i++)expect(bounds[i]!.x).toBeGreaterThanOrEqual(bounds[i-1]!.x+bounds[i-1]!.width-1);
 const icon=page.getByRole('button',{name:'가치지표 미산출 사유와 계산 기준'});await icon.tap();const tooltip=page.getByRole('dialog',{name:'가치지표 안내'});await expect(tooltip).toBeVisible();
 const box=await tooltip.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(info.project.use.viewport!.width);
 await expect(tooltip.locator('..')).toHaveCSS('opacity','1');await page.screenshot({path:info.outputPath('phase10-tooltip.png')});await page.keyboard.press('Escape');await expect(tooltip).toBeHidden();await icon.tap();await page.mouse.click(1,1);await expect(tooltip).toBeHidden();
 await button.click();const dialog=page.getByRole('dialog');const start=dialog.getByRole('combobox',{name:'시작연도'}),end=dialog.getByRole('combobox',{name:'종료연도'});const a=await start.boundingBox(),b=await end.boundingBox();expect(a!.y).toBe(b!.y);
 await expect(start.locator('../..')).toHaveCSS('height','36px');await expect(dialog.getByRole('combobox',{name:'갱신범위'})).toContainText('연도 전체');
 await expect(dialog.locator('..')).toHaveCSS('opacity','1');await page.screenshot({path:info.outputPath('phase10-popup.png')});
});
test('phase10 real progress survives status errors, reentry and completes with collapsed report results',async({page})=>{
 const s=await setup(page);let statusError=false,terminal=false,statusReads=0;
 await page.route('**/api/securities/1/financial-refresh/99',async route=>{statusReads++;if(statusError)return route.fulfill({status:503,json:{error:{code:'UNAVAILABLE',message:'조회 오류'}}});return route.fulfill({json:{data:{state:terminal?'FINISHED':'PROCESSING',status:terminal?'PARTIAL':'RUNNING',fiscalYear:2024,startYear:2024,endYear:2025,period:'ANNUAL',finishedAt:terminal?'2026-10-07T05:00:00Z':null,progress:{currentYear:2025,currentPeriod:'ANNUAL',stage:'VALUATION',completed:1,total:2},results:[{fiscalYear:2024,period:'ANNUAL',status:'SUCCESS',valuationStatus:'SUCCESS'},...(terminal?[{fiscalYear:2025,period:'ANNUAL',status:'SUCCESS',valuationStatus:'PARTIAL',valuationReasons:{per:'종가 부족',pbr:'종가 부족'}}]:[])]}}});});
 await page.goto('/stocks/1/financials?endYear=2025');await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();await select(page,'갱신범위','사업보고서');await page.getByRole('button',{name:/수동 업데이트/}).click();
 await expect(page.getByRole('status')).toContainText('2024년 처리 완료 · 2025년 사업보고서 가치지표 보충 중');await expect(page.getByRole('combobox',{name:'시작연도'})).toBeDisabled();
 statusError=true;await expect(page.getByText(/진행 상태 조회 오류/)).toBeVisible({timeout:12000});await expect(page.getByRole('button',{name:/갱신 중/})).toBeDisabled();expect(s.posts).toBe(1);
 await page.getByRole('button',{name:'재무제표 갱신 닫기'}).click();await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();expect(s.posts).toBe(1);statusError=false;terminal=true;
 await expect(page.getByRole('button',{name:/수동 업데이트/})).toBeEnabled({timeout:12000});await expect(page.getByText('가치지표 보충 완료 1 · 보충 실패/근거 부족 1')).toBeVisible();await expect(page.getByText('종가 부족',{exact:true})).toBeHidden();await page.locator('summary').click();await expect(page.getByText('종가 부족',{exact:true})).toHaveCount(1);
 const n=statusReads;await page.waitForTimeout(3500);expect(statusReads).toBe(n);
});

for(const kind of ['SUCCESS','SKIPPED'] as const)test(`phase10 ${kind} summary and retry enablement`,async({page})=>{
 await setup(page);await page.route('**/api/securities/1/financial-refresh/99',route=>route.fulfill({json:{data:{state:'FINISHED',status:kind,fiscalYear:2025,startYear:2025,endYear:2025,period:'ANNUAL',finishedAt:'2026-10-07T05:00:00Z',results:[{fiscalYear:2025,period:'ANNUAL',status:kind==='SUCCESS'?'SUCCESS':'NO_DATA',valuationStatus:kind==='SUCCESS'?'SUCCESS':undefined}]}}}));
 await page.goto('/stocks/1/financials?endYear=2025');await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();await page.getByRole('button',{name:/수동 업데이트/}).click();await expect(page.getByRole('button',{name:/수동 업데이트/})).toBeEnabled();await expect(page.getByText(kind==='SUCCESS'?'가치지표 보충 완료 1 · 보충 실패/근거 부족 0':'보고서 기준: 공시 확인 완료 0 · 미공시 1 · 수집 실패 0')).toBeVisible();
});

test('phase10 quarter refresh excludes future placeholder years without changing chart selection',async({page},info)=>{
 const state=await setup(page);
 for(const url of ['/detail/value?view=chart&selected=1&mode=quarter&quarterStart=2026:4','/stocks/1/financials?mode=quarter&quarterYear=2026&quarter=4']){
  await page.goto(url);await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog.getByRole('combobox',{name:'시작연도',exact:true})).toContainText('2026');await expect(dialog.getByRole('combobox',{name:'종료연도',exact:true})).toContainText('2026');await expect(page.getByText('미래 기간은 제외하고 2026년까지 갱신합니다.')).toBeVisible();if(url.includes('/value')){await expect(dialog.locator('..')).toHaveCSS('opacity','1');await page.screenshot({path:info.outputPath('phase10-quarter-popup.png')});}await page.getByRole('button',{name:'재무제표 갱신 닫기'}).click();
  if(url.includes('/value'))await expect(page.getByRole('combobox',{name:'시작기간',exact:true})).toHaveValue('2026:4');else await expect(page.getByLabel('재무제표 시작분기')).toHaveValue('4');
 }
 expect(state.posts).toBe(0);
});
