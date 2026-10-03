import {test,expect,type Page,type Locator} from '@playwright/test';
import {fixture} from './stock-input-fixture';
const tablet=(page:Page)=>page.viewportSize()!.width>=600;
const row=(page:Page,id:string)=>tablet(page)?page.locator(`[role="row"][data-scroll-item="${id}"]`):page.getByTestId('stock-card-'+id);
const region=(page:Page)=>tablet(page)?page.locator('[data-scroll-region="stock-table"]'):page.locator('main');
const favorite=(card:Locator)=>card.getByRole('button',{name:/즐겨찾기/});
const clickBody=async(card:Locator)=>{await card.scrollIntoViewIfNeeded();await card.click({position:{x:card.page().viewportSize()!.width>=600?Math.min(250,(await card.boundingBox())!.width-20):120,y:card.page().viewportSize()!.width>=600?14:60}});};
const waitReady=async(page:Page)=>expect(page.getByTestId('stock-list')).toHaveAttribute('data-restoration-ready','true');

test('all classifications keep their detail destination; nested controls, drag and selection do not navigate',async({page})=>{
 await fixture(page);await page.goto('/stocks?tab=holding');await waitReady(page);
 const holding=row(page,'1');await favorite(holding).click();await expect(page).toHaveURL(/tab=holding$/);
 await holding.getByRole('button',{name:'현대자동차 가치지표'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await holding.dispatchEvent('pointerdown',{clientX:10,clientY:10});await holding.dispatchEvent('pointermove',{clientX:10,clientY:70});await holding.dispatchEvent('click');await expect(page).toHaveURL(/tab=holding$/);
 await holding.evaluate(el=>{const selection=window.getSelection()!,range=document.createRange();range.selectNodeContents(el);selection.removeAllRanges();selection.addRange(range);});await holding.dispatchEvent('click');await expect(page).toHaveURL(/tab=holding$/);await page.evaluate(()=>window.getSelection()?.removeAllRanges());
 await clickBody(holding);await expect(page.getByTestId('lot-lot1')).toBeVisible();await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page).toHaveURL(/tab=holding$/);
 await page.getByRole('tab',{name:'관심종목'}).click();await clickBody(row(page,'2'));await expect(page).toHaveURL(/\/stocks\/2\/value$/);await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await waitReady(page);await expect(page.getByRole('tab',{name:'관심종목'})).toHaveAttribute('aria-selected','true');
 await page.getByRole('tab',{name:'거래종목'}).click();await clickBody(row(page,'9'));await expect(page.getByRole('tab',{name:'거래내역',exact:true})).toHaveAttribute('aria-selected','true');
});

test('favorites lead both directions in every tab and share the active heart border without resizing',async({page})=>{
 await fixture(page);await page.goto('/stocks?tab=holding');await waitReady(page);
 for(const [tab,id] of [['보유종목','1'],['관심종목','2'],['거래종목','9']] as const){
  await page.getByRole('tab',{name:tab}).click();const card=row(page,id);await card.scrollIntoViewIfNeeded();const before=await card.boundingBox();const normal=await card.evaluate(el=>getComputedStyle(el).borderTopColor);
  await favorite(card).click();await expect.poll(()=>page.locator('[data-scroll-item]').first().getAttribute('data-scroll-item')).toBe(id);
  const heartColor=await favorite(card).evaluate(el=>getComputedStyle(el).color);await expect(card).toHaveCSS('border-top-color',heartColor);const after=await card.boundingBox();expect(after!.height).toBe(before!.height);expect(after!.width).toBe(before!.width);
  const direction=page.getByRole('button',{name:/내림차순|오름차순/});await direction.click();await expect.poll(()=>page.locator('[data-scroll-item]').first().getAttribute('data-scroll-item')).toBe(id);
  const chosen=await page.getByRole('combobox').getAttribute('aria-expanded');expect(chosen).toBe('false');
  await favorite(card).click();await expect(card).toHaveCSS('border-top-color',normal);await expect(direction).toHaveAttribute('aria-label',tab==='관심종목'?'내림차순 · 오름차순으로 변경':'오름차순 · 내림차순으로 변경');
 }
});

test('stock-list horizontal swipe is inert and tab clicks still work',async({page})=>{
 await fixture(page);await page.goto('/stocks?tab=holding');await waitReady(page);const list=page.getByTestId('stock-list');
 await list.dispatchEvent('touchstart',{touches:[{identifier:1,clientX:300,clientY:100}]});await list.dispatchEvent('touchend',{changedTouches:[{identifier:1,clientX:30,clientY:105}]});
 await expect(page.getByRole('tab',{name:'보유종목'})).toHaveAttribute('aria-selected','true');await page.getByRole('tab',{name:'관심종목'}).click();await expect(page.getByRole('tab',{name:'관심종목'})).toHaveAttribute('aria-selected','true');
});

test('browser/header back restores search, sorting and the actual body/row scroll; accounts stay separate',async({page})=>{
 await fixture(page);await page.route('**/api/accounts',route=>route.fulfill({json:{data:[{id:'a',name:'계좌 A',brokerName:'CI',cashBalance:'1',isActive:true,isDefault:true},{id:'b',name:'계좌 B',brokerName:'CI',cashBalance:'2',isActive:true}]}}));await page.route('**/api/accounts/*/holdings',route=>route.fulfill({json:{data:Array.from({length:30},(_,i)=>({securityId:String(20+i),symbol:String(20+i).padStart(6,'0'),name:'보유'+i,marketType:'KOSPI',quantity:'700',purchaseAmount:'161000000',averagePurchasePrice:'230000',currentPrice:'519000',previousClosePrice:'454000',marketValue:String(200000000-i*1000),unrealizedProfitLoss:'39000000',unrealizedReturnRate:'24.2',priceChangeRate:'14.3',priceUpdatedAt:'2026-10-02T00:00:00Z',marketStatus:'NORMAL'}))}}));await page.goto('/stocks?tab=holding');await waitReady(page);await page.getByRole('textbox',{name:'목록 종목 검색'}).fill('보유');
 await page.getByRole('combobox').click();await page.getByRole('option',{name:'종목명',exact:true}).click();await page.getByRole('button',{name:'내림차순 · 오름차순으로 변경'}).click();
 const target=row(page,'25');await target.scrollIntoViewIfNeeded();const scroll=region(page);await scroll.evaluate(el=>el.scrollTop=Math.min(140,el.scrollHeight-el.clientHeight));const before=await scroll.evaluate(el=>el.scrollTop);expect(before).toBeGreaterThan(0);
 // Header + works without auto-scrolling a middle-list card into view.
 await page.getByRole('button',{name:'종목 추가',exact:true}).click();if(tablet(page))await page.getByRole('button',{name:'입력 팝업 닫기'}).click();else await page.getByRole('button',{name:'뒤로가기',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'목록 종목 검색'})).toHaveValue('보유');await expect(page.getByRole('combobox')).toContainText('종목명');await expect(page.getByRole('button',{name:'오름차순 · 내림차순으로 변경'})).toBeVisible();await expect.poll(()=>region(page).evaluate(el=>el.scrollTop)).toBeCloseTo(before,0);
 await clickBody(row(page,'25'));if(tablet(page))await expect(page.getByTestId('stock-right')).toBeVisible();else await expect(page).toHaveURL(/stocks\/25/);
 await page.evaluate(()=>{(window as any).__returnFrames=[];window.addEventListener('popstate',()=>{let left=12;const sample=()=>{const el=document.querySelector<HTMLElement>('[data-scroll-region="stock-table"]')??(document.querySelector('[data-testid="stock-list"]')?document.querySelector<HTMLElement>('main'):null);if(el&&!document.querySelector('[data-testid="stock-right"]')&&getComputedStyle(el).visibility!=='hidden')(window as any).__returnFrames.push(el.scrollTop);if(--left)requestAnimationFrame(sample);};requestAnimationFrame(sample);},{once:true});});
 await page.goBack();await waitReady(page);await expect(page.getByRole('textbox',{name:'목록 종목 검색'})).toHaveValue('보유');await expect.poll(()=>region(page).evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await expect.poll(()=>page.evaluate(()=>(window as any).__returnFrames.length)).toBeGreaterThan(0);expect(await page.evaluate(()=>(window as any).__returnFrames.every((top:number)=>top>0))).toBe(true);
 // Returning through the same browser entry also survives a full reload.
 await page.reload();await waitReady(page);await expect(page.getByRole('textbox',{name:'목록 종목 검색'})).toHaveValue('보유');await expect.poll(()=>region(page).evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','b');window.dispatchEvent(new Event('roxstock-selected-account'));});await waitReady(page);await expect(page.getByRole('textbox',{name:'목록 종목 검색'})).toHaveValue('');await expect.poll(()=>region(page).evaluate(el=>el.scrollTop)).toBe(0);
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','a');window.dispatchEvent(new Event('roxstock-selected-account'));});await waitReady(page);await expect(page.getByRole('textbox',{name:'목록 종목 검색'})).toHaveValue('보유');await expect.poll(()=>region(page).evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
});

test('debounced automatic search trims input, skips short/IME queries, deduplicates Enter and discards old responses',async({page})=>{
 await fixture(page);const queries:string[]=[];let account='a';
 await page.route('**/api/securities?**',async route=>{const u=new URL(route.request().url());if(!u.searchParams.has('query'))return route.fallback();const query=u.searchParams.get('query')!;queries.push(query);expect(u.searchParams.get('accountId')).toBe(account);expect(u.searchParams.get('excludeRegistered')).toBe('true');if(query==='이전')await new Promise(r=>setTimeout(r,800));await route.fulfill({json:{data:[{id:'77',name:query+' 결과',symbol:'777777',marketType:'KOSPI',securityType:'STOCK',listType:null,watchlistItemId:null,currentPrice:null,previousClosePrice:null,valuation:null}]}}).catch(()=>{});});
 await page.goto('/stocks?tab=holding');await waitReady(page);await page.getByRole('button',{name:'종목 추가',exact:true}).click();const input=page.getByRole('textbox',{name:'전체 종목 검색'});await expect(input).toBeFocused();
 await input.fill(' 삼 ');await page.waitForTimeout(350);expect(queries).toHaveLength(0);
 await input.fill(' 삼성 ');await expect(page.getByTestId('security-search-result')).toContainText('삼성 결과');expect(queries).toEqual(['삼성']);await input.press('Enter');await page.getByRole('button',{name:'검색 실행'}).click();await page.waitForTimeout(350);expect(queries).toEqual(['삼성']);
 await input.fill('삼');await expect(page.getByTestId('security-search-result')).toHaveCount(0);await page.waitForTimeout(350);expect(queries).toEqual(['삼성']);
 await input.dispatchEvent('compositionstart');await input.fill('현대');await input.dispatchEvent('keydown',{key:'Enter',isComposing:true});await page.waitForTimeout(350);expect(queries).toEqual(['삼성']);await input.dispatchEvent('compositionend');await expect(page.getByTestId('security-search-result')).toContainText('현대 결과');
 await input.fill('이전');await expect.poll(()=>queries.includes('이전')).toBe(true);await input.fill('최신');await input.press('Enter');await expect(page.getByTestId('security-search-result')).toContainText('최신 결과');await page.waitForTimeout(900);await expect(page.getByTestId('security-search-result')).toContainText('최신 결과');expect(queries.filter(q=>q==='최신')).toHaveLength(1);
 await input.fill('');await expect(page.getByTestId('security-search-result')).toHaveCount(0);
});


test('journal period and selected trade survive header/browser return; its month swipe still works',async({page})=>{
 test.skip(page.viewportSize()!.width===400||page.viewportSize()!.width===816,'Two representative sizes cover the common navigation structure');
 await fixture(page);await page.goto('/journal?date=2026-09-18');
 const cell=page.getByRole('button',{name:/^2026-09-18.*매수/});await expect(cell).toHaveAttribute('aria-pressed','true');const entry=page.getByRole('button',{name:'매도 현대자동차 거래 상세'}).first();await entry.scrollIntoViewIfNeeded();await entry.click();
 if(tablet(page))await page.getByRole('button',{name:'거래 수정·삭제 ›'}).click();await expect(page.getByTestId('trade-form')).toBeVisible();
 if(tablet(page))await page.getByRole('button',{name:'입력 팝업 닫기'}).click();else await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page).toHaveURL(/journal\?date=2026-09-18/);await expect(cell).toHaveAttribute('aria-pressed','true');
 if(tablet(page)){await page.getByRole('button',{name:'거래 수정·삭제 ›'}).click();await page.goBack();await expect(page.getByRole('button',{name:'거래 수정·삭제 ›'})).toBeVisible();}
 const calendar=page.getByRole('button',{name:/^2026-09-18.*매수/}).locator('..').locator('..').locator('..');await calendar.dispatchEvent('touchstart',{touches:[{identifier:1,clientX:300,clientY:100}]});await calendar.dispatchEvent('touchend',{changedTouches:[{identifier:1,clientX:30,clientY:105}]});await expect(page.getByRole('button',{name:/^2026-10-01.*매수/})).toHaveAttribute('aria-pressed','true');
});

test('cash period and loaded history range survive browser return',async({page})=>{
 test.skip(page.viewportSize()!.width===400||page.viewportSize()!.width===816,'Two representative sizes cover period and loaded range');
 await fixture(page);const ranges:string[]=[];
 const entry=(i:number)=>({id:String(i+1),transactionType:'DEPOSIT',transactionDate:`2026-09-${String(30-i).padStart(2,'0')}T00:00:00Z`,signedAmount:'100',balanceAfter:'203300000',memo:null,amount:'100',feeTaxAmount:'0'});
 await page.route('**/api/accounts/a/cash-overview**',route=>route.fulfill({json:{data:{account:{id:'a',name:'기본 계좌',currentBalance:'203300000',updatedAt:'2026-10-01T00:00:00Z'},monthly:{deposit:'100',withdrawal:'0',dividend:'0',netChange:'100'},yearly:{deposit:'100',withdrawal:'0',dividend:'0',netChange:'100'},recentTransactions:[]}}}));
 await page.route('**/api/accounts/a/cash-transactions?**',route=>{const u=new URL(route.request().url());ranges.push(u.search);return route.fulfill({json:{data:Array.from({length:u.searchParams.has('from')?20:10},(_,i)=>entry(i)),meta:{total:20,limit:100,offset:0}}});});
 await page.goto('/detail/cash');await expect(page.getByText('최근 10개')).toBeVisible();await page.getByRole('button',{name:'이전 기간'}).click();await expect(page.getByRole('button',{name:'기간 직접 선택'})).toContainText('2026년 9월');await page.getByRole('button',{name:'이전 한 달 더보기'}).click();await expect(page.getByText('최근 20개')).toBeVisible();
 await page.locator('.MuiBottomNavigation-root:visible').getByRole('button',{name:'종목목록'}).click();await waitReady(page);await page.goBack();await expect(page.getByRole('button',{name:'기간 직접 선택'})).toContainText('2026년 9월');await expect(page.getByText('최근 20개')).toBeVisible();expect(ranges.some(range=>range.includes('from='))).toBe(true);
});
