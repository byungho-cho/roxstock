import {test,expect} from '@playwright/test';
import {fixture,selected} from './stock-input-fixture';

test('home account popup consumes Back and X history, menu geometry and account selection',async({page},info)=>{
 await fixture(page);
 await page.route('**/api/accounts',route=>route.fulfill({json:{data:[{id:'a',name:'주식 투자',accountNumber:'1234-5678',isActive:true,isDefault:true},{id:'b',name:'장기 투자',accountNumber:'2345-6789',isActive:true}]}}));
 await page.goto('/more');await page.getByRole('navigation',{name:'하단 메뉴'}).getByRole('button',{name:'홈',exact:true}).click();
 const open=page.getByRole('button',{name:'계좌 선택',exact:true});
 await open.click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(/\/$/);
 await open.click();await page.getByRole('button',{name:'계좌 선택 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await open.click();await expect(page.getByRole('dialog').getByText('사용 중')).toHaveCSS('font-weight','700');
 await page.screenshot({path:`test-results/phase16/account-${info.project.name}.png`,animations:'disabled'});
 await page.getByRole('button',{name:'장기 투자(2345-6789)',exact:true}).click();
 await expect(open).toContainText('장기 투자');expect(await page.evaluate(()=>localStorage.getItem('roxstock-selected-account-id'))).toBe('b');
 const nav=page.getByRole('navigation',{name:'하단 메뉴'});await expect(nav).toHaveCSS('height','44px');
 const home=await nav.getByRole('button',{name:'홈',exact:true}).boundingBox();const more=await nav.getByRole('button',{name:'더보기',exact:true}).boundingBox();
 expect(home!.x).toBe(0);expect(more!.x+more!.width).toBe(page.viewportSize()!.width);
 const scroll=page.getByTestId('bottom-menu-scroll');const item=await nav.getByRole('button',{name:'종목목록',exact:true}).boundingBox();
 if(info.project.name==='cover')expect((await scroll.boundingBox())!.width/item!.width).toBeCloseTo(5.5,1);else expect(item!.width).toBe(52);
 await page.screenshot({path:`test-results/phase16/home-${info.project.name}.png`,animations:'disabled'});
 await page.goBack();await expect(page).toHaveURL(/\/more$/);
});

test('registered KODEX and initials remain searchable with account classification',async({page})=>{
 await fixture(page);const reads:string[]=[];const writes:unknown[]=[];
 await page.route('**/api/securities?**',route=>{const u=new URL(route.request().url());reads.push(u.search);return route.fulfill({json:{data:[{id:'262',name:u.searchParams.get('query')==='ㅅㅅㅈㅈ'?'삼성전자':'KODEX 200',symbol:'069500',marketType:'KOSPI',securityType:'ETF',listType:'WATCHLIST',watchlistItemId:'15',hasTradeHistory:false,isActive:true}]}});});
 await page.route('**/api/watchlist-items/15',route=>{writes.push(route.request().postDataJSON());return route.fulfill({json:{data:{id:'262'}}});});
 await page.goto('/stocks/add?type=holding');const input=page.getByRole('textbox',{name:'전체 종목 검색'});
 await input.fill('ㅅㅅㅈㅈ');await expect(page.getByTestId('security-search-result')).toContainText('삼성전자');
 await input.fill('069500');await expect(page.getByTestId('security-search-result')).toContainText('KODEX 200');
 await expect(page.getByTestId('security-search-result')).toContainText('현재 계좌 관심종목');
 await page.getByTestId('security-search-result').click();await page.getByTestId('stock-add-confirm').getByRole('button',{name:'추가',exact:true}).click();
 await expect.poll(()=>writes.length).toBe(1);expect(writes[0]).toMatchObject({accountId:'a',listType:'HOLDING'});
 expect(reads.every(value=>!value.includes('excludeRegistered=true'))).toBe(true);
});

test('stock popup Back preserves search and tab, X leaves no extra Back step',async({page})=>{
 await fixture(page);await page.goto('/more');await page.getByRole('navigation',{name:'하단 메뉴'}).getByRole('button',{name:'종목목록',exact:true}).click();
 const search=page.getByRole('textbox',{name:'목록 종목 검색'});await search.fill('현대');
 const open=page.getByRole('button',{name:'현대자동차 가치지표 보고서'});
 await open.click();await expect(page.getByRole('dialog')).toBeVisible();await page.goBack();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(search).toHaveValue('현대');
 await open.click();await page.getByRole('button',{name:'가치지표 닫기'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.goBack();await expect(page).toHaveURL(/\/more$/);
});

test('late home response cannot replace the last selected account',async({page})=>{
 await fixture(page);
 await page.route('**/api/accounts',route=>route.fulfill({json:{data:['a','b','c'].map((id,index)=>({id,name:'계좌 '+id,accountNumber:id,isActive:true,isDefault:index===0}))}}));
 let release:()=>void=()=>{};const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/accounts/*/dashboard',async route=>{
  const id=new URL(route.request().url()).pathname.split('/')[3];if(id==='a')await pending;
  return route.fulfill({json:{data:{account:{id,name:'계좌 '+id},cashBalance:'0',purchaseAmount:'0',stockValue:id==='c'?'300':'100',totalAssetValue:id==='c'?'300':'100',holdings:[],pricingComplete:true}}});
 });
 await page.goto('/');const open=page.getByRole('button',{name:'계좌 선택',exact:true});
 for(const id of ['b','c']){await open.click();await page.getByRole('dialog').getByRole('button',{name:`계좌 ${id}(${id})`,exact:true}).click();await expect(open).toContainText('계좌 '+id);}
 const response=page.waitForResponse(r=>r.url().includes('/accounts/a/dashboard'));release();await response;
 await expect(page.getByTestId('home-summary-area')).toContainText('300원');await expect(open).toContainText('계좌 c');
});

for(const type of ['buy','sell'])test(`${type} exact linked cash editor focuses tax and never creates a second transaction`,async({page})=>{
 await fixture(page);const writes:{path:string;body:any}[]=[];
 await page.route('**/api/**',async route=>{
  const r=route.request(),p=new URL(r.url()).pathname;
  if(r.method()!=='GET'){writes.push({path:p,body:r.postDataJSON()});return route.fulfill({json:{data:{id:'trade-new',cashTransactionId:'linked-123'}}});}
  if(p.endsWith('/cash-transactions/linked-123'))return route.fulfill({json:{data:{id:'linked-123',transactionType:type.toUpperCase(),createdAt:'2026-10-09T00:00:00Z',transactionDate:'2026-10-09T00:00:00Z',amount:'1000',feeTaxAmount:'0',balanceAfter:'9000',signedAmount:'1000',memo:null,dividend:null}}});
  if(p.endsWith('/cash-overview'))return route.fulfill({json:{data:{currentYearTax:{year:2026,amount:'0'},account:{id:'a',currentBalance:'50000'},monthly:{deposit:'0',withdrawal:'0',dividend:'0'},yearly:{deposit:'0',withdrawal:'0',dividend:'0'},recentTransactions:[{id:'unrelated-newer',balanceAfter:'50000'}]}}});
  if(p.endsWith('/cash-transactions'))return route.fulfill({json:{data:[],meta:{total:0}}});
  return route.fallback();
 });
 await selected(page);
 if(type==='buy')await page.getByRole('button',{name:'매수',exact:true}).click();
 else await page.getByTestId('lot-lot1').getByRole('button',{name:'2026-09-10 Lot 매도'}).click();
 await page.getByLabel(type==='buy'?'매수수량':'매도수량',{exact:true}).fill('1');
 await page.getByRole('button',{name:type==='buy'?'매수':'매도',exact:true}).click();
 const confirm=page.getByRole('dialog').filter({hasText:'제세금을 입력하시겠습니까?'});await expect(confirm).toBeVisible();
 await confirm.getByRole('button',{name:'확인',exact:true}).click();
 const tax=page.getByLabel('제세금',{exact:true});await expect(tax).toBeFocused();await tax.fill('100');
 await page.getByRole('button',{name:'저장',exact:true}).click();
 await expect.poll(()=>writes.length).toBe(2);expect(writes[1].path).toContain('linked-123');expect(writes[1].body).toMatchObject({accountId:'a',feeTaxAmount:'100',balanceAfter:'8900'});
});

 test('alphanumeric direct input preserves invalid text, canonicalizes paste and reuses existing code',async({page},info)=>{
 await fixture(page);const writes:any[]=[];
 await page.route('**/api/securities?**',route=>route.fulfill({json:{data:[]}}));
 await page.route('**/api/securities',route=>{writes.push(route.request().postDataJSON());return route.fulfill({json:{data:{id:'17',symbol:'0163Y0',name:'KoAct'}}});});
 await page.goto('/stocks/add?type=holding');await page.getByRole('button',{name:'직접 추가 ›',exact:true}).click();
 await page.getByLabel('종목명',{exact:true}).fill('KoAct 코스닥액티브');const code=page.getByLabel('종목코드',{exact:true}),add=page.getByRole('button',{name:'종목 추가',exact:true});
 for(const invalid of ['0163Y!0','01-6300','0163Y00']){await code.fill(invalid);await expect(code).toHaveValue(invalid);await expect(add).toBeDisabled();}
 for(const numeric of ['005930','069500']){await code.fill(numeric);await expect(add).toBeEnabled();}
 await code.fill('0163y0');await expect(code).toHaveValue('0163Y0');await expect(add).toBeEnabled();
 // A paste input event exercises the same native input path without clipboard permissions.
 await code.evaluate((input:HTMLInputElement)=>{const paste=new DataTransfer();paste.setData('text/plain',' 0163y0 ');input.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:paste}));const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;set.call(input,' 0163y0 ');input.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertFromPaste',data:' 0163y0 '}));});
 await expect(code).toHaveValue(' 0163Y0 ');await expect(add).toBeEnabled();
 await page.screenshot({path:'test-results/phase16/code-'+info.project.name+'.png',animations:'disabled'});
 await add.click();await page.getByTestId('stock-add-confirm').getByRole('button',{name:'추가',exact:true}).click();await expect.poll(()=>writes.length).toBe(1);expect(writes[0].symbol).toBe('0163Y0');
 await page.route('**/api/securities?**',route=>route.fulfill({json:{data:[{id:'17',name:'KoAct 코스닥액티브',symbol:'0163Y0',marketType:'KOSDAQ',securityType:'ETF',isActive:true,hasTradeHistory:false,watchlistItemId:null}]}}));
 await page.goto('/stocks/add?type=watchlist');await page.getByLabel('전체 종목 검색').fill('0163y0');await expect(page.getByTestId('security-search-result')).toContainText('0163Y0');
 await page.getByRole('button',{name:'직접 추가 ›',exact:true}).click();await page.getByLabel('종목명',{exact:true}).fill('KoAct');await code.fill('0163y0');await add.click();await page.getByTestId('stock-add-confirm').getByRole('button',{name:'추가',exact:true}).click();await expect(page.getByTestId('stock-direct-add')).toHaveCount(0);expect(writes.length).toBe(1);
 });
