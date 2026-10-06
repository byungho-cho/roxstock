import {test,expect,type Locator,type Page} from '@playwright/test';
import {fixture} from './stock-input-fixture';

async function gesture(target:Locator, points:number[][], finish=true) {
 await target.evaluate((el,{points,finish})=>{
  const emit=(type:string,x:number,y:number)=>{const touch=new Touch({identifier:1,target:el,clientX:x,clientY:y});el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[touch],changedTouches:[touch]}));};
  emit('touchstart',200,100);for(const [dx,dy] of points)emit('touchmove',200+dx,100+dy);
  const last=points.at(-1)!;if(finish)emit('touchend',200+last[0],100+last[1]);
 },{points,finish});
}
async function end(target:Locator){await target.evaluate(el=>el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,cancelable:true,touches:[],changedTouches:[]})));}
const tablet=(page:Page)=>page.viewportSize()!.width>=600;
const security=(id:number,name:string,list='HOLDING',history=true)=>({id:String(id),symbol:String(id).padStart(6,'0'),name,marketType:'KOSPI',listType:list,watchlistItemId:String(id),hasTradeHistory:history,currentPrice:'200',previousClosePrice:'190',priceUpdatedAt:'2026-10-02T00:00:00Z',valuation:null});
async function setup(page:Page){
 await fixture(page);
 const securities=[...Array.from({length:20},(_,i)=>security(i+1,`검색종목 ${String(i+1).padStart(2,'0')}`)),...Array.from({length:6},(_,i)=>security(31+i,`관심검색 ${i+1}`,'WATCHLIST',false)),security(70,'수동보유','HOLDING',false),security(80,'전량매도','TRADED',true)];
 const reads:URL[]=[];let fail=false,pending=false;const releases:Array<()=>void>=[];
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(route.request().method()!=='GET')return route.fallback();
  if(!['/api/securities','/api/value-analysis'].includes(path)&&!path.includes('/value-analysis/')&&!path.endsWith('/holdings')&&!path.endsWith('/buy-lots')&&!path.endsWith('/trades'))return route.fallback();
  reads.push(url);
  if(path==='/api/securities'){
   if(pending)await new Promise<void>(resolve=>releases.push(resolve));
   return route.fulfill({status:fail?500:200,json:fail?{error:{message:'조회 실패'}}:{data:securities}});
  }
  if(path.endsWith('/holdings'))return route.fulfill({json:{data:securities.filter(s=>s.hasTradeHistory&&s.listType==='HOLDING').map(s=>({securityId:s.id,symbol:s.symbol,name:s.name,quantity:'10',purchaseAmount:'1000',averagePurchasePrice:'100',currentPrice:'200',previousClosePrice:'190',marketValue:String(2000+Number(s.id)),unrealizedProfitLoss:'1000',unrealizedReturnRate:'100',priceChangeRate:'5',priceUpdatedAt:s.priceUpdatedAt}))}});
  if(path.endsWith('/trades')){const sid=url.searchParams.get('securityId'),data=securities.filter(s=>s.hasTradeHistory&&(!sid||s.id===sid)).map(s=>({id:'trade-'+s.id,type:s.listType==='TRADED'?'SELL':'BUY',security:{id:s.id,symbol:s.symbol,name:s.name},tradedAt:'2026-10-01T00:00:00Z',quantity:'10',unitPrice:'100',amount:'1000',realizedProfitLoss:s.listType==='TRADED'?'1000':null}));return route.fulfill({json:{data,summary:{buyAmount:'1000',sellAmount:'2000',realizedProfitLoss:'1000'},daily:[]}});}
  if(path.endsWith('/buy-lots')){const sid=url.searchParams.get('securityId'),s=securities.find(item=>item.id===sid);const data=s?.hasTradeHistory&&s.listType==='HOLDING'?Array.from({length:6},(_,i)=>({id:`${sid}-lot-${i}`,security:{id:sid,name:s.name,symbol:s.symbol},boughtAt:'2026-10-01T00:00:00Z',quantity:'10',soldQuantity:'0',remainingQuantity:'10',unitPrice:'100',sellTrades:[]})):[];return route.fulfill({json:{data}});}
  if(path==='/api/value-analysis')return route.fulfill({json:{data:{rows:securities.map(s=>({...s,per:null,pbr:null,roe:null,w:null,metricDate:null})),total:securities.length,year:2026,query:''}}});
  const s=securities.find(s=>s.id===path.split('/').at(-1))!;
  return route.fulfill({json:{data:{security:s,year:Number(url.searchParams.get('year')),valuation:null,w:null,fairPrices:[],requiredReturn:'8',equity:null,closingDate:null,rows:[],mode:url.searchParams.get('mode'),startYear:Number(url.searchParams.get('startYear')),startQuarter:1,count:Number(url.searchParams.get('count')),notices:[]}}});
 });
 return {reads,delay:()=>{pending=true;},release:()=>{pending=false;releases.splice(0).forEach(fn=>fn());},fail:()=>{fail=true;}};
}
async function selectStock(page:Page,id:number,name:string){
 if(tablet(page))await page.getByRole('row',{name:name+' 상세보기',exact:true}).click();
 else await page.getByTestId('stock-card-'+id).getByRole('button',{name:name+' 상세보기',exact:true}).click();
}
const detail=(page:Page)=>tablet(page)?page.getByTestId('stock-right'):page.locator('[data-detail-swipe]').first();

test('detail follows filtered, sorted, favorite-first list; stops at ends; prefetch and back preserve list',async({page})=>{
 const state=await setup(page);await page.goto('/stocks?tab=holding');
 await page.getByRole('textbox',{name:'목록 종목 검색'}).fill('검색종목');
 await page.getByRole('combobox',{name:'정렬 기준'}).click();await page.getByRole('option',{name:'종목명',exact:true}).click();
 await page.getByRole('button',{name:'내림차순 · 오름차순으로 변경'}).click();
 await page.getByRole('button',{name:tablet(page)?'검색종목 03 즐겨찾기':'검색종목 03 즐겨찾기 추가',exact:true}).click();
 const condition=await page.getByTestId('stock-list').getAttribute('data-list-condition');
 const region=tablet(page)?page.locator('[data-scroll-region="stock-table"]'):page.locator('main');
 await region.evaluate(el=>el.scrollTop=0);const top=await region.evaluate(el=>el.scrollTop);
 await selectStock(page,3,'검색종목 03');await expect(page.getByTestId('lot-3-lot-0')).toBeVisible();
 await expect.poll(()=>state.reads.some(url=>url.pathname.endsWith('/buy-lots')&&url.searchParams.get('securityId')==='1')).toBe(true);
 await gesture(detail(page),[[90,0]]);await expect(page.getByTestId('lot-3-lot-0')).toBeVisible();
 await gesture(detail(page),[[-90,0]]);await expect(page.getByTestId('lot-1-lot-0')).toBeVisible();
 await expect(page.locator('[data-testid="stock-detail-content"] .MuiSkeleton-root')).toHaveCount(0);
 await gesture(detail(page),[[-90,0]]);await expect(page.getByTestId('lot-2-lot-0')).toBeVisible();
 await gesture(detail(page),[[90,0]]);await expect(page.getByTestId('lot-1-lot-0')).toBeVisible();
 await page.getByRole('button',{name:'뒤로가기',exact:true}).click();
 await expect(page.getByTestId('stock-list')).toHaveAttribute('data-list-condition',condition!);await expect(page.getByRole('textbox',{name:'목록 종목 검색'})).toHaveValue('검색종목');
 await expect.poll(()=>region.evaluate(el=>el.scrollTop)).toBeCloseTo(top,0);
 // A one-row search must not wrap either way.
 await page.getByRole('textbox',{name:'목록 종목 검색'}).fill('검색종목 20');await selectStock(page,20,'검색종목 20');
 await expect(page.getByTestId('lot-20-lot-0')).toBeVisible();await gesture(detail(page),[[-90,0]]);await gesture(detail(page),[[90,0]]);await expect(page.getByTestId('lot-20-lot-0')).toBeVisible();
});

test('axis locks vertical and diagonal gestures; controls and list cards never navigate',async({page})=>{
 await setup(page);await page.goto('/stocks?tab=holding');
 if(!tablet(page)){await gesture(page.getByTestId('stock-card-1'),[[-90,0]]);await expect(page).toHaveURL(/\/stocks\?tab=holding$/);}
 await selectStock(page,1,'검색종목 01');await expect(page.getByTestId('lot-1-lot-0')).toBeVisible();
 for(const points of [[[0,20],[-100,22]],[[-20,20],[-100,22]],[[10,120]],[[-50,35]]]){await gesture(detail(page),points);await expect(page.getByTestId('lot-1-lot-0')).toBeVisible();}
 await gesture(page.getByRole('tab',{name:'보유 현황',exact:true}),[[-90,0]]);await expect(page.getByTestId('lot-1-lot-0')).toBeVisible();
 await detail(page).evaluate(el=>{const touch=new Touch({identifier:1,target:el,clientX:200,clientY:100});el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch]}));el.dispatchEvent(new TouchEvent('touchcancel',{bubbles:true,touches:[]}));});
 await expect(page.getByTestId('lot-1-lot-0')).toBeVisible();
});

test('native touch scrolls the actual cover/tablet detail region without switching stocks',async({page})=>{
 await setup(page);await page.goto('/stocks?tab=holding');await selectStock(page,1,'검색종목 01');await expect(page.getByTestId('lot-1-lot-0')).toBeVisible();
 const region=tablet(page)?detail(page):page.locator('main');await region.evaluate(el=>el.scrollTop=0);const box=(await region.boundingBox())!,x=box.x+box.width-3,y=box.y+box.height-35;
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let step=1;step<=5;step++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-step*18}]});await page.waitForTimeout(20);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(()=>region.evaluate(el=>el.scrollTop)).toBeGreaterThan(30);await expect(page.getByTestId('stock-detail-content')).toContainText('목표수익률');
 expect(await page.getByTestId('stock-detail-content').getAttribute('data-list-condition')).toContain('1');
});

test('watchlist value detail swipes only the source order and preloads adjacent data',async({page})=>{
 const state=await setup(page);await page.goto('/stocks?tab=watchlist');await page.getByRole('textbox',{name:'목록 종목 검색'}).fill('관심검색');await selectStock(page,31,'관심검색 1');
 await expect(page.getByTestId('value-detail')).toBeVisible();await expect.poll(()=>state.reads.some(url=>url.pathname==='/api/value-analysis/32')).toBe(true);
 const area=tablet(page)?page.locator('[data-scroll-region="value-right"]'):page.locator('[data-detail-swipe]');
 await gesture(area,[[90,0]]);await expect(page).toHaveURL(/\/stocks\/31\/value/);
 await gesture(area,[[-90,0]]);await expect(page).toHaveURL(/\/stocks\/32\/value/);await expect(page.getByTestId('value-detail')).toBeVisible();await expect(area.locator('.MuiCircularProgress-root')).toHaveCount(0);
 await gesture(area,[[0,20],[-100,22]]);await expect(page).toHaveURL(/\/stocks\/32\/value/);
 await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page).toHaveURL(/\/stocks\?tab=watchlist$/);await expect(page.getByRole('textbox',{name:'목록 종목 검색'})).toHaveValue('관심검색');
});

test('classification button is absent for empty/history states and allowed only with no trades',async({page})=>{
 await setup(page);await page.goto('/stocks?tab=holding');await selectStock(page,70,'수동보유');
 await expect(page.getByTestId('stock-detail-content')).toContainText('내용이 없습니다.');await expect(page.getByRole('button',{name:/분류 변경/})).toHaveCount(0);
 await page.getByRole('tab',{name:'요약',exact:true}).click();await expect(page.getByRole('button',{name:'보유종목 · 분류 변경'})).toBeVisible();
 await page.getByRole('tab',{name:'거래내역',exact:true}).click();await expect(page.getByRole('button',{name:/분류 변경/})).toHaveCount(0);
 await page.goto('/stocks?tab=holding');await selectStock(page,1,'검색종목 01');await page.getByRole('tab',{name:'요약',exact:true}).click();await expect(page.getByRole('button',{name:/분류 변경/})).toHaveCount(0);
 await page.goto('/stocks?tab=traded');await selectStock(page,80,'전량매도');await page.getByRole('tab',{name:'요약',exact:true}).click();await expect(page.getByRole('button',{name:/분류 변경/})).toHaveCount(0);
});

test('pull translates the active region and rotates the icon; cancel, duplicate lock, errors and latest quote are preserved',async({page})=>{
 const state=await setup(page);await page.goto('/stocks?tab=holding');await expect(page.getByTestId('stock-list')).toHaveAttribute('data-restoration-ready','true');
 const region=tablet(page)?page.locator('[data-scroll-region="stock-table"]'):page.locator('main'),target=tablet(page)?region:page.getByTestId('stock-list');
 const initial=state.reads.filter(url=>url.pathname==='/api/securities').length,condition=await page.getByTestId('stock-list').getAttribute('data-list-condition');
 await gesture(target,[[0,50]],false);await expect(page.getByTestId('pull-refresh')).toBeVisible();await expect(page.getByTestId('pull-refresh')).toHaveText('');
 expect(await page.getByTestId('pull-refresh-rotation').evaluate(el=>getComputedStyle(el).transform)).not.toBe('none');
 const box=(await region.boundingBox())!,icon=(await page.getByTestId('pull-refresh').boundingBox())!;expect(icon.x+icon.width/2).toBeCloseTo(box.x+box.width/2,0);
 expect(await region.evaluate(el=>el.scrollTop)).toBe(0);expect(Number(await region.getAttribute('data-pull-distance'))).toBeGreaterThan(0);await end(target);await expect(page.getByTestId('pull-refresh')).toHaveCount(0);expect(state.reads.filter(url=>url.pathname==='/api/securities').length).toBe(initial);
 state.delay();await gesture(target,[[0,160]]);await expect(page.getByTestId('pull-refresh')).toHaveAttribute('data-refreshing','true');await expect(page.getByRole('status').filter({hasText:'새로고침 중'})).toHaveCount(1);
 await gesture(target,[[0,160]]);await expect.poll(()=>state.reads.filter(url=>url.pathname==='/api/securities').length).toBe(initial+1);await expect(page.getByTestId('stock-list')).toHaveAttribute('data-list-condition',condition!);
 await expect(page.getByTestId('stock-list').getByTestId('price-timestamp').first()).toHaveText('09:00');state.release();await expect(page.getByTestId('pull-refresh')).toHaveCount(0);
 state.fail();await gesture(target,[[0,160]]);await expect(page.getByRole('alert').filter({hasText:'새로고침에 실패했습니다.'})).toBeVisible({timeout:15000});await expect(page.getByTestId('stock-list').getByTestId('price-timestamp').first()).toHaveText('09:00');await expect(page.getByRole('alert').filter({hasText:'새로고침에 실패했습니다.'})).toHaveCount(0);
});

test('home card pull animates content, protects inputs, preserves taps and failed data',async({page})=>{
 const state=await fixture(page);await page.route('**/api/accounts/*/buy-lots**',route=>route.fulfill({json:{data:[]}}));
 let blocked=false,failed=false;const releases:Array<()=>void>=[];
 await page.route('**/api/accounts/*/dashboard',async route=>{if(blocked)await new Promise<void>(resolve=>releases.push(resolve));if(failed)return route.fulfill({status:500,json:{error:{message:'test failure'}}});return route.fallback();});
 await page.goto('/');const card=page.getByTestId('home-trend-card').getByRole('button');await expect(card).toBeVisible();
 const main=page.locator('main'),header=page.locator('.MuiToolbar-root').first();const top=(await header.boundingBox())!.y;
 const count=()=>state.reads.filter(path=>path.endsWith('/dashboard')).length,before=count();
 await gesture(card,[[0,60]],false);await expect(main).toHaveAttribute('data-pull-distance','24');expect((await header.boundingBox())!.y).toBe(top);
 await end(card);await expect.poll(()=>main.getAttribute('data-pull-distance')).toBeNull();expect(count()).toBe(before);
 blocked=true;await gesture(card,[[0,160]]);await expect(page.getByTestId('pull-refresh')).toHaveAttribute('data-refreshing','true');await expect(main).toHaveAttribute('data-pull-distance','55');
 await expect(page.getByTestId('pull-refresh-rotation')).toHaveCSS('animation-name','pull-refresh-spin');
 await card.evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1})));await expect(page).toHaveURL(/\/$/);
 await gesture(card,[[0,160]]);blocked=false;releases.splice(0).forEach(resolve=>resolve());await expect.poll(count).toBe(before+1);await expect.poll(()=>main.getAttribute('data-pull-distance')).toBeNull();
 await main.evaluate(el=>{const input=document.createElement('input');input.setAttribute('aria-label','protected-input');el.prepend(input);});
 await gesture(page.getByRole('textbox',{name:'protected-input'}),[[0,160]]);expect(count()).toBe(before+1);
 await main.evaluate(el=>{el.style.height='160px';el.style.flex='none';el.scrollTop=30;});expect(await main.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await gesture(card,[[0,160]]);expect(count()).toBe(before+1);await main.evaluate(el=>{el.style.height='';el.style.flex='';el.scrollTop=0;});
 failed=true;await gesture(card,[[0,160]]);await expect(page.getByRole('alert').filter({hasText:'새로고침에 실패했습니다.'})).toBeVisible({timeout:15000});await expect(card).toBeVisible();await expect.poll(()=>main.getAttribute('data-pull-distance')).toBeNull();
 await gesture(card,[[0,3]]);await card.click();await expect(page).toHaveURL(/\/assets$/);
});

test('detail blank body and button drags navigate without clicks; tablet left is isolated',async({page})=>{
 await setup(page);await page.goto('/stocks?tab=holding');await page.getByRole('textbox',{name:'목록 종목 검색'}).fill('검색종목');await page.getByRole('combobox',{name:'정렬 기준'}).click();await page.getByRole('option',{name:'종목명',exact:true}).click();await page.getByRole('button',{name:'내림차순 · 오름차순으로 변경'}).click();await selectStock(page,1,'검색종목 01');await expect(page.getByTestId('lot-1-lot-0')).toBeVisible();
 const area=detail(page);
 if(tablet(page)){await gesture(page.getByTestId('stock-left'),[[-100,0]]);await expect(page.getByTestId('lot-1-lot-0')).toBeVisible();await gesture(area,[[0,160]]);await expect(page.getByTestId('pull-refresh')).toHaveCount(0);}
 const button=page.getByRole('button',{name:'매수',exact:true});await gesture(button,[[-100,0]]);await button.evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1})));
 await expect(page.getByTestId('lot-2-lot-0')).toBeVisible();await expect(page).not.toHaveURL(/\/trade/);
 await page.getByTestId('stock-detail-content').evaluate(el=>el.style.display='none');
 const rect=(await area.boundingBox())!,mainRect=(await page.locator('main').boundingBox())!;expect(rect.height).toBeGreaterThanOrEqual(mainRect.height-1);
 await gesture(area,[[-100,0]]);await expect(page).toHaveURL(tablet(page)?/selected=3/:/\/stocks\/3/);await expect(page.getByTestId('pull-refresh')).toHaveCount(0);
});

test('native home card pull refreshes and tablet left pull leaves detail fixed',async({page})=>{
 const home=await fixture(page);await page.route('**/api/accounts/*/buy-lots**',route=>route.fulfill({json:{data:[]}}));await page.goto('/');
 const card=page.getByTestId('home-trend-card');await expect(card).toBeVisible();await page.locator('main').evaluate(el=>el.scrollTop=0);
 const box=(await card.boundingBox())!,x=box.x+20,y=box.y+12,before=home.reads.filter(p=>p.endsWith('/dashboard')).length;
 const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+i*18}]});await page.waitForTimeout(20);}
 await expect(page.locator('main')).toHaveAttribute('data-pull-distance',/^[5-9][0-9]/);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(()=>home.reads.filter(p=>p.endsWith('/dashboard')).length).toBe(before+1);await expect(page).toHaveURL(/\/$/);
 if(tablet(page)){
  const state=await setup(page);await page.goto('/stocks?tab=holding');await selectStock(page,1,'검색종목 01');await expect(page.getByTestId('lot-1-lot-0')).toBeVisible();
  const left=page.getByTestId('stock-left'),right=page.getByTestId('stock-right');await left.evaluate(el=>el.scrollTop=0);const top=(await right.boundingBox())!.y;
  state.delay();await gesture(left,[[0,160]]);await expect(left).toHaveAttribute('data-pull-distance','55');expect((await right.boundingBox())!.y).toBe(top);expect(await right.getAttribute('data-pull-distance')).toBeNull();state.release();await expect.poll(()=>left.getAttribute('data-pull-distance')).toBeNull();
 }
});
