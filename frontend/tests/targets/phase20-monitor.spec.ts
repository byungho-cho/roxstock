import {test,expect,type Page} from '@playwright/test';
import {fixture} from './phase3-fixture';
import path from 'node:path';
const ids=['security-master','realtime-prices','market-prices','account-snapshots','dart-financial-statements'];
const at='2026-10-11T03:00:00Z';
const summary=(failed=false)=>({generatedAt:at,timezone:'Asia/Seoul',features:ids.map(id=>({id,name:id,status:failed?'FAILED':'OK',phase:'CURRENT',lastAttemptAt:at,lastSuccessAt:at,nextAt:at,recent:{target:123,processed:120,success:120,failed:failed?3:0,skipped:0},backfillCompletedAt:at,backfill:{planned:123,success:120,noFiling:0,notApplicable:0},dailyApiCalls:12,dailyApiLimit:100,priorityPending:1,universePending:2,companyChecks:12,realtime:{heartbeatAt:at,session:'OPEN',lastPriceReceivedAt:at,lastSourcePriceAt:at,lastDbSavedAt:at,lastSsePublishedAt:at,sourceError:failed?'원천 연결 실패':null}}))});
const detail=(failed=false)=>({runs:[{id:'r1',status:failed?'FAILED':'SUCCESS',startedAt:at,target:123,success:120,failed:failed?3:0,skipped:0,failureReason:failed?'실제 수집 실패':null}],items:[{symbol:'005930',status:failed?'FAILED':'SUCCESS',occurredAt:at,reason:failed?'실제 수집 실패':null}],dart:{backfill:{planned:127488,byStatus:{SUCCESS:120000,FAILED:448,PENDING:7040}},priority:{planned:12,securities:4,byStatus:{SUCCESS:10}},current:{priorityCheckedWithinDay:5,universeOver90Days:2},holidayCalendar:'AVAILABLE'}});
async function setup(page:Page){
 await fixture(page);const state={holdSummary:false,holdDetail:false,failSummary:false,failDetail:false,collectorError:false,summaryCalls:0,detailCalls:0};
 const releases:Array<()=>void>=[];
 await page.route('**/api/collection/monitoring**',async route=>{const isSummary=new URL(route.request().url()).pathname.endsWith('/monitoring');if(isSummary)state.summaryCalls++;else state.detailCalls++;
  if(isSummary?state.holdSummary:state.holdDetail)await new Promise<void>(resolve=>releases.push(resolve));
  if(isSummary?state.failSummary:state.failDetail)return route.fulfill({status:503,json:{error:{message:'query unavailable'}}});
  const path=new URL(route.request().url()).pathname;const d=detail(state.collectorError);return route.fulfill({json:{data:isSummary?summary(state.collectorError):/\/(runs|items)$/.test(path)?{rows:path.endsWith('/runs')?d.runs:d.items.map((r,i)=>({...r,id:String(i)})),hasNext:false,nextCursor:null}:d}});
 });
 return {state,release(){state.holdSummary=false;state.holdDetail=false;releases.splice(0).forEach(r=>r());}};
}
async function capture(page:Page,name:string,project:string){const root=process.env.ROX_PHASE20_CAPTURE_DIR;if(root)await page.screenshot({path:path.join(root,`monitor-${project}-${name}.png`)});}
const boxes=async(page:Page)=>page.locator('[data-testid^="monitor-"]:not([data-testid$="-data"]):not([data-testid$="-row"])').evaluateAll(nodes=>nodes.map(n=>({id:n.getAttribute('data-testid'),width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,top:n.getBoundingClientRect().top})));
test('summary slow first load keeps all cards, labels and geometry',async({page},info)=>{
 const f=await setup(page);f.state.holdSummary=true;f.state.holdDetail=true;await page.goto('/detail/collection-monitoring');
 await expect(page.getByTestId('monitor-summary')).toContainText('전체 상태');for(const id of ids)await expect(page.getByTestId(`monitor-feature-${id}`)).toBeAttached();
 await expect(page.getByTestId('monitor-summary')).not.toContainText('정상');await expect(page.locator('main')).not.toContainText('0건');await expect(page.getByRole('button',{name:'통계 새로고침'}).first()).toBeVisible();
 await expect(page.locator('[data-loading-indicator="visible"]').first()).toBeVisible();const before=await boxes(page);await capture(page,'loading',info.project.name);
 f.release();await expect(page.getByTestId('monitor-summary')).toContainText('정상');await expect(page.locator('[data-loading-indicator]')).toHaveCount(0);expect(await boxes(page)).toEqual(before);await capture(page,'ready',info.project.name);
});
for(const id of ids)test(`${id}: independent slow data preserves detail card sizes`,async({page},info)=>{
 const f=await setup(page);f.state.holdSummary=true;f.state.holdDetail=true;await page.goto(`/detail/collection-monitoring/${id}`);
 await expect(page.getByTestId('monitor-current')).toContainText('현재 상태');await expect(page.getByRole('button',{name:'실행 이력 상세보기',exact:true})).toBeAttached();await expect(page.locator('main')).not.toContainText('실행 이력이 없습니다.');await expect(page.locator('main')).not.toContainText('확인 0');
 await expect(page.locator('[data-loading-indicator="visible"]').first()).toBeVisible();const before=await boxes(page);f.release();await expect(page.getByTestId('monitor-history-data')).toContainText('123');await expect(page.locator('[data-loading-indicator]')).toHaveCount(0);await capture(page,id,info.project.name);
});
test('same-query refresh and failed refresh preserve results, retry recovers',async({page},info)=>{
 const f=await setup(page);await page.goto('/detail/collection-monitoring/security-master');await expect(page.getByTestId('monitor-history-data')).toContainText('123');const before=await boxes(page);
 f.state.holdDetail=true;f.state.holdSummary=true;await page.getByRole('button',{name:'통계 새로고침'}).last().click();await expect(page.getByTestId('monitor-history-data')).toContainText('123');await expect(page.locator('[data-loading-indicator]')).toHaveCount(0);await expect(page.getByLabel('갱신 중').first()).toBeVisible();expect(await boxes(page)).toEqual(before);
 f.state.failDetail=true;f.state.failSummary=true;f.release();await expect(page.getByTestId('collection-feature-overview').locator(':scope > div').first().getByRole('alert')).toContainText('조회 실패',{timeout:15000});await expect(page.getByTestId('monitor-history-data')).toContainText('123');expect(await boxes(page)).toEqual(before);await capture(page,'refresh-failed',info.project.name);
 f.state.failDetail=false;f.state.failSummary=false;await page.getByTestId('collection-feature-overview').locator(':scope > div').first().getByRole('button',{name:'다시 시도',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByTestId('monitor-history-data')).toContainText('123');
});
test('initial query failure never reports an empty result; retry shows collector error separately',async({page},info)=>{
 const f=await setup(page);f.state.failDetail=true;f.state.failSummary=true;await page.goto('/detail/collection-monitoring/realtime-prices');await expect(page.getByRole('alert').first()).toContainText('조회 실패',{timeout:15000});await expect(page.locator('main')).not.toContainText('실행 이력이 없습니다.');await expect(page.locator('main')).not.toContainText('정상');await expect(page.locator('[data-loading-indicator]')).toHaveCount(0);const before=await boxes(page);
 f.state.failDetail=false;f.state.failSummary=false;f.state.collectorError=true;await page.getByTestId('collection-feature-overview').locator(':scope > div').first().getByRole('button',{name:'다시 시도',exact:true}).click();await expect(page.getByTestId('monitor-current')).toContainText('오류');await expect(page.getByTestId('monitor-history-data')).toContainText('실제 수집 실패');await expect(page.getByRole('alert')).toHaveCount(0);await capture(page,'collector-error',info.project.name);
});
test('detail waiting does not hide ready summary or show fake progress',async({page})=>{
 const f=await setup(page);f.state.holdDetail=true;await page.goto('/detail/collection-monitoring/dart-financial-statements');await expect(page.getByTestId('monitor-current')).toContainText('완료');await expect(page.getByTestId('monitor-history-data').locator('[data-loading-indicator="visible"]').first()).toBeVisible();await expect(page.locator('main')).not.toContainText('완료 0');f.release();await expect(page.getByTestId('monitor-history-data')).toContainText('123');
});
test('fast response and fresh cache never paint skeletons',async({page})=>{
 const f=await setup(page);
 await page.addInitScript(()=>{(window as any).monitorFlashes=0;new MutationObserver(()=>{if(document.querySelector('[aria-label="데이터 조회 중"] [data-loading-indicator="visible"]'))(window as any).monitorFlashes++;}).observe(document,{subtree:true,attributes:true,childList:true});});
 await page.goto('/detail/collection-monitoring');await expect(page.getByTestId('monitor-summary')).toContainText('정상');
 await page.getByTestId('monitor-feature-market-prices').click();await expect(page.getByTestId('monitor-history-data')).toContainText('123');
 const calls=f.state.summaryCalls,details=f.state.detailCalls;
 if(page.viewportSize()!.width>=600){await page.getByTestId('monitor-feature-security-master').click();await expect(page.getByTestId('monitor-history-data')).toContainText('123');await page.getByTestId('monitor-feature-market-prices').click();}
 else {await page.goBack();await expect(page.getByTestId('monitor-summary')).toContainText('정상');await page.getByTestId('monitor-feature-market-prices').click();}
 await expect(page.getByTestId('monitor-history-data')).toContainText('123');await expect(page.locator('[data-loading-indicator]')).toHaveCount(0);expect(f.state.summaryCalls).toBe(calls);expect(f.state.detailCalls).toBe(details);expect(await page.evaluate(()=>(window as any).monitorFlashes)).toBe(0);
});
test('APK name and original URL from settings entry paths',async({page})=>{
 await setup(page);const url='/downloads/android/roxstock-web-0.1.2.apk';await page.route('**/downloads/android/latest.json',r=>r.fulfill({json:{version:'0.1.2',updatedAt:'2026-10-09',url}}));
 for(const entry of ['/detail/settings','/detail/settings?view=settings']){await page.goto(entry);const link=page.getByRole('link',{name:'APK 다운로드',exact:true});await expect(link).toHaveAttribute('href',url);await expect(link).toHaveAttribute('download','');await expect(page.locator('main')).not.toContainText('시험');await expect(page.locator('main')).toContainText('체결 알림 수집 제외');}
 await page.goto('/more');await page.getByTestId('more-menu').getByRole('button',{name:'설정',exact:true}).click();await expect(page.getByRole('link',{name:'APK 다운로드',exact:true})).toHaveAttribute('href',url);
 await page.goto('/more');await page.getByTestId('bottom-menu-scroll').getByRole('button',{name:'설정',exact:true}).click();await expect(page.getByRole('link',{name:'APK 다운로드',exact:true})).toHaveAttribute('href',url);
});

