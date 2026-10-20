import {test,expect,type Page} from './authenticated-test';
import {writeFileSync} from 'node:fs';
import {fixture} from './phase3-fixture';
const at='2026-10-12T00:00:00Z';
const row=(id:number,stream:string)=>stream==='runs'?{id:String(id),status:'PARTIAL',startedAt:at,target:2,success:1,failed:1,skipped:0,failureReason:'일부 실패 · '+('긴 오류 '.repeat(30)),metadata:{phase:'BACKFILL'}}:{id:String(id),symbol:`005930:${2025+id%2}:11011`,security:{name:'삼성전자'},status:'SUCCESS',occurredAt:at,reason:'상세 끝 '+('긴 오류 '.repeat(100))};
async function setup(page:Page,total:number){
 await fixture(page);const reads:{path:string;limit:number;cursor:string|null;symbol:string|null;result:string|null}[]=[];
 const state={failNext:false,holdNext:false,holdInitial:false};const release:(()=>void)[]=[];
 await page.route('**/api/collection/monitoring**',async r=>{
  const u=new URL(r.request().url()),stream=u.pathname.split('/').at(-1)!;
  if(stream==='monitoring')return r.fulfill({json:{data:{generatedAt:at,features:[{id:'security-master',name:'종목 마스터',status:'PARTIAL',recent:{target:total,success:total,failed:0,skipped:0}}]}}});
  if(!['runs','items'].includes(stream))return r.fulfill({json:{data:{}}});
  const limit=Number(u.searchParams.get('limit')),cursor=u.searchParams.get('cursor'),symbol=u.searchParams.get('symbol'),result=u.searchParams.get('result');
  reads.push({path:u.pathname,limit,cursor,symbol,result});
  if(cursor && state.holdNext || !cursor && state.holdInitial)await new Promise<void>(resolve=>release.push(resolve));
  if(cursor && state.failNext)return r.fulfill({status:503,json:{error:{message:'추가 조회 실패'}}});
  const start=Number(cursor??0),count=result==='SUCCESS'?0:total;
  const rows=Array.from({length:Math.max(0,Math.min(limit,count-start))},(_,i)=>row(count-start-i,stream));
  return r.fulfill({json:{data:{rows,hasNext:start+limit<count,nextCursor:start+limit<count?String(start+limit):null}}});
 });
 return {reads,state,release(){state.holdNext=false;state.holdInitial=false;release.splice(0).forEach(fn=>fn());}};
}
for(const total of [0,1,3])test(`summary shows exactly ${total} rows with adaptive heights and matching count colors`,async({page},info)=>{
 const f=await setup(page,total);await page.goto('/detail/collection-monitoring/security-master');
 await expect(page.getByTestId('monitor-history-data')).toBeAttached();await expect(page.getByTestId('monitor-run-row')).toHaveCount(total);await expect(page.getByTestId('monitor-target-row')).toHaveCount(total);
 if(!total)await expect(page.getByTestId('monitor-history-data')).toContainText('실행 이력이 없습니다.');
 expect(f.reads.filter(r=>r.limit===3)).toHaveLength(2);await expect(page.getByRole('button',{name:'필터',exact:true})).toHaveCount(0);
 const colors=await page.getByTestId('monitor-counts').locator('> button').evaluateAll(ns=>ns.map(n=>[...n.querySelectorAll('p')].map(p=>getComputedStyle(p).color)));
 expect(colors).toEqual([['rgb(248, 250, 252)','rgb(248, 250, 252)'],['rgb(52, 211, 153)','rgb(52, 211, 153)'],['rgb(248, 113, 113)','rgb(248, 113, 113)'],['rgb(242, 247, 252)','rgb(242, 247, 252)']]);
 if(total)expect(await page.getByTestId('monitor-run-row').first().locator('p').evaluateAll(ns=>ns.map(n=>getComputedStyle(n).color))).toEqual(Array(3).fill('rgb(251, 191, 36)'));
 const heights={history:(await page.getByTestId('monitor-history-data').boundingBox())!.height,targets:(await page.getByTestId('monitor-results-data').boundingBox())!.height};
 writeFileSync(info.outputPath(`summary-${total}.json`),JSON.stringify({viewport:page.viewportSize(),total,heights,reads:f.reads},null,2));
 await page.screenshot({path:info.outputPath(`summary-${total}.png`)});
});
for(const stream of ['runs','items'])for(const total of [0,49,50,51,105])test(`${stream} ${total}: server requests exactly fifty and append without nested scrolling`,async({page},info)=>{
 const f=await setup(page,total);await page.goto(`/detail/collection-monitoring/security-master/${stream}`);
 const rows=page.getByTestId(stream==='runs'?'monitor-run-row':'monitor-target-row');
 await expect.poll(()=>f.reads.length).toBe(1);await expect(rows).toHaveCount(Math.min(50,total));
 for(let next=1;next<Math.ceil(total/50);next++){await page.locator('main').getByRole('button',{name:'더보기',exact:true}).click();await expect(rows).toHaveCount(Math.min(total,(next+1)*50));}
 await expect(page.locator('main').getByRole('button',{name:'더보기',exact:true})).toHaveCount(0);
 await expect(rows).toHaveCount(total);expect(f.reads.every(r=>r.limit===50)).toBe(true);expect(f.reads.length).toBe(Math.max(1,Math.ceil(total/50)));
 expect(await rows.evaluateAll(ns=>new Set(ns.map(n=>n.getAttribute('data-scroll-item'))).size)).toBe(total);
 const nested=await page.locator('main').evaluate(n=>[...n.querySelectorAll('*')].filter(e=>getComputedStyle(e).overflowY==='auto'||getComputedStyle(e).overflowY==='scroll').map(e=>e.getAttribute('data-testid')));expect(nested).toEqual([]);
 expect(await page.locator('main').evaluate(n=>getComputedStyle(n).overflowY)).toBe('auto');
 if(stream==='items' && total){await rows.first().locator('summary').click();await expect(rows.first()).toContainText('상세 끝');}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 writeFileSync(info.outputPath(`pages-${stream}-${total}.json`),JSON.stringify({viewport:page.viewportSize(),total,reads:f.reads},null,2));
 if(total===105)await page.screenshot({path:info.outputPath(`detail-${stream}.png`)});
});
test('duplicate more clicks, failed append retry and filters reset independently',async({page})=>{
 const f=await setup(page,105);await page.goto('/detail/collection-monitoring/security-master/runs');await expect(page.getByTestId('monitor-run-row')).toHaveCount(50);
 f.state.holdNext=true;await page.locator('main').getByRole('button',{name:'더보기',exact:true}).click();await page.locator('main').getByRole('button',{name:'더보기',exact:true}).dispatchEvent('click');await expect.poll(()=>f.reads.length).toBe(2);await expect(page.getByTestId('monitor-run-row')).toHaveCount(50);
 f.state.failNext=true;f.release();await expect(page.getByRole('alert')).toContainText('조회 실패');await expect(page.getByTestId('monitor-run-row')).toHaveCount(50);
 f.state.failNext=false;await page.getByRole('button',{name:'다시 시도'}).click();await expect(page.getByTestId('monitor-run-row')).toHaveCount(100);
 await page.getByRole('button',{name:'필터',exact:true}).click();await page.getByLabel('종목 필터',{exact:true}).fill('000001');await expect(page.getByTestId('monitor-run-row')).toHaveCount(50);await expect.poll(()=>f.reads.at(-1)?.symbol).toBe('000001');expect(f.reads.at(-1)?.cursor).toBeNull();
 await page.getByRole('button',{name:'전체 기록',exact:true}).click();await expect(page.getByTestId('monitor-run-row')).toHaveCount(50);
});
test('back returns to original feature and body scroll; cached detail retains loaded rows',async({page})=>{
 await setup(page,105);await page.goto('/detail/collection-monitoring/security-master');await expect(page.getByTestId('monitor-run-row')).toHaveCount(3);
 await page.getByRole('button',{name:'실행 이력 상세보기'}).scrollIntoViewIfNeeded();const top=await page.locator('main').evaluate(n=>n.scrollTop);await page.getByRole('button',{name:'실행 이력 상세보기'}).click();await expect(page.getByTestId('monitor-run-row')).toHaveCount(50);await page.locator('main').getByRole('button',{name:'더보기',exact:true}).click();await expect(page.getByTestId('monitor-run-row')).toHaveCount(100);
 await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page).toHaveURL(/security-master$/);await expect(page.getByTestId('monitor-run-row')).toHaveCount(3);await expect.poll(()=>page.locator('main').evaluate(n=>n.scrollTop)).toBe(top);
 await page.getByRole('button',{name:'실행 이력 상세보기'}).click();await expect(page.getByTestId('monitor-run-row')).toHaveCount(100);
});
test('slow first page keeps labels without fake empty data; old filter response is isolated',async({page})=>{
 const f=await setup(page,51);f.state.holdInitial=true;await page.goto('/detail/collection-monitoring/security-master/runs');await expect(page.getByRole('button',{name:'필터',exact:true})).toBeVisible();await expect(page.locator('main')).not.toContainText('실행 이력이 없습니다.');
 await page.getByRole('button',{name:'필터',exact:true}).click();await page.getByLabel('종목 필터',{exact:true}).fill('005930');f.release();await expect(page.getByTestId('monitor-run-row')).toHaveCount(50);await expect.poll(()=>f.reads.at(-1)?.symbol).toBe('005930');
});
