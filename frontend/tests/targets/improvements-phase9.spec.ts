import {expect,test,type Page} from '@playwright/test';
import {fixture} from './phase3-fixture';
async function setup(page:Page){
 const stocks=[1,2].map(i=>({id:String(i),name:'종목'+i,symbol:'00000'+i,market:'KOSPI',currentPrice:'100',w:'1',fairPrices:[],valuation:null}));
 const state={posts:0,finished:false,fail:false,body:null as unknown,reads:[] as URL[]};
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url()),p=u.pathname;
  if(p==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'계좌',isActive:true,isDefault:true}]}});
  if(p.endsWith('/financial-refresh')&&route.request().method()==='POST'){state.posts++;state.body=route.request().postDataJSON();return route.fulfill({status:202,json:{data:{requestId:'99',state:'QUEUED'}}});}
  if(p.endsWith('/financial-refresh/99'))return route.fulfill({json:{data:{state:state.finished?'FINISHED':'QUEUED',status:state.fail?'FAILED':state.finished?'PARTIAL':'RUNNING',startYear:2024,endYear:2025,fiscalYear:2024,period:'ALL',finishedAt:state.finished?'2026-10-07T05:00:00Z':null,results:state.finished?[{fiscalYear:2024,period:'ANNUAL',status:state.fail?'FAILED':'SUCCESS',valuationStatus:'PARTIAL',valuationReasons:{per:'기간 말 과거 종가 부족'}}]:[]}}});
  if(p==='/api/value-analysis'||p==='/api/financial-statements')return route.fulfill({json:{data:{year:2026,rows:stocks,total:2}}});
  if(p.startsWith('/api/value-analysis/')||p.startsWith('/api/financial-statements/')){
   state.reads.push(u);const id=p.split('/').at(-1),custom=u.searchParams.get('period'),mode=u.searchParams.get('mode')??'annual';
   const end=Number(u.searchParams.get('endYear')??2026),start=Number(u.searchParams.get('startYear')??end-2),count=custom?Number(u.searchParams.get('endYear'))-start+1:p.includes('value-analysis')?Number(u.searchParams.get('count')):3;
   const chartRows=Array.from({length:count},(_,i)=>({key:`${start+i}:ANNUAL`,label:String(start+i),year:start+i,quarter:null,revenue:'10000000000',operatingProfit:'100000000',netIncome:'10000000',roe:'10',per:null,pbr:null,metricStatus:'PARTIAL',metricReasons:{per:'기간 말 과거 종가 부족'},source:'DART:CFS',collectedAt:'2026-10-07T01:00:00Z',isDerived:false}));
   return route.fulfill({json:{data:{security:stocks.find(s=>s.id===id),year:2026,mode,valuation:null,fairPrices:[],notices:['저장 데이터'],collectedAt:'2026-10-07T01:00:00Z',chartRows,rows:p.includes('financial-statements')?chartRows.map(r=>({...r,values:{revenue:r.revenue,operatingProfit:r.operatingProfit,netIncome:r.netIncome},growth:{},basis:'DART:CFS'})):chartRows}}});
  }return route.fulfill({json:{data:[]}});
 });return state;
}
async function select(page:Page,label:string,value:string){await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name:value,exact:true}).click();}
test('end boundaries, legacy URLs and neighbors; quarter selection survives',async({page})=>{
 const s=await setup(page);await page.goto('/detail/financials?selected=1&view=detail&startYear=2024');await expect(page.getByLabel('재무제표 종료연도')).toHaveValue('2026');await expect(page).toHaveURL(/endYear=2026/);
 for(const year of ['2015','2016','2017','2018','2019','2024','2026']){await page.getByLabel('재무제표 종료연도').selectOption(year);await expect(page.getByLabel('재무제표 종료연도')).toHaveValue(String(Math.max(2018,Number(year))));}
 await page.getByRole('button',{name:'종목2',exact:true}).click();await expect(page.getByLabel('재무제표 종료연도')).toHaveValue('2026');
 await page.getByRole('button',{name:'분기',exact:true}).click();await page.getByLabel('재무제표 시작연도').selectOption('2025');await page.getByLabel('재무제표 시작분기').selectOption('4');await page.getByRole('button',{name:'종목1',exact:true}).click();await expect(page.getByLabel('재무제표 시작연도')).toHaveValue('2025');await expect(page.getByLabel('재무제표 시작분기')).toHaveValue('4');
 await page.goto('/detail/value?view=chart&selected=1&annualStart=2024&count=10');await expect(page.getByRole('combobox',{name:'종료연도',exact:true})).toHaveValue('2026');await expect(page).toHaveURL(/endYear=2026/);await expect.poll(()=>s.reads.filter(u=>u.pathname.includes('value-analysis/')).at(-1)?.searchParams.get('count')).toBe('3');await expect(page.getByText('유동비율',{exact:true})).toHaveCount(0);
 await page.getByRole('combobox',{name:'종료연도',exact:true}).selectOption('2015');await expect(page.getByRole('combobox',{name:'종료연도',exact:true})).toHaveValue('2018');await page.getByRole('button',{name:'종목2',exact:true}).click();await expect(page.getByRole('combobox',{name:'종료연도',exact:true})).toHaveValue('2018');
});
test('popup reads chosen range without collection; persists request and reenables after failure',async({page},info)=>{
 const s=await setup(page);await page.goto('/stocks/1/financials?endYear=2026');await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(page.getByRole('combobox',{name:'시작연도',exact:true})).toContainText('2024');await expect(page.getByRole('combobox',{name:'종료연도',exact:true})).toContainText('2026');
 await select(page,'시작연도','2026년');await select(page,'종료연도','2025년');await expect(page.getByText('시작연도가 종료연도보다 늦습니다.')).toBeVisible();await expect(dialog.getByRole('button',{name:'수동 업데이트',exact:true})).toBeDisabled();expect(s.posts).toBe(0);
 await select(page,'시작연도','2024년');await dialog.getByRole('button',{name:'저장 데이터 차트 보기',exact:true}).click();await expect(page.getByTestId('financial-stored-preview')).toBeVisible();expect(s.posts).toBe(0);await expect.poll(()=>s.reads.at(-1)?.searchParams.get('endYear')).toBe('2025');
 await dialog.getByRole('button',{name:'수동 업데이트',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('phase9-popup-stored.png')});await dialog.getByRole('button',{name:'수동 업데이트',exact:true}).click();await expect(dialog.getByRole('button',{name:'갱신 중',exact:true})).toBeDisabled();expect(s.body).toEqual({startYear:2024,endYear:2025,period:'ALL'});expect(s.posts).toBe(1);
 await page.getByRole('button',{name:'재무제표 갱신 닫기'}).click();await page.reload();await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();await expect(page.getByRole('button',{name:'갱신 중',exact:true})).toBeDisabled();expect(s.posts).toBe(1);
 s.finished=true;s.fail=true;await expect(page.getByRole('button',{name:'수동 업데이트',exact:true})).toBeEnabled({timeout:10000});await expect(page.getByText('업데이트에 실패했습니다. 잠시 후 다시 시도해 주세요.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);const box=await dialog.boundingBox();expect(box!.width).toBeLessThanOrEqual(info.project.use.viewport!.width);await page.screenshot({path:info.outputPath('phase9-popup-failed.png')});
 await page.getByRole('button',{name:'재무제표 갱신 닫기'}).click();await page.goto('/detail/value?view=chart&selected=1&endYear=2025');await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();await expect(page.getByRole('combobox',{name:'시작연도',exact:true})).toContainText('2023');await expect(page.getByRole('combobox',{name:'종료연도',exact:true})).toContainText('2025');
});
test('lot date styling and financial link preserve selection',async({page},info)=>{
 await fixture(page);await page.goto('/stocks/1?detailTab=holding');const date=page.getByTestId('lot-1').getByText('2026.10.01',{exact:true});await expect(date).toBeVisible();await expect(date).toHaveCSS('font-size','14px');await expect(date).toHaveCSS('font-weight','700');await expect(date).toHaveCSS('color','rgb(255, 255, 255)');await page.screenshot({path:info.outputPath('phase9-lot-date.png')});
 await setup(page);await page.getByRole('tab',{name:'요약',exact:true}).click();await page.getByRole('button',{name:'(재무제표)',exact:true}).click();await expect(page).toHaveURL(/stocks\/1\/financials/);await expect(page.getByTestId('financial-page')).toBeVisible();
});
