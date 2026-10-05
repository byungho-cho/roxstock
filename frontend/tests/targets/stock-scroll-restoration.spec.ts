import {mkdir,writeFile} from 'node:fs/promises';
import {test,expect,type Page} from '@playwright/test';
import {fixture} from './stock-input-fixture';

type Category='holding'|'watchlist'|'traded';
const categories:Category[]=['holding','watchlist','traded'];
const security=(id:string,name:string)=>({id,name,symbol:id.padStart(6,'0'),marketType:'KOSPI',securityType:'COMMON',listType:'WATCHLIST',watchlistItemId:id,currentPrice:'1000',previousClosePrice:'900',priceUpdatedAt:'2026-10-03T00:00:00Z',valuation:null,memo:null});
async function scrollFixture(page:Page){
 const original=await fixture(page);
 const catalog=categories.flatMap((category,group)=>Array.from({length:30},(_,i)=>security(String((group+1)*100+i),'검증'+category+String(i).padStart(2,'0'))));
 const holdings=catalog.slice(0,30).map(s=>({securityId:s.id,name:s.name,symbol:s.symbol,marketType:s.marketType,quantity:'70',purchaseAmount:'7000',averagePurchasePrice:'100',currentPrice:'1000',previousClosePrice:'900',marketValue:'70000',unrealizedProfitLoss:'63000',unrealizedReturnRate:'900',priceChangeRate:'11.1',priceUpdatedAt:'2026-10-03T00:00:00Z',marketStatus:'NORMAL'}));
 const history=catalog.slice(60).map(s=>({id:'sell-'+s.id,type:'SELL',buyTradeId:'lot-'+s.id,tradedAt:'2026-09-18T03:00:00Z',security:s,quantity:'1',unitPrice:'1000',amount:'1000',realizedProfitLoss:'900',memo:null}));
 await page.route('**/api/securities?**',route=>new URL(route.request().url()).searchParams.has('query')?route.fallback():route.fulfill({json:{data:catalog}}));
 await page.route('**/api/accounts/a/holdings',route=>route.fulfill({json:{data:holdings}}));
 await page.route('**/api/accounts/a/trades**',route=>{const id=new URL(route.request().url()).searchParams.get('securityId');return route.fulfill({json:{data:history.filter(t=>!id||t.security.id===id),summary:{buyAmount:'0',sellAmount:'30000',realizedProfitLoss:'27000'},daily:[]}});});
 return original;
}
for(const category of categories)test(category+' restores actual scroll after input, browser back and header back',async({page},info)=>{
 const metrics:Record<string,unknown>[]=[];
 try{
  const f=await scrollFixture(page);const wide=page.viewportSize()!.width>=600;
  await page.goto('/stocks?tab='+category);await expect(page.getByTestId('stock-list')).toHaveAttribute('data-restoration-ready','true');
  await page.getByRole('textbox',{name:'목록 종목 검색'}).fill('검증');
  await page.getByRole('combobox',{name:'정렬 기준'}).click();await page.getByRole('option',{name:'종목명',exact:true}).click();
  if(category!=='watchlist')await page.getByRole('button',{name:'내림차순 · 오름차순으로 변경'}).click();
  const region=()=>wide?page.locator('[data-scroll-region="stock-table"]'):page.locator('main');
  const rows=()=>wide?page.locator('[role="row"][data-scroll-item]'):page.locator('[data-testid^="stock-card-"]');
  await expect(rows()).toHaveCount(30);
  const range=await region().evaluate(el=>({height:el.clientHeight,content:el.scrollHeight,maximum:el.scrollHeight-el.clientHeight}));
  metrics.push({stage:'fixture',category,viewport:page.viewportSize(),...range});
  expect(range.maximum,'Fixture must create real scrolling; zero-scroll is not a valid restoration test').toBeGreaterThan(420);
  await region().evaluate(el=>el.scrollTop=420);
  const before=await region().evaluate(el=>el.scrollTop);expect(before).toBeGreaterThan(0);
  const restored=async(stage:string)=>{
   await expect(page.getByTestId('stock-list')).toHaveAttribute('data-restoration-ready','true');
   await expect(page).toHaveURL(new RegExp('tab='+category+'$'));
   await expect(page.getByRole('textbox',{name:'목록 종목 검색'})).toHaveValue('검증');
   await expect(page.getByRole('combobox',{name:'정렬 기준'})).toContainText('종목명');
   await expect(page.getByRole('button',{name:'오름차순 · 내림차순으로 변경'})).toBeVisible();
   await expect.poll(()=>region().evaluate(el=>el.scrollTop),{message:stage+' must restore the saved position'}).toBeCloseTo(before,0);
   metrics.push({stage,before,after:await region().evaluate(el=>el.scrollTop)});
  };
  await page.getByRole('button',{name:'종목 추가',exact:true}).click();
  if(wide)await page.getByRole('button',{name:'입력 팝업 닫기'}).click();else await page.getByRole('button',{name:'뒤로가기',exact:true}).click();
  await restored('input-close');
  const choose=async()=>{
   const rect=(await region().boundingBox())!;
   const id=await rows().evaluateAll((els,r)=>els.find(el=>{const b=el.getBoundingClientRect();return b.top>=r.y&&b.bottom<=r.y+r.height;})?.getAttribute('data-scroll-item'),rect);
   expect(id,'A visible middle-list row is required').toBeTruthy();
   const target=wide?page.locator('[role="row"][data-scroll-item="'+id+'"]'):page.getByTestId('stock-card-'+id);
   await target.click({position:{x:wide?250:120,y:wide?14:60}});
   if(category==='watchlist')await expect(page).toHaveURL(new RegExp('/stocks/'+id+'/value$'));
   else if(wide)await expect(page.getByTestId('stock-right')).toBeVisible();
   else await expect(page).toHaveURL(new RegExp('/stocks/'+id+(category==='traded'?'\\?tab=trades':'')+'$'));
   if(category==='traded')await expect(page.getByRole('tab',{name:'거래내역',exact:true})).toHaveAttribute('aria-selected','true');
  };
  await choose();await page.goBack();await restored('browser-back');
  await choose();await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await restored('header-back');
  expect(f.writes).toHaveLength(0);
 }finally{await mkdir(info.outputDir,{recursive:true});const path=info.outputPath('scroll-metrics.json');await writeFile(path,JSON.stringify(metrics,null,2));await info.attach('scroll-metrics',{path,contentType:'application/json'});}
});
