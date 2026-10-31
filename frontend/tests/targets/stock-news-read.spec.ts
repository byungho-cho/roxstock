import {test,expect,type Page} from './authenticated-test';
import {fixture} from './stock-news-fixture';

async function setup(page:Page){
 const data=await fixture(page,{partial:false});
 data.items.forEach(item=>Object.assign(item,{isRead:false}));
 let fail=false,hold=false,release=()=>{};const writes:{id:string;body:any}[]=[];
 await page.route('**/api/accounts/*/stock-news**',async route=>{
  if(route.request().method()!=='PUT')return route.fallback();
  const id=new URL(route.request().url()).pathname.split('/')[5]!,body=route.request().postDataJSON();writes.push({id,body});
  if(hold)await new Promise<void>(r=>release=r);
  if(fail)return route.fulfill({status:503,json:{error:{code:'READ_FAILED',message:'검증 실패'}}});
  const rows=id==='read-all'?data.items.filter(i=>(body.type==='ALL'||!body.type||i.type===body.type)&&(body.held!=='true'||i.isHeld)):data.items.filter(i=>i.id===id);
  rows.forEach(i=>Object.assign(i,{isRead:true}));
  await route.fulfill({json:{data:id==='read-all'?{count:rows.length}:{id,isRead:true}}});
 });
 return {...data,writes,fail:(value:boolean)=>{fail=value;},hold:()=>{hold=true;},release:()=>{hold=false;release();}};
}

async function confirmAll(page:Page){
 await page.getByTestId('news-unread-button').click();
 await page.getByRole('dialog').getByRole('button',{name:'확인',exact:true}).click();
}

test('NEW is red, view marks one, return/reload preserves state, bulk includes unloaded pages',async({page},info)=>{
 const data=await setup(page);await page.goto('/detail/stock-news');
 await expect(page.getByTestId('news-new')).toHaveCount(10);
 await expect(page.getByTestId('news-unread-button')).toHaveAttribute('aria-label','읽지 않은 소식 26건 모두 읽음 처리');
 await page.getByTestId('news-unread-button').click();await expect(page.getByRole('dialog')).toContainText('26건을 모두 읽음 처리하시겠습니까?');
 await page.getByRole('dialog').getByRole('button',{name:'취소',exact:true}).click();expect(data.writes).toHaveLength(0);
 await expect(page.getByTestId('news-new').first()).toHaveCSS('color','rgb(255, 82, 97)');
 await page.getByTestId('stock-news-title').first().click();await expect.poll(()=>data.writes.length).toBe(1);
 await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page.getByTestId('news-new')).toHaveCount(9);
 await page.reload();await expect(page.getByTestId('news-new')).toHaveCount(9);
 await confirmAll(page);await expect(page.getByTestId('news-new')).toHaveCount(0);await expect(page.getByTestId('news-unread-button')).toBeDisabled();
 await page.getByTestId('news-more').click();await expect(page.getByTestId('stock-news-card')).toHaveCount(20);await expect(page.getByTestId('news-new')).toHaveCount(0);
 await expect(page.getByTestId('news-display-count')).toHaveText('20/26');
 expect(data.writes.at(-1)?.body.snapshot).toBeTruthy();
 await page.screenshot({path:info.outputPath('news-read-all.png')});
});

test('bulk uses the current type and holding filter; duplicate clicks cannot double-submit',async({page})=>{
 const data=await setup(page);await page.goto('/detail/stock-news?type=ARTICLE&held=true');
 await expect(page.getByTestId('news-new')).toHaveCount(4);data.hold();
 const button=page.getByTestId('news-unread-button');await confirmAll(page);await expect(button).toBeDisabled();
 await expect.poll(()=>data.writes.length).toBe(1);expect(data.writes[0]?.body).toMatchObject({type:'ARTICLE',held:'true'});
 data.release();await expect(page.getByTestId('news-new')).toHaveCount(0);
 await page.goto('/detail/stock-news');await expect(page.getByTestId('news-new')).toHaveCount(9);
});

test('failure retains NEW and retry repeats the failed single-item action, not bulk',async({page})=>{
 const data=await setup(page);await page.goto('/detail/stock-news');data.fail(true);
 await page.getByTestId('stock-news-title').first().click();await expect(page.getByText('읽음 상태 저장에 실패했습니다. 다시 확인해 주세요.')).toBeVisible();
 expect((data.items[0] as any).isRead).toBe(false);data.fail(false);
 await page.getByRole('button',{name:'재시도',exact:true}).click();await expect.poll(()=>(data.items[0] as any).isRead).toBe(true);
 expect(data.writes.map(w=>w.id)).toEqual(['100','100']);
 await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page.getByTestId('news-new')).toHaveCount(9);
 data.fail(true);await confirmAll(page);await expect(page.getByText('읽음 상태 저장에 실패했습니다. NEW 표시는 유지됩니다.')).toBeVisible();
 await expect(page.getByTestId('news-new')).toHaveCount(9);data.fail(false);await page.getByRole('button',{name:'재시도',exact:true}).click();await expect(page.getByTestId('news-new')).toHaveCount(0);
});

test('opening the valid original marks read without opening the summary',async({page},info)=>{
 const data=await setup(page);await page.context().route('https://www.hankyung.com/**',r=>r.fulfill({body:'검증 원문'}));
 await page.goto('/detail/stock-news');await expect(page.getByTestId('news-new')).toHaveCount(10);
 await expect.poll(()=>page.getByTestId('news-unread-button').locator('.MuiBadge-badge').evaluate(n=>n.getBoundingClientRect().height)).toBeGreaterThan(14);await page.screenshot({path:info.outputPath('news-new.png')});
 const popup=page.waitForEvent('popup');await page.getByTestId('stock-news-card').first().getByRole('link',{name:'원문보기'}).click();await (await popup).close();
 await expect.poll(()=>(data.items[0] as any).isRead).toBe(true);await expect(page.getByTestId('news-new')).toHaveCount(9);await expect(page).toHaveURL(/\/detail\/stock-news$/);
});
