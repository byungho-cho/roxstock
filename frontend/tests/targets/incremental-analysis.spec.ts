import {test,expect} from '@playwright/test';
for(const screen of ['value','financials'] as const){
 test(`${screen}: buffer 50 rows after initial 20+30 and reveal without changing original rows`,async({page})=>{
  await page.route('**/api/pages/read',r=>r.fulfill({status:404,body:''}));
  const rows=Array.from({length:125},(_,i)=>({id:String(i+1),name:'종목'+(i+1),symbol:String(i+1).padStart(6,'0'),market:'KOSPI',marketType:'KOSPI',currentPrice:'10000',previousClosePrice:'9000',w:'1',roe:'10',eps:'100',epsYield:'1',capital:'100000000',netIncome:'10000000',issuedShares:'10000',fairPrices:[]}));
  const endpoint=screen==='value'?'value-analysis':'financial-statements',calls:{offset:number;limit:number}[]=[];
  let release!:()=>void;
  await page.route(`**/api/${endpoint}?*`,async route=>{
   const p=new URL(route.request().url()).searchParams,offset=Number(p.get('offset')),limit=Number(p.get('limit'));calls.push({offset,limit});
   if(offset===20)await new Promise<void>(resolve=>release=resolve);
   await route.fulfill({json:{data:{rows:rows.slice(offset,offset+limit),total:125,year:2026,market:'KOSPI',query:'',...(offset===0?{navigation:rows.map(({id,name,symbol})=>({id,name,symbol}))}:{})}}});
  });
  const selector=`[data-testid^="${screen==='value'?'value':'financial'}-row-"]`;
  await page.goto(`/detail/${screen}?centerYear=2025`);
  await expect.poll(()=>!!release).toBe(true);await expect(page.locator(selector)).toHaveCount(20);
  await page.locator(selector).first().evaluate(element=>{
   const state={element,mutations:0};(window as any).__firstAnalysisRow=state;
   new MutationObserver(records=>state.mutations+=records.length).observe(element,{subtree:true,childList:true,attributes:true,characterData:true});
  });
  release();await expect(page.locator(selector)).toHaveCount(50);
  expect(await page.locator(selector).first().evaluate(element=>{const state=(window as any).__firstAnalysisRow;return {same:state.element===element,mutations:state.mutations};})).toEqual({same:true,mutations:0});
  await expect.poll(()=>calls).toEqual([{offset:0,limit:20},{offset:20,limit:30},{offset:50,limit:50}]);
  const more=page.getByRole('button',{name:'더 보기 (50 / 125)',exact:true});await expect(more).toBeVisible();
  expect(await more.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.parentElement!.getBoundingClientRect();return Math.abs((a.left+a.right)/2-(b.left+b.right)/2)<2;})).toBe(true);
  await more.click();await expect(page.locator(selector)).toHaveCount(100);
  await expect.poll(()=>calls).toEqual([{offset:0,limit:20},{offset:20,limit:30},{offset:50,limit:50},{offset:100,limit:50}]);
  await expect(page.locator(selector)).toHaveCount(100);
  expect(await page.locator(selector).first().evaluate(element=>{const state=(window as any).__firstAnalysisRow;return {same:state.element===element,mutations:state.mutations};})).toEqual({same:true,mutations:0});
  await page.getByRole('button',{name:'더 보기 (100 / 125)',exact:true}).click();await expect(page.locator(selector)).toHaveCount(125);
  await expect(page.getByRole('button',{name:/더 보기/})).toHaveCount(0);
 });
}
