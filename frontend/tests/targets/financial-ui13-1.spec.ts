import {test,expect,type Page} from '@playwright/test';
import {setup} from './financial-ui-fixture';
async function fixture(page:Page,listType="WATCHLIST"){
 await setup(page,{allMetrics:true});
 const stocks=[2,1].map(id=>({id:String(id),symbol:'00000'+id,name:'종목'+id,marketType:'KOSPI',listType,watchlistItemId:String(id),hasTradeHistory:false,currentPrice:'100',previousClosePrice:'90',valuation:null}));
 const queries:string[]=[];
 await page.route('**/api/securities**',r=>r.fulfill({json:{data:stocks}}));
 await page.route('**/api/accounts/*/trades**',r=>r.fulfill({json:{data:[],summary:{buyAmount:'0',sellAmount:'0',realizedProfitLoss:'0'},daily:[]}}));
 await page.route('**/api/value-analysis?**',r=>{const u=new URL(r.request().url()),query=u.searchParams.get('query')??'';queries.push(query);const rows=stocks.filter(s=>s.name.includes(query)||s.symbol.includes(query));return r.fulfill({json:{data:{rows,total:rows.length,year:2026,query}}});});
 return queries;
}
async function selectWatch(page:Page,id=1){
 if(page.viewportSize()!.width>=600)await page.getByRole('row',{name:`종목${id} 상세보기`,exact:true}).click();
 else await page.getByTestId('stock-card-'+id).getByRole('button',{name:`종목${id} 상세보기`,exact:true}).click();
 await expect(page.getByTestId('value-detail')).toBeVisible();
}
test('source list order, centered header and entry state survive detail/chart transitions',async({page},info)=>{
 await fixture(page);await page.goto('/stocks?tab=watchlist');await page.getByRole('textbox',{name:'목록 종목 검색'}).fill('종목');await page.getByRole('combobox',{name:'정렬 기준'}).click();await page.getByRole('option',{name:'종목명',exact:true}).click();await page.getByRole('button',{name:'내림차순 · 오름차순으로 변경'}).click();await selectWatch(page);
 const heading=page.getByRole('heading',{level:1}),nav=page.getByTestId('stock-navigation');await expect(heading).toHaveText('종목1');await expect(nav.getByTestId('stock-navigation-code')).toHaveText('000001');await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toBeVisible();
 const h=(await heading.boundingBox())!,n=(await nav.boundingBox())!;expect(Math.abs(h.x+h.width/2-n.x-n.width/2)).toBeLessThan(2);expect(n.y).toBeGreaterThanOrEqual(h.y+h.height-1);
 await page.screenshot({path:info.outputPath('stock-origin-value.png')});
 await page.getByRole('button',{name:'재무지표 보기'}).click();await expect(page.getByTestId('value-chart-수익성')).toBeVisible();await expect(nav).toBeVisible();await page.screenshot({path:info.outputPath('stock-origin-chart.png')});
 await page.getByRole('button',{name:'다음 종목 종목2',exact:true}).click();await expect(heading).toHaveText('종목2');await expect(page.getByRole('button',{name:'다음 종목',exact:true})).toBeDisabled();await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page.getByTestId('value-detail')).toBeVisible();await expect(heading).toHaveText('종목2');
 await page.getByRole('button',{name:'이전 종목 종목1',exact:true}).click();await expect(heading).toHaveText('종목1');await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page).toHaveURL(/\/stocks\?tab=watchlist$/);await expect(page.getByRole('textbox',{name:'목록 종목 검색'})).toHaveValue('종목');
 await page.getByRole('textbox',{name:'목록 종목 검색'}).fill('종목1');await selectWatch(page);await expect(nav).toBeVisible();await expect(nav.getByRole('button',{name:'이전 종목',exact:true})).toBeDisabled();await expect(nav.getByRole('button',{name:'다음 종목',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toBeVisible();
});
test('name/code confirm and Enter share search, blur, deduplicate and show empty state',async({page},info)=>{
 const queries=await fixture(page);await page.goto('/detail/value');const input=page.getByRole('textbox',{name:'종목 검색'});await expect(input).toHaveAttribute('enterkeyhint','done');await input.fill('종목1');await input.press('Enter');await expect(page.getByTestId('value-row-000001')).toBeVisible();await expect(page.getByTestId('value-row-000002')).toHaveCount(0);expect(await input.evaluate(e=>document.activeElement===e)).toBe(false);
 const count=queries.filter(q=>q==='종목1').length;await input.press('Enter');await page.getByRole('button',{name:'검색 확인'}).click();expect(queries.filter(q=>q==='종목1')).toHaveLength(count);
 await input.fill('000002');await page.getByRole('button',{name:'검색 확인'}).click();await expect(page.getByTestId('value-row-000002')).toBeVisible();await expect(page.getByTestId('value-row-000001')).toHaveCount(0);expect(await input.evaluate(e=>document.activeElement===e)).toBe(false);
 await page.getByTestId('value-row-000002').click();await expect(page.getByTestId('value-detail')).toBeVisible();await expect(page.getByTestId('stock-navigation')).toHaveCount(0);await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{level:1})).toHaveText('종목2 (000002)');await page.screenshot({path:info.outputPath('value-origin-detail.png')});
 await page.getByRole('button',{name:'재무지표 보기'}).click();await expect(page.getByTestId('value-chart-수익성')).toBeVisible();await expect(page.getByTestId('stock-navigation')).toHaveCount(0);await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toHaveCount(0);await page.screenshot({path:info.outputPath('value-origin-chart.png')});
 await page.goto('/detail/value');await input.fill('없는종목');await input.press('Enter');await expect(page.getByText('내용이 없습니다.',{exact:true}).first()).toBeVisible();await expect(page.getByTestId('value-row-000001')).toHaveCount(0);await expect(page.getByTestId('value-row-000002')).toHaveCount(0);
});
test('Korean composition Enter and native composing Enter cannot commit early',async({page})=>{
 const queries=await fixture(page);await page.goto('/detail/value');const input=page.getByRole('textbox',{name:'종목 검색'});await expect(page.getByTestId('value-row-000001')).toBeVisible();await input.fill('종목1');await input.dispatchEvent('compositionstart');await input.press('Enter');await page.getByRole('button',{name:'검색 확인'}).click();expect(queries).not.toContain('종목1');await input.dispatchEvent('compositionend');await input.press('Enter');await expect(page.getByTestId('value-row-000002')).toHaveCount(0);expect(queries.filter(q=>q==='종목1')).toHaveLength(1);
 await input.fill('000002');const allowed=await input.evaluate(e=>e.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true})));expect(allowed).toBe(false);expect(queries).not.toContain('000002');await input.press('Enter');await expect(page.getByTestId('value-row-000002')).toBeVisible();expect(await input.evaluate(e=>document.activeElement===e)).toBe(false);
});

test('holding value popup preserves filtered source and header across charts',async({page})=>{
 await fixture(page,'HOLDING');await page.goto('/stocks?tab=holding');await page.getByRole('textbox',{name:'목록 종목 검색'}).fill('종목1');await page.getByRole('button',{name:'종목1 가치지표',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'상세보기 ›',exact:true}).click();await expect(page.getByTestId('value-detail')).toBeVisible();await expect(page.getByTestId('stock-navigation')).toBeVisible();await page.getByRole('button',{name:'재무지표 보기'}).click();await expect(page.getByTestId('value-chart-수익성')).toBeVisible();await expect(page.getByRole('button',{name:'이전 종목',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'다음 종목',exact:true})).toBeDisabled();await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page.getByTestId('value-detail')).toBeVisible();await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page).toHaveURL(/\/stocks\?tab=holding$/);await expect(page.getByRole('textbox',{name:'목록 종목 검색'})).toHaveValue('종목1');
});
