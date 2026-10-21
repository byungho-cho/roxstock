import {test,expect,type Page} from './authenticated-test';
import {fixture} from './phase3-fixture';
import path from 'node:path';
const ids=['security-master','realtime-prices','market-prices','account-snapshots','investor-trends','dart-financial-statements'];
const summaryIds=[...ids,'stock-news'];
const at='2026-10-11T03:00:00Z';
const summary=(failed=false)=>({generatedAt:at,timezone:'Asia/Seoul',features:summaryIds.map(id=>({id,name:id,status:failed?'FAILED':'OK',phase:'CURRENT',lastAttemptAt:at,lastSuccessAt:at,nextAt:at,recent:{target:123,processed:120,success:120,failed:failed?3:0,skipped:0},backfillCompletedAt:at,backfill:{planned:123,success:120,noFiling:0,notApplicable:0},dailyApiCalls:12,dailyApiLimit:100,priorityPending:1,universePending:2,companyChecks:12,realtime:{heartbeatAt:at,session:'OPEN',lastPriceReceivedAt:at,lastSourcePriceAt:at,lastDbSavedAt:at,lastSsePublishedAt:at,sourceError:failed?'원천 연결 실패':null}}))});
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
 await expect(page.getByTestId('monitor-summary')).not.toContainText('완료 7건');await expect(page.locator('main')).not.toContainText('0건');await expect(page.getByTestId('monitor-summary').getByRole('button')).toHaveCount(0);
 await expect(page.locator('[data-loading-indicator="visible"]').first()).toBeVisible();const before=await boxes(page);await capture(page,'loading',info.project.name);
 f.release();await expect(page.getByTestId('monitor-summary')).toContainText('완료 7건');await expect(page.locator('[data-loading-indicator]')).toHaveCount(0);expect(await boxes(page)).toEqual(before);
 expect(await page.locator('[data-testid^="monitor-feature-"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-testid')))).toEqual(['realtime-prices','account-snapshots','market-prices','investor-trends','dart-financial-statements','security-master','stock-news'].map(id=>'monitor-feature-'+id));
 await capture(page,'ready',info.project.name);
});
for(const id of ids)test(`${id}: independent slow data preserves detail card sizes`,async({page},info)=>{
 const f=await setup(page);f.state.holdSummary=true;f.state.holdDetail=true;await page.goto(`/detail/collection-monitoring/${id}`);
 await expect(page.getByTestId('monitor-current')).toContainText('현재 상태');await expect(page.getByRole('button',{name:'실행 이력 상세보기',exact:true})).toBeAttached();await expect(page.locator('main')).not.toContainText('실행 이력이 없습니다.');await expect(page.locator('main')).not.toContainText('확인 0');
 await expect(page.locator('[data-loading-indicator="visible"]').first()).toBeVisible();const before=await boxes(page);f.release();await expect(page.getByTestId('monitor-history-data')).toContainText('123');await expect(page.locator('[data-loading-indicator]')).toHaveCount(0);await capture(page,id,info.project.name);
});
test('same-query refresh and failed refresh preserve results, retry recovers',async({page},info)=>{
 const f=await setup(page);await page.goto('/detail/collection-monitoring/security-master');await expect(page.getByTestId('monitor-history-data')).toContainText('123');const before=await boxes(page);
 f.state.holdDetail=true;f.state.holdSummary=true;await page.getByRole('button',{name:'통계 새로고침'}).last().click();await expect(page.getByTestId('monitor-history-data')).toContainText('123');await expect(page.locator('[data-loading-indicator]')).toHaveCount(0);await expect(page.getByLabel('갱신 중').first()).toBeVisible();expect(await boxes(page)).toEqual(before);
 f.state.failDetail=true;f.state.failSummary=true;f.release();await expect(page.locator('.MuiSnackbar-root [role=alert]')).toContainText('조회 실패',{timeout:15000});await expect(page.getByTestId('monitor-history-data')).toContainText('123');expect(await boxes(page)).toEqual(before);await capture(page,'refresh-failed',info.project.name);
 f.state.failDetail=false;f.state.failSummary=false;await page.getByRole('button',{name:'통계 새로고침',exact:true}).last().click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByTestId('monitor-history-data')).toContainText('123');
});
test('initial query failure never reports an empty result; retry shows collector error separately',async({page},info)=>{
 const f=await setup(page);f.state.failDetail=true;f.state.failSummary=true;await page.goto('/detail/collection-monitoring/realtime-prices');await expect(page.getByRole('alert').first()).toContainText('조회 실패',{timeout:15000});await expect(page.locator('main')).not.toContainText('실행 이력이 없습니다.');await expect(page.locator('main')).not.toContainText('완료 7건');await expect(page.locator('[data-loading-indicator]')).toHaveCount(0);const before=await boxes(page);
 f.state.failDetail=false;f.state.failSummary=false;f.state.collectorError=true;await page.getByRole('button',{name:'통계 새로고침',exact:true}).last().click();await expect(page.getByTestId('monitor-current')).toContainText('오류');await expect(page.getByTestId('monitor-history-data')).toContainText('실제 수집 실패');await expect(page.getByRole('alert')).toHaveCount(0);await capture(page,'collector-error',info.project.name);
});
test('detail waiting does not hide ready summary or show fake progress',async({page})=>{
 const f=await setup(page);f.state.holdDetail=true;await page.goto('/detail/collection-monitoring/dart-financial-statements');await expect(page.getByTestId('monitor-current')).toContainText('완료');await expect(page.getByTestId('monitor-history-data').locator('[data-loading-indicator="visible"]').first()).toBeVisible();await expect(page.locator('main')).not.toContainText('완료 0');f.release();await expect(page.getByTestId('monitor-history-data')).toContainText('123');
});
test('fast response and fresh cache never paint skeletons',async({page})=>{
 const f=await setup(page);
 await page.addInitScript(()=>{(window as any).monitorFlashes=0;new MutationObserver(()=>{if(document.querySelector('[aria-label="데이터 조회 중"] [data-loading-indicator="visible"]'))(window as any).monitorFlashes++;}).observe(document,{subtree:true,attributes:true,childList:true});});
 await page.goto('/detail/collection-monitoring');await expect(page.getByTestId('monitor-summary')).toContainText('완료 7건');
 await page.getByTestId('monitor-feature-market-prices').click();await expect(page.getByTestId('monitor-history-data')).toContainText('123');
 const calls=f.state.summaryCalls,details=f.state.detailCalls;
 if(page.viewportSize()!.width>=600){await page.getByTestId('monitor-feature-security-master').click();await expect(page.getByTestId('monitor-history-data')).toContainText('123');await page.getByTestId('monitor-feature-market-prices').click();}
 else {await page.goBack();await expect(page.getByTestId('monitor-summary')).toContainText('완료 7건');await page.getByTestId('monitor-feature-market-prices').click();}
 await expect(page.getByTestId('monitor-history-data')).toContainText('123');await expect(page.locator('[data-loading-indicator]')).toHaveCount(0);expect(f.state.summaryCalls).toBe(calls);expect(f.state.detailCalls).toBe(details);expect(await page.evaluate(()=>(window as any).monitorFlashes)).toBe(0);
});
test('single notifications APK from every settings entry path',async({page})=>{
 await setup(page);const url='/downloads/android/roxstock-notifications-0.1.7.apk';await page.route('**/downloads/android/notifications-latest.json',r=>r.fulfill({json:{version:'0.1.2',updatedAt:'2026-10-09',url}}));
 for(const entry of ['/detail/settings','/detail/settings?view=settings']){await page.goto(entry);const link=page.getByRole('link',{name:'APK 다운로드',exact:true});await expect(link).toHaveAttribute('href',url);await expect(link).toHaveAttribute('download','');await expect(page.locator('main')).not.toContainText('시험');await expect(page.locator('main')).toContainText('알림 지원');await expect(link).toHaveCount(1);await expect(page.getByText('알림 지원 APK 다운로드',{exact:true})).toHaveCount(0);}
 await page.goto('/more');await page.getByTestId('more-menu').getByRole('button',{name:'설정',exact:true}).click();await expect(page.getByRole('link',{name:'APK 다운로드',exact:true})).toHaveAttribute('href',url);
 await page.goto('/more');await page.getByTestId('bottom-menu-scroll').getByRole('button',{name:'설정',exact:true}).click();await expect(page.getByRole('link',{name:'APK 다운로드',exact:true})).toHaveAttribute('href',url);
});


test('bug report review, resolve and deletion are available through summary details',async({page})=>{
 await setup(page);let state='OPEN',deleted=false;
 const report=()=>({id:'900',feature:'dart-financial-statements',code:'PERIOD_EPS_MISSING',severity:'WARNING',summary:'EPS 보완 미완료',state,occurrences:4,firstSeenAt:at,lastSeenAt:at,reviewNote:null});
 await page.route('**/api/collection/bug-reports**',async route=>{
  if(new URL(route.request().url()).pathname.endsWith('/summary'))return route.fulfill({json:{data:{open:deleted?0:1,reviewing:0,resolved:0,lastSeenAt:at}}});
  if(route.request().method()==='PATCH'){state=route.request().postDataJSON().state;return route.fulfill({json:{data:report()}});}
  if(route.request().method()==='DELETE'){deleted=true;return route.fulfill({json:{data:{deleted:true}}});}
  return route.fulfill({json:{data:new URL(route.request().url()).pathname.endsWith('/900')?{...report(),events:[{eventKey:'test',observedAt:at,securityName:'테스트종목',symbol:'005930',fiscalYear:2021,periodType:'ANNUAL'}]}:{rows:deleted?[]:[report()],hasNext:false}}});
 });
 await page.goto('/detail/collection-monitoring');await page.getByTestId('collection-bug-report-summary').click();await expect(page).toHaveURL(/collection-monitoring\/bug-reports$/);const panel=page.getByTestId('collection-bug-reports');await panel.scrollIntoViewIfNeeded();await expect(panel).toContainText('경고 · 신규 · 4회');await panel.getByRole('button').filter({hasText:'EPS 보완 미완료'}).click();const dialog=page.getByRole('dialog');await expect(dialog).toContainText('테스트종목');await expect(dialog).toContainText('경고 · 신규');await dialog.getByLabel('검토 메모').fill('계산 근거 확인');await dialog.getByRole('button',{name:'검토 중',exact:true}).click();await expect(dialog).toContainText('경고 · 검토 중');await dialog.getByRole('button',{name:'해결 완료',exact:true}).click();await dialog.getByRole('button',{name:'리포트 삭제',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(panel).toContainText('해당 조건의 리포트가 없습니다.');
});
