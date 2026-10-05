import {expect,test,type Page} from '@playwright/test';
const rows=Array.from({length:120},(_,i)=>({id:String(i+1),symbol:String(i+1).padStart(6,'0'),name:'종목'+String(i+1).padStart(3,'0'),currentPrice:'10000',previousClosePrice:i===1?'11000':'9000',priceUpdatedAt:'2026-10-05T00:00:00Z',per:'12',pbr:'1.2',roe:'10',metricDate:'2026-10-05',w:i===119?null:'1.2'}));
async function fixture(page:Page,small=false){
 let failure=false,holdId:string|null=null,holdSearch:string|null=null;const releases:(()=>void)[]=[],requests:string[]=[];
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());requests.push(route.request().method()+' '+url.pathname+url.search);
  if(url.pathname==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'기본',isActive:true,isDefault:true}]}});
  if(url.pathname==='/api/value-analysis'){
   const query=url.searchParams.get('query')??'',year=Number(url.searchParams.get('year'));
   if(holdSearch===query)await new Promise<void>(resolve=>releases.push(resolve));
   if(failure)return route.fulfill({status:503,json:{error:{message:'수집 조회 실패'}}});
   return route.fulfill({json:{data:{rows:query==='없는종목'?[]:query==='둘째'?[rows[1]]:rows,total:query==='없는종목'?0:query==='둘째'?1:120,year,query}}});
  }
  if(url.pathname.startsWith('/api/value-analysis/')){
   const id=url.pathname.split('/').at(-1)!;
   if(holdId===id)await new Promise<void>(resolve=>releases.push(resolve));
   if(failure)return route.fulfill({status:503,json:{error:{message:'상세 조회 실패'}}});
   const mode=url.searchParams.get('mode'),startYear=Number(url.searchParams.get('startYear')),q=Number(url.searchParams.get('startQuarter')),count=Number(url.searchParams.get('count'));
   const data={security:{...rows[Number(id)-1],name:rows[Number(id)-1]?.name??'외부 종목'},year:Number(url.searchParams.get('year')),valuation:{metricDate:'2026-10-05',bps:'10000',eps:'1000',roe:'10',per:'12',pbr:'1.2'},w:'1.2',fairPrices:['0.7','0.8','0.9','1.0'].map(persistence=>({persistence,price:'12000'})),requiredReturn:'8',equity:'1000000000000',closingDate:'2025-12-31',mode,startYear,startQuarter:mode==='annual'?null:q,count,notices:['유동비율: 미수집입니다.'],rows:Array.from({length:count},(_,i)=>{const index=startYear*4+q-1+i,y=mode==='annual'?startYear+i:Math.floor(index/4),quarter=mode==='annual'?null:index%4+1;return {key:y+':'+(quarter===null?'ANNUAL':'Q'+quarter),label:String(y)+(quarter?' '+quarter+'Q':''),year:y,quarter,revenue:i===1?null:small?'1000000':'1000000000000',operatingProfit:small?'200000':'200000000000',netIncome:small?'100000':'100000000000',per:'12',pbr:'1.2',roe:'10',debtRatio:'50',currentRatio:null,revenueGrowth:'10',profitGrowth:'20',metricDate:'2026-10-05',source:'CFS',collectedAt:'2026-10-05',isDerived:false};})};
   return route.fulfill({json:{data}});
  }
  return route.fulfill({json:{data:[]}});
 });
 return {requests,fail:(value:boolean)=>{failure=value;},holdStock:(id:string)=>{holdId=id;},holdSearch:(q:string)=>{holdSearch=q;},release:()=>{holdId=null;holdSearch=null;releases.splice(0).forEach(resolve=>resolve());}};
}
async function ready(page:Page){await page.goto('/detail/value');await expect(page.getByTestId('value-row-000001')).toBeVisible();}
test('whole master searchable on Enter, current Seoul year, all 120 results accessible and price colors',async({page})=>{
 await fixture(page);await ready(page);await expect(page.getByRole('textbox',{name:'종목 검색'})).toBeFocused();await expect(page.getByLabel('기준연도')).toHaveValue('2026');await expect(page.getByText('120개',{exact:true})).toBeVisible();
 const loss=page.getByTestId('value-row-000002');expect(await loss.locator('span').last().evaluate(el=>getComputedStyle(el).color)).toBe('rgb(59, 130, 246)');
 await page.getByRole('button',{name:/더 보기/}).click();await expect(page.getByTestId('value-row-000120')).toContainText('W —');
 await page.getByLabel('종목 검색').fill('둘째');await page.getByLabel('종목 검색').press('Enter');await expect(page.getByTestId('value-row-000001')).toHaveCount(0);await expect(page.getByTestId('value-row-000002')).toBeVisible();await expect(page.getByText('1개',{exact:true})).toBeVisible();
});
test('cover detail endpoint navigation, chart mode/start preserved and no circular wrap',async({page})=>{
 const f=await fixture(page);await ready(page);await page.getByTestId('value-row-000001').click();await expect(page.getByTestId('value-detail')).toContainText('12,000원');await page.getByRole('button',{name:'재무지표 보기'}).click();await expect(page.getByTestId('value-chart-가치지표')).toContainText('우측 %');await page.getByRole('button',{name:'분기',exact:true}).click();await page.getByLabel('시작기간').selectOption('2025:4');await expect.poll(()=>f.requests.some(r=>r.includes('mode=quarter')&&r.includes('startYear=2025')&&r.includes('count=3'))).toBe(true);
 await page.getByRole('button',{name:'종목002',exact:true}).click();await expect(page.getByRole('heading',{name:'종목002',exact:true})).toBeVisible();await expect(page.getByLabel('시작기간')).toHaveValue('2025:4');await page.getByRole('button',{name:'종목001',exact:true}).click();await expect(page.getByRole('heading',{name:'종목001',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'',exact:true}).filter({hasText:'종목120'})).toHaveCount(0);
 expect(f.requests.every(r=>r.startsWith('GET '))).toBe(true);
});
test('tablet first selection, independent columns, 10 periods full-width chart, return keeps selection and both scroll positions',async({page})=>{
 await page.setViewportSize({width:725,height:396});const f=await fixture(page);await ready(page);await expect(page.getByTestId('value-detail')).toBeVisible();
 const left=page.locator('[data-scroll-region="value-left"]'),right=page.locator('[data-scroll-region="value-right"]');
 await left.evaluate(el=>el.scrollTop=500);await right.evaluate(el=>el.scrollTop=250);const before=await left.evaluate(el=>el.scrollTop);
 await page.getByRole('button',{name:'재무지표 보기'}).click();await expect(page.locator('[data-scroll-region]')).toHaveCount(0);await expect.poll(()=>f.requests.some(r=>r.includes('count=10'))).toBe(true);
 await page.getByRole('button',{name:'종목002',exact:true}).click();await expect(page.getByRole('heading',{name:'종목002',exact:true})).toBeVisible();await page.getByRole('button',{name:'뒤로가기'}).click();await expect(page.getByTestId('value-detail')).toBeVisible();await expect(page.getByTestId('value-detail').locator('..')).toContainText('종목002');expect(await left.evaluate(el=>el.scrollTop)).toBe(before);expect(await right.evaluate(el=>el.scrollTop)).toBe(0);
});
test('late stock response cannot overwrite current stock and stock transition hides old detail',async({page})=>{
 const f=await fixture(page);await ready(page);await page.getByTestId('value-row-000001').click();await page.getByRole('button',{name:'재무지표 보기'}).click();f.holdStock('2');await page.getByRole('button',{name:'종목002',exact:true}).click();await expect(page.getByText('갱신 중 · 마지막 성공 데이터를 표시합니다.')).toHaveCount(0);await expect(page.getByRole('heading',{name:'종목002',exact:true})).toBeVisible();await expect(page.getByTestId('value-chart-수익성')).toHaveCount(0);await page.getByRole('button',{name:'종목003',exact:true}).click();await expect(page.getByRole('heading',{name:'종목003',exact:true})).toBeVisible();f.release();await expect(page.getByRole('heading',{name:'종목003',exact:true})).toBeVisible();
});
test('late search, real empty and retry preserve prior successful list',async({page})=>{
 const f=await fixture(page);await ready(page);f.holdSearch('지연');await page.getByLabel('종목 검색').fill('지연');await page.getByLabel('종목 검색').press('Enter');await expect(page.getByTestId('value-row-000001')).toBeDisabled();await page.getByLabel('종목 검색').fill('없는종목');await page.getByLabel('종목 검색').press('Enter');await expect(page.getByTestId('value-empty')).toHaveText('내용이 없습니다.');f.release();await expect(page.getByTestId('value-empty')).toHaveText('내용이 없습니다.');
 await page.getByLabel('종목 검색').fill('둘째');await page.getByLabel('종목 검색').press('Enter');await expect(page.getByTestId('value-row-000002')).toBeVisible();f.fail(true);await page.getByLabel('기준연도').selectOption('2025');await expect(page.getByRole('alert')).toContainText('조회에 실패했습니다.');await expect(page.getByTestId('value-row-000002')).toBeVisible();await expect(page.getByTestId('value-empty')).toHaveCount(0);f.fail(false);await page.getByRole('button',{name:'재시도',exact:true}).click();await expect(page.getByText('2025년 · W 내림차순',{exact:true})).toBeVisible();
});
test('missing values are not zero points and different units have distinct axes',async({page})=>{
 await fixture(page);await ready(page);await page.getByTestId('value-row-000001').click();await page.getByRole('button',{name:'재무지표 보기'}).click();const chart=page.getByTestId('value-chart-수익성');expect(await chart.locator('svg g').filter({has:page.locator('path')}).first().locator('circle').count()).toBe(2);const stability=page.getByTestId('value-chart-안정성');expect(await stability.locator('svg path').nth(1).getAttribute('d')).toBe('  ');await expect(stability).toContainText('—');await expect(page.getByRole('img',{name:'가치지표 배 · 우측 %'})).toBeVisible();
});
test('swipe navigates horizontal intent only, chart and controls do not trigger stock move',async({page})=>{
 await fixture(page);await ready(page);await page.getByTestId('value-row-000002').click();
 const root=page.getByTestId('value-detail').locator('..');
 await root.evaluate(node=>{for(const [type,key,x,y]of [['touchstart','touches',200,100],['touchend','changedTouches',202,300]] as const){const event=new Event(type,{bubbles:true});Object.defineProperty(event,key,{value:[{clientX:x,clientY:y}]});node.dispatchEvent(event);}});await expect(page.getByRole('heading',{name:'종목002',exact:true})).toBeVisible();
 await root.evaluate(node=>{for(const [type,key,x,y]of [['touchstart','touches',220,100],['touchend','changedTouches',100,105]] as const){const event=new Event(type,{bubbles:true});Object.defineProperty(event,key,{value:[{clientX:x,clientY:y}]});node.dispatchEvent(event);}});await expect(page.getByRole('heading',{name:'종목003',exact:true})).toBeVisible();await page.getByRole('button',{name:'재무지표 보기'}).click();const chart=page.getByTestId('value-chart-수익성');await chart.evaluate(node=>{for(const [type,key,x,y]of [['touchstart','touches',200,100],['touchend','changedTouches',50,100]] as const){const event=new Event(type,{bubbles:true});Object.defineProperty(event,key,{value:[{clientX:x,clientY:y}]});node.dispatchEvent(event);}});await expect(page.getByRole('heading',{name:'종목003',exact:true})).toBeVisible();
});

test('same-stock period refresh preserves last success through failure and recovers with retry',async({page})=>{
 const f=await fixture(page);await ready(page);await page.getByTestId('value-row-000001').click();await page.getByRole('button',{name:'재무지표 보기'}).click();await expect(page.getByTestId('value-chart-수익성')).toBeVisible();
 f.holdStock('1');await page.getByRole('button',{name:'분기',exact:true}).click();await expect(page.getByText('갱신 중 · 마지막 성공 데이터를 표시합니다.')).toBeVisible();await expect(page.getByTestId('value-chart-수익성')).toBeVisible();await expect(page.getByText(/이전 기간 결과 · 연간/)).toBeVisible();
 f.fail(true);f.release();await expect(page.getByRole('alert')).toContainText('조회에 실패했습니다.');await expect(page.getByTestId('value-chart-수익성')).toBeVisible();f.fail(false);await page.getByRole('button',{name:'재시도',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByText(/이전 기간 결과/)).toHaveCount(0);
});

test('tablet chart back restores both scroll positions when the selected stock stays the same',async({page})=>{
 await page.setViewportSize({width:725,height:396});await fixture(page);await ready(page);await expect(page.getByTestId('value-detail')).toBeVisible();
 const left=page.locator('[data-scroll-region="value-left"]'),right=page.locator('[data-scroll-region="value-right"]');
 await left.evaluate(el=>el.scrollTop=500);await right.evaluate(el=>el.scrollTop=250);const beforeLeft=await left.evaluate(el=>el.scrollTop),beforeRight=await right.evaluate(el=>el.scrollTop);
 await page.getByRole('button',{name:'재무지표 보기'}).click();await expect(page.getByTestId('value-chart-수익성')).toBeVisible();await page.getByRole('button',{name:'뒤로가기'}).click();await expect(page.getByTestId('value-detail')).toBeVisible();
 expect(await left.evaluate(el=>el.scrollTop)).toBe(beforeLeft);expect(await right.evaluate(el=>el.scrollTop)).toBe(beforeRight);
});

test('small companies use a readable common monetary scale instead of rounded trillion zeros',async({page})=>{
 await fixture(page,true);await ready(page);await page.getByTestId('value-row-000001').click();await page.getByRole('button',{name:'재무지표 보기'}).click();
 await expect(page.getByRole('img',{name:'수익성 만원',exact:true})).toBeVisible();await expect(page.getByTestId('value-chart-수익성')).toContainText('100.0');await expect(page.getByTestId('value-chart-수익성')).toContainText('20.0');await expect(page.getByTestId('value-chart-수익성')).toContainText('10.0');
});
