import {test,expect,type Page} from './authenticated-test';
import {fixture as baseFixture} from './phase28-fixture';
import {won,amount} from '../../src/pages/investment-profit/profitData';
const money=(v:string)=>({buy:'1000',sell:'1200',cost:'1000',trading:v,dividend:'3',total:String(Number(v)+3)});
async function fixture(page:Page){
 await baseFixture(page);const saved=new Set<string>(),reads:string[]=[],fail={scrap:false,entry:false},gate={hold:false,release:()=>{}};
 const news=Array.from({length:3},(_,i)=>({id:String(3-i),isHeld:false,isScrapped:false,title:'저장 검증 소식 '+(3-i),originalUrl:'https://www.hankyung.com/article/uitest'+i,originalAvailable:true,sourceName:'공개 검증 출처',publishedAt:'2026-10-28T03:00:00Z',publishedPrecision:'TIME',type:'ARTICLE',importance:'MAJOR',access:'FREE',summary:'서버에 저장한 공개 요약을 확인하는 합성 검증 자료입니다.',summaryMethod:'PUBLIC_DESCRIPTION_EXTRACT',collectedAt:'2026-10-28T03:00:00Z',securities:[{id:'1',symbol:'987451',name:'검증 종목',isHeld:false}]}));
 const entries=Array.from({length:137},(_,i)=>({key:(i%3?'SELL':'DIVIDEND')+':'+(1000-i),id:String(1000-i),at:'2026-'+(i<118?'10-23':'09-23')+'T06:00:00Z',date:'2026-'+(i<118?'10-23':'09-23'),kind:i%3?'SELL':'DIVIDEND',security:{id:'1',symbol:'987451',name:'말줄임 확인을 위한 아주 긴 검증용 종목명'},amount:i===0?'123456789012345':i%3?i%2?'-10':'10':'3'}));
 const months=['2026-10','2026-09'].map(month=>({month,totals:{...money('0'),total:String(entries.filter(r=>r.date.startsWith(month)).reduce((s,r)=>s+BigInt(r.amount),0n))},hasTrading:true,hasDividend:true}));
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url()),path=u.pathname,q=u.searchParams;reads.push(path+u.search);
  if(path==='/api/pages/read')return route.fulfill({status:404,json:{error:{code:'LEGACY_FIXTURE'}}});
  if(path.endsWith('/investment-profit/statistics'))return route.fulfill({json:{data:{accountId:'1',security:{id:'1',name:'검증 종목',symbol:'987451'},years:[2026,2025,2009].map(year=>({year,totals:money('200'),months:year===2009?[]:[{month:year+'-10',totals:money('200'),hasTrading:true,hasDividend:true}]}))},meta:{completeHistory:true}}});
  if(path.endsWith('/investment-profit/entries')){
   const cursor=Number(q.get('cursor')??0);if(cursor&&gate.hold)await new Promise<void>(r=>gate.release=r);
   if(fail.entry&&cursor)return route.fulfill({status:503,json:{error:{code:'TEST_FAILURE',message:'검증 오류'}}});
   const scope={securityId:q.get('securityId'),year:q.has('year')?Number(q.get('year')):null,month:q.has('month')?Number(q.get('month')):null};
   return route.fulfill({json:{data:{accountId:'1',security:scope.securityId?{name:'검증 종목',symbol:'987451'}:null,scope,rows:entries.slice(cursor,cursor+50),total:entries.length,months,totals:money('0'),snapshot:'stable',nextCursor:cursor+50<entries.length?String(cursor+50):null,hasNext:cursor+50<entries.length}}});
  }
  if(/\/accounts\/1\/stock-news/.test(path)){
   const id=/stock-news\/(\d+)/.exec(path)?.[1],isScrap=q.get('type')==='SCRAP';
   if(path.endsWith('/scrap')){if(fail.scrap)return route.fulfill({status:503,json:{error:{code:'TEST_FAILURE',message:'검증 실패'}}});const next=route.request().postDataJSON().saved;if(next)saved.add(id!);else saved.delete(id!);return route.fulfill({json:{data:{id,isScrapped:next}}});}
   const items=news.filter(n=>!isScrap||saved.has(n.id)),row=news.find(n=>n.id===id),index=items.findIndex(n=>n.id===id);
   if(id)return route.fulfill({json:{data:{...row,isScrapped:saved.has(id)},meta:{accountId:'1',snapshot:'news',type:q.get('type')??'ALL',ordinal:Math.min(index+1,items.length),total:items.length,previousId:items[index-1]?.id??null,nextId:items[index+1]?.id??null}}});
   return route.fulfill({json:{data:items.map(n=>({...n,isScrapped:saved.has(n.id)})),meta:{accountId:'1',snapshot:'news',type:q.get('type')??'ALL',count:items.length,total:items.length,nextCursor:null,dailyCounts:{'2026-10-28':items.length},collection:{status:'SUCCESS',initialCompleted:true,providers:[]}}}});
  }
  return route.fallback();
 });
 return {saved,reads,fail,gate,entries,months};
}
test('scrap toggle failure rollback, reload persistence, current-list navigation and return filter',async({page},info)=>{
 const f=await fixture(page);await page.goto('/detail/stock-news');await page.getByRole('tab',{name:'스크랩',exact:true}).click();await expect(page.getByText('스크랩한 소식이 없습니다.')).toBeVisible();
 await page.getByRole('tab',{name:'전체',exact:true}).click();await page.getByTestId('stock-news-card').first().click();const save=page.getByRole('button',{name:'스크랩하기',exact:true});await expect(save).toBeVisible();
 f.fail.scrap=true;await save.click();await expect(page.getByRole('button',{name:'스크랩하기',exact:true})).toHaveAttribute('aria-pressed','false');await expect(page.getByRole('alert')).toContainText('이전 상태로 복원');
 f.fail.scrap=false;await page.getByRole('button',{name:'스크랩하기',exact:true}).click();await expect(page.getByRole('button',{name:'스크랩 해제',exact:true})).toHaveAttribute('aria-pressed','true');await page.reload();await expect(page.getByRole('button',{name:'스크랩 해제',exact:true})).toBeVisible();
 expect(await page.getByRole('button',{name:'스크랩 해제',exact:true}).locator('img').evaluate(img=>({w:img.getBoundingClientRect().width,h:img.getBoundingClientRect().height,loaded:img.complete&&img.naturalWidth>0}))).toEqual({w:20,h:20,loaded:true});
 await page.screenshot({path:info.outputPath('news-scrap.png')});
 f.saved.add('1');await page.goto('/detail/stock-news?type=SCRAP');await expect(page.getByTestId('stock-news-card')).toHaveCount(2);await page.getByTestId('stock-news-card').first().click();await expect(page.getByTestId('stock-news-detail')).toContainText('저장 검증 소식 3');await page.getByRole('button',{name:'다음 ›',exact:true}).click();await expect(page.getByTestId('stock-news-detail')).toContainText('저장 검증 소식 1');
 await page.goBack();await expect(page.getByRole('tab',{name:'스크랩',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByTestId('stock-news-card')).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('server statistics show all actual years, chosen card initial scroll, no swipe and scoped details',async({page},info)=>{
 const f=await fixture(page);await page.goto('/detail/investment-profit/stock-years?securityId=1&year=2009');await expect(page.getByTestId('profit-year-card')).toHaveCount(3);await expect(page.getByRole('heading',{name:'2009년',exact:true})).toBeInViewport();await expect(page.getByTestId('profit-navigation')).toHaveCount(0);expect(new Set(f.reads.filter(r=>r.includes('/statistics'))).size).toBe(1);expect(f.reads.some(r=>/\/(trades|cash-transactions)(?:\?|$)/.test(r))).toBe(false);
 await page.getByTestId('profit-year-card').first().scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('stock-years.png')});await page.getByTestId('profit-year-card').first().getByRole('button',{name:'상세보기',exact:true}).click();await expect(page).toHaveURL(/entries\?securityId=1&year=2026/);await expect(page.getByTestId('profit-visible-count')).toHaveText('50/137건');await page.goBack();await expect(page.getByTestId('profit-year-card')).toHaveCount(3);
});
test('50 visible plus hidden prefetch, full month sum, same-month merge, last page and stable columns',async({page},info)=>{
 const f=await fixture(page);await page.goto('/detail/investment-profit/entries?securityId=1');await expect(page.getByTestId('profit-entry')).toHaveCount(50);await expect.poll(()=>f.reads.some(r=>r.includes('cursor=50'))).toBe(true);await expect(page.getByTestId('profit-visible-count')).toHaveText('50/137건');await expect(page.getByTestId('profit-month-total').first()).toHaveText(won(amount(f.months[0].totals.total),true));
 await page.getByTestId('profit-more').click();await expect(page.getByTestId('profit-entry')).toHaveCount(100);await expect(page.getByTestId('profit-month-group')).toHaveCount(1);await expect.poll(()=>f.reads.some(r=>r.includes('cursor=100'))).toBe(true);await page.getByTestId('profit-more').click();await expect(page.getByTestId('profit-entry')).toHaveCount(137);await expect(page.getByTestId('profit-month-group')).toHaveCount(2);await expect(page.getByTestId('profit-more')).toHaveCount(0);await expect(page.getByTestId('profit-visible-count')).toHaveText('137/137건');
 const positions=await page.getByTestId('profit-entry-kind').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().left));expect(Math.max(...positions)-Math.min(...positions)).toBeLessThan(1);expect(await page.getByTestId('profit-entry').first().locator('p').first().textContent()).toBe('');
 await page.getByTestId('profit-entry').first().scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('entries-stock.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.goto('/detail/investment-profit/entries?year=2026&month=10');await expect(page.getByTestId('profit-entry').first()).toContainText('말줄임');await page.screenshot({path:info.outputPath('entries-all.png')});
});
test('prefetch failure and pending request preserve rows and avoid duplicate additions',async({page})=>{
 const f=await fixture(page);f.fail.entry=true;await page.goto('/detail/investment-profit/entries?year=2026');await expect(page.getByTestId('profit-entry')).toHaveCount(50);await expect.poll(()=>f.reads.some(r=>r.includes('cursor=50'))).toBe(true);await page.getByTestId('profit-more').click();await expect(page.getByRole('alert')).toContainText('기존 내역은 유지');await expect(page.getByTestId('profit-entry')).toHaveCount(50);
 f.fail.entry=false;await page.getByTestId('profit-more').click();await expect(page.getByTestId('profit-entry')).toHaveCount(100);const keys=await page.getByTestId('profit-entry').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-entry-id')));expect(new Set(keys).size).toBe(100);
});


test('pending prefetch coalesces clicks and never adds hidden pages twice',async({page})=>{
 const f=await fixture(page);f.gate.hold=true;await page.goto('/detail/investment-profit/entries?securityId=1');await expect(page.getByTestId('profit-entry')).toHaveCount(50);await expect.poll(()=>f.reads.filter(r=>r.includes('cursor=50')).length).toBe(1);
 await page.getByTestId('profit-more').click();await expect(page.getByTestId('profit-more')).toBeDisabled();await expect(page.getByTestId('profit-visible-count')).toHaveText('50/137건');f.gate.hold=false;f.gate.release();await expect(page.getByTestId('profit-entry')).toHaveCount(100);expect(f.reads.filter(r=>r.includes('cursor=50')).length).toBe(1);
 await expect.poll(()=>f.reads.some(r=>r.includes('cursor=100'))).toBe(true);await page.getByTestId('profit-more').evaluate(el=>{(el as HTMLButtonElement).click();(el as HTMLButtonElement).click();});await expect(page.getByTestId('profit-entry')).toHaveCount(137);expect(new Set(await page.getByTestId('profit-entry').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-entry-id')))).size).toBe(137);
});

test('condition switch ignores old pending prefetch and empty differs from load failure',async({page})=>{
 const f=await fixture(page);f.gate.hold=true;await page.goto('/detail/investment-profit/entries?year=2026');await expect(page.getByTestId('profit-entry')).toHaveCount(50);await expect.poll(()=>f.reads.some(r=>r.includes('cursor=50'))).toBe(true);
 await page.goto('/detail/investment-profit/entries?securityId=1&year=2025');await expect(page.getByTestId('profit-visible-count')).toHaveText('50/137건');await expect(page.getByTestId('profit-entries')).toContainText('검증 종목');f.gate.hold=false;f.gate.release();await expect(page.getByTestId('profit-entry')).toHaveCount(50);
 await page.route('**/api/accounts/1/investment-profit/entries**',route=>route.fulfill({status:503,json:{error:{code:'TEST_FAILURE'}}}));await page.goto('/detail/investment-profit/entries?year=2024');await expect(page.getByRole('alert')).toContainText('조회하지 못했습니다');await expect(page.getByText('내용이 없습니다.',{exact:true})).toHaveCount(0);
 await page.route('**/api/accounts/1/investment-profit/entries**',route=>route.fulfill({json:{data:{accountId:'1',security:null,scope:{securityId:null,year:2024,month:null},rows:[],total:0,months:[],totals:money('0'),snapshot:'empty',nextCursor:null,hasNext:false}}}));await page.getByRole('button',{name:'재시도',exact:true}).click();await expect(page.getByText('내용이 없습니다.',{exact:true})).toBeVisible();await expect(page.getByTestId('profit-more')).toHaveCount(0);
});
