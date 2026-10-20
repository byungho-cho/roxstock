import {swipeStock} from './financial-chart-gestures';
import {test,expect,type Page} from './authenticated-test';
const basis=(estimated:boolean)=>({year:estimated?2026:2025,label:estimated?'2026E':'2025년 결산',period:estimated?'ESTIMATE':'ANNUAL',isEstimated:estimated,source:'OPEN_DART',division:'CFS'});
const rows=[
 {id:'1',symbol:'000001',name:'정상컨센서스',w:'2',eps:'5',roe:'10',collectionStatus:'COMPLETE',metricBasis:basis(true)},
 {id:'2',symbol:'000002',name:'부분결산',w:'2',eps:'10',roe:'20',collectionStatus:'PARTIAL',metricBasis:basis(false)},
 {id:'3',symbol:'000003',name:'수집오류',w:null,eps:'-5',roe:'-1',collectionStatus:'ERROR',metricBasis:basis(false)},
 {id:'4',symbol:'000004',name:'유효한영',w:'0',eps:'0',roe:'0',collectionStatus:'PARTIAL',metricBasis:basis(false)},
].map(r=>({...r,market:'KOSPI',marketType:'KOSPI',currentPrice:'7700',previousClosePrice:'7600',priceUpdatedAt:'2026-10-13T11:00:00Z',epsYield:r.eps===null?null:String(Number(r.eps)/77),netIncome:r.id==='3'?'-100':r.id==='4'?'0':'10112143837',issuedShares:r.id==='1'?'100':null,capital:'1000',targetPrice:'10000',value:r.w,per:null,pbr:null,metricDate:'2025-12-31',collectionErrors:r.id==='3'?['SOURCE_FAILED']:[],missingReasons:r.id==='1'?{}:{issuedShares:'SHARES_BASIS_UNAVAILABLE'},sourceReasons:{shares:'동일 공시 보통주 근거 부족'},basisText:'검증된 연간 자료 · 단위 원',shareMissingReason:'역산이나 다른 기간 자료로 대체하지 않습니다.',fairPrices:[],notices:['주가 기준일과 재무 기준연도는 별도 기준입니다.']}));
async function fixture(page:Page){
 let hold=false;const gates:Array<()=>void>=[];const reads:string[]=[];
 await page.clock.setFixedTime(new Date('2026-10-14T05:50:00Z'));
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url());if(u.pathname.startsWith('/api/pages/'))return route.fulfill({status:404,json:{error:{message:'legacy fixture'}}});
  if(u.pathname==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'기본',isDefault:true,isActive:true},{id:'2',name:'다음',isActive:true}]}});
  if(u.pathname==='/api/value-analysis'||u.pathname==='/api/financial-statements'){
   reads.push(u.search);if(hold)await new Promise<void>(r=>gates.push(r));
   const sorts=(u.searchParams.get('sorts')??'w:desc').split(',').filter(Boolean).map(s=>s.split(':'));
   const query=u.searchParams.get('query')??'';
   const result=rows.filter(r=>r.name.includes(query)||r.symbol.includes(query)).sort((a,b)=>{for(const [key,direction] of sorts){const x=(a as any)[key],y=(b as any)[key];if(x==null&&y!=null)return 1;if(y==null&&x!=null)return -1;if(x!=null&&y!=null){const d=key==='name'?String(x).localeCompare(String(y)):Number(x)-Number(y);if(d)return direction==='asc'?d:-d;}}return a.symbol.localeCompare(b.symbol);});
   return route.fulfill({json:{data:{rows:result,total:result.length,year:Number(u.searchParams.get('year')??2026),market:'KOSPI',query,cache:{status:'HIT',generatedAt:'2026-10-13T11:30:00Z'}}}});
  }
  if(u.pathname.startsWith('/api/value-analysis/')){const row=rows.find(r=>r.id===u.pathname.split('/').at(-1));return route.fulfill({json:{data:row?{security:{id:row.id,name:row.name,symbol:row.symbol,currentPrice:row.currentPrice,previousClosePrice:row.previousClosePrice,priceUpdatedAt:row.priceUpdatedAt},year:2026,valuation:{metricDate:'2025-12-31',bps:'10000',eps:row.eps,roe:row.roe,per:null,pbr:null},w:row.w,fairPrices:[],requiredReturn:'8.0',equity:null,closingDate:null,rows:[],mode:'annual',startYear:2024,startQuarter:null,count:3,notices:[]}:null}});}
  return route.fulfill({json:{data:null}});
 });
 return {reads,hold:()=>{hold=true;},release:()=>{hold=false;gates.splice(0).forEach(r=>r());}};
}
for(const financial of [false,true])test(`${financial?'financial':'value'} basis, independent status colors, multi-order and accessible bounded tooltip`,async({page},info)=>{
 await fixture(page);await page.goto(financial?'/detail/financials':'/detail/value');const prefix=financial?'financial-row-':'value-row-';const first=page.getByTestId(prefix+'000001');await expect(first).toBeVisible();
 await expect(page.getByTestId('sort-w')).toContainText('1↓');await expect(page.getByTestId('sort-w')).toHaveCSS('color','rgb(251, 191, 36)');
 await expect(first.getByTestId('analysis-basis-year')).toHaveText('2026');await expect(first.getByTestId('analysis-basis-year')).toHaveCSS('color','rgb(251, 191, 36)');
 const second=page.getByTestId(prefix+'000002');await expect(second.getByTestId('analysis-basis-year')).toHaveCSS('color','rgb(96, 165, 250)');
 const icon=financial?'financial-basis':'value-basis';
 for(const [symbol,color] of [['000001','rgb(52, 211, 153)'],['000002','rgb(251, 191, 36)'],['000003','rgb(248, 113, 113)']])await expect(page.getByTestId(prefix+symbol).getByTestId(icon)).toHaveCSS('color',color);
 await page.screenshot({path:info.outputPath((financial?'financial':'value')+'-initial-after.png')});
 const url=page.url();await first.getByTestId(icon).focus();await page.keyboard.press('Enter');await expect(page.getByRole('tooltip')).toContainText('단위');expect(page.url()).toBe(url);const tip=(await page.getByRole('tooltip').boundingBox())!;expect(tip.x).toBeGreaterThanOrEqual(0);expect(tip.x+tip.width).toBeLessThanOrEqual(page.viewportSize()!.width);
 await page.screenshot({path:info.outputPath((financial?'financial':'value')+'-tooltip-after.png')});await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);
 await first.getByTestId(icon).click();const p=(await first.getByTestId(icon).boundingBox())!;await page.mouse.click(p.x+p.width/2,p.y+p.height/2);await expect(page.getByRole('tooltip')).toHaveCount(0);
 await first.getByTestId(icon).click();await page.locator('.MuiBackdrop-root:visible').click({position:{x:2,y:2}});await expect(page.getByRole('tooltip')).toHaveCount(0);expect(page.url()).toBe(url);
 await page.getByTestId('sort-eps').click();await expect(page.getByTestId('sort-eps')).toContainText('2↓');await expect(page.locator(`[data-testid^="${prefix}"]`).first()).toHaveAttribute('data-testid',prefix+'000002');
 await page.getByTestId('sort-w').click();await expect(page.getByTestId('sort-w')).toContainText('1↑');await expect(page.locator(`[data-testid^="${prefix}"]`).first()).toHaveAttribute('data-testid',prefix+'000004');
 await page.getByRole('button',{name:financial?'가중치(W) 정렬 해제':'W 정렬 해제'}).click();await expect(page.getByTestId('sort-eps')).toContainText('1↓');await expect(page.getByTestId('sort-w')).toHaveAttribute('aria-pressed','false');
 const input=page.getByRole('textbox',{name:financial?'재무제표 종목 검색':'종목 검색'});await input.fill('유효한영');await input.press('Enter');await expect(page.locator(`[data-testid^="${prefix}"]`)).toHaveCount(1);await expect(page.getByTestId(prefix+'000004')).toContainText('0원');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath((financial?'financial':'value')+'-after.png')});
});
test('late response cannot replace selected search and sorts',async({page})=>{
 const f=await fixture(page);await page.goto('/detail/value');await expect(page.getByTestId('value-row-000001')).toBeVisible();f.hold();await page.getByTestId('sort-eps').click();await page.getByRole('textbox',{name:'종목 검색'}).fill('유효한영');await page.getByRole('textbox',{name:'종목 검색'}).press('Enter');await expect.poll(()=>f.reads.some(v=>new URLSearchParams(v).get('query')==='유효한영')).toBe(true);f.release();await expect(page.getByTestId('value-row-000004')).toBeVisible();await expect(page.getByTestId('value-row-000001')).toHaveCount(0);
});
test('record previous main screens',async({page},info)=>{
 test.skip(!process.env.VALUE_BASELINE_URL,'Baseline supplied by CI');await fixture(page);
 for(const [name,path] of [['value','/detail/value'],['financial','/detail/financials']]){await page.goto(process.env.VALUE_BASELINE_URL+path);await expect(page.getByTestId((name==='value'?'value-row-':'financial-row-')+'000001')).toBeVisible();await page.screenshot({path:info.outputPath(name+'-before.png')});}
});

for(const financial of [false,true])test(`${financial?'financial':'value'} detail neighbors follow server multi-sort result`,async({page})=>{
 await fixture(page);await page.goto(financial?'/detail/financials':'/detail/value');await expect(page.getByTestId((financial?'financial-row-':'value-row-')+'000001')).toBeVisible();await page.getByTestId('sort-eps').click();await expect(page.locator(`[data-testid^="${financial?'financial-row-':'value-row-'}"]`).first()).toHaveAttribute('data-testid',(financial?'financial-row-':'value-row-')+'000002');
 await page.getByTestId((financial?'financial-row-':'value-row-')+'000002').click();
 if(financial){await page.getByRole('button',{name:'정상컨센서스',exact:true}).click();await expect(page).toHaveURL(/selected=1/);}
 else {await expect(page.getByRole('heading',{level:1})).toContainText('부분결산');await page.getByRole('button',{name:'재무지표',exact:true}).click();await swipeStock(page,true);await expect(page.getByRole('heading',{level:1})).toContainText('정상컨센서스');}
});
