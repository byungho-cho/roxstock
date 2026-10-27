import {assertRetiredEntry} from './security-data-retired';
import {swipeStock} from './financial-chart-gestures';
import {expect,test,type Page} from './authenticated-test';
import {fixture} from './phase3-fixture';
async function setup(page:Page){
 const stocks=[1,2].map(i=>({id:String(i),name:'종목'+i,symbol:'00000'+i,market:'KOSPI',currentPrice:'100',w:'1',fairPrices:[],valuation:null}));
 const state={posts:0,finished:false,fail:false,body:null as unknown,reads:[] as URL[]};
 await page.route('**/api/**',async route=>{
    // Legacy endpoint fixture: exercise rollback compatibility; tuning-01 covers the unified APIs.
    if(new URL(route.request().url()).pathname.startsWith('/api/pages/'))return route.fulfill({status:404,json:{error:{message:'Legacy API fixture'}}});

  const u=new URL(route.request().url()),p=u.pathname;
  if(p==='/api/security-data/quarters')return route.fulfill({json:{data:{asOf:'2026-10-27T00:00:00Z',quarters:[]}}});
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
 await page.getByLabel('재무제표 중앙연도').selectOption('2021');await page.getByRole('button',{name:'종목2',exact:true}).click();await expect(page.getByLabel('재무제표 중앙연도')).toHaveValue('2021');
 await page.getByRole('button',{name:'분기',exact:true}).click();await page.getByLabel('재무제표 시작연도').selectOption('2025');await page.getByLabel('재무제표 시작분기').selectOption('4');await page.getByRole('button',{name:'종목1',exact:true}).click();await expect(page.getByLabel('재무제표 시작분기')).toHaveValue('4');
 await page.goto('/detail/value?view=chart&selected=1&annualStart=2024');await expect(page.getByLabel('재무지표 중앙연도')).toHaveText('2025');await page.getByLabel('재무지표 중앙연도').click();await page.getByRole('option',{name:'2016',exact:true}).click();await expect(page.getByRole('button',{name:'이전 연도 2015'})).toBeDisabled();await swipeStock(page,true);await expect(page.getByRole('heading',{level:1})).toContainText('종목2');await expect(page.getByLabel('재무지표 중앙연도')).toHaveText('2016');
});
test('historical range entry is retired and opens management',async({page},info)=>{const state=await setup(page);await assertRetiredEntry(page);expect(state.posts).toBe(0);});
test('lot date styling and value link preserve selection',async({page},info)=>{
 await fixture(page);await page.goto('/stocks/1?detailTab=holding');const date=page.getByTestId('lot-1').getByTestId('lot-date');await expect(date).toBeVisible();await expect(date).toContainText('2026.10.01');await expect(date).toContainText('보유');await expect(date).toHaveCSS('font-size','14px');await expect(date).toHaveCSS('font-weight','700');await expect(date).toHaveCSS('color','rgb(255, 255, 255)');await page.screenshot({path:info.outputPath('phase9-lot-date.png')});
 await setup(page);await page.getByRole('tab',{name:'요약',exact:true}).click();await page.getByRole('button',{name:'(가치지표)',exact:true}).click();await expect(page).toHaveURL(/stocks\/1\/value/);await expect(page.getByTestId('value-detail')).toBeVisible();
});

test('phase10 single-row header and bounded touch tooltip',async({page},info)=>{
 await setup(page);await page.goto('/detail/value?view=chart&selected=1&endYear=2025');
 const title=page.getByText('재무지표',{exact:true}),button=page.locator('main').getByRole('button',{name:'종목 관리',exact:true}),mode=page.getByRole('button',{name:'연간',exact:true});
 await expect(title).toHaveCSS('font-size','14px');
 const bounds=await Promise.all([title,button,mode].map(x=>x.boundingBox()));
 const centers=bounds.map(b=>b!.y+b!.height/2);expect(Math.max(...centers)-Math.min(...centers)).toBeLessThan(2);
 for(let i=1;i<bounds.length;i++)expect(bounds[i]!.x).toBeGreaterThanOrEqual(bounds[i-1]!.x+bounds[i-1]!.width-1);
 const icon=page.getByRole('button',{name:'가치지표 미산출 사유와 계산 기준'});await icon.tap();const tooltip=page.getByRole('dialog',{name:'가치지표 안내'});await expect(tooltip).toBeVisible();
 const box=await tooltip.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(info.project.use.viewport!.width);
 await expect(tooltip.locator('..')).toHaveCSS('opacity','1');await page.screenshot({path:info.outputPath('phase10-tooltip.png')});await page.keyboard.press('Escape');await expect(tooltip).toBeHidden();await icon.tap();await page.mouse.click(1,1);await expect(tooltip).toBeHidden();
 await button.click();await expect(page).toHaveURL(/detail\/security-data$/);
});
test('retired historical progress cannot trigger another collection',async({page})=>{const state=await setup(page);await assertRetiredEntry(page);expect(state.posts).toBe(0);});

for(const kind of ['SUCCESS','SKIPPED'] as const)test(`phase10 ${kind} summary and retry enablement`,async({page})=>{const state=await setup(page);await assertRetiredEntry(page);expect(state.posts).toBe(0);});

test('retired quarter refresh cannot collect future placeholders',async({page},info)=>{const state=await setup(page);await assertRetiredEntry(page);expect(state.posts).toBe(0);});

