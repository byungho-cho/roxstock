import {test,expect} from './authenticated-test';
import {fixture} from './phase3-fixture';
import {processingView,securityWorkKey,type WorkResult} from '../../../shared/src/domain/security-data-aggregation';
for(const scenario of ['mixed','empty','running','query-failed','duplicates','partial-query','no-history'] as const)test('종목 데이터 수집 '+scenario,async({page},info)=>{
 await fixture(page);const at='2026-10-28T00:00:00Z';
 const work=(state:WorkResult['state'],i:number)=>{const w={receiptNo:'20261028000001',securityId:String(i),reportPeriod:'2026.09',divisionPolicy:'CFS_THEN_OFS',state};return {...w,key:securityWorkKey(w)};};
 const workItems=scenario==='mixed'?['SUCCESS','PARTIAL','FAILED','EXCLUDED','PENDING'].map((s,i)=>work(s as WorkResult['state'],i)):scenario==='running'?[work('PROCESSING',1)]:[];
 const discovery={status:scenario==='query-failed'?'FAILED':scenario==='partial-query'?'PARTIAL':'COMPLETE',found:scenario==='duplicates'?5:workItems.length?1:0,created:workItems.length,completedAt:at};
 const a=processingView(scenario==='no-history'?null:{id:'1',status:scenario==='running'?'RUNNING':scenario==='mixed'?'PARTIAL':scenario==='query-failed'?'FAILED':'SKIPPED',startedAt:at,finishedAt:scenario==='running'?null:at,metadata:{workItems,discovery}},{lastCompletedAt:at,coverageFrom:'20261028'},'2026-10-27T00:00:00Z');const c=a.counts;
 await page.route('**/api/security-data/status',r=>r.fulfill({json:{data:{enabled:true,aggregation:a}}}));
 const items=scenario==='mixed'?[{id:'1',symbol:'005930',security:{name:'삼성전자'},status:'NO_DATA',reason:'필요한 가치지표 근거 부족',securityData:{outcome:'UNRESOLVED',partial:true,financialStored:true,fiscalYear:2026,periodType:'Q2',receiptNo:'20260814000001'}}]:[];
 await page.route('**/api/collection/monitoring**',r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({json:{data:p.endsWith('/monitoring')?{generatedAt:at,features:[{id:'dart-financial-statements',name:'종목 데이터 수집',status:'WAITING',phase:'SECURITY_DATA',recent:{target:c.target,success:c.success,failed:c.failed,skipped:c.excluded},partial:c.partial,securityData:a}]}:/\/(runs|items)$/.test(p)?{rows:p.endsWith('/items')?items:[],hasNext:false,nextCursor:null}:{runs:[],items:[]}}});});
 await page.route('**/api/security-data/quarters**',r=>r.fulfill({json:{data:{asOf:at,quarters:[]}}}));
 await page.goto('/detail/collection-monitoring/dart-financial-statements');const card=page.getByTestId('security-collection-card');await expect(card).toBeVisible();
 await expect(card).toContainText('처리 대상 '+c.target+'건');await expect(card).toContainText('부분 완료 '+c.partial);await expect(card).toContainText('실패 '+c.failed);
 if(c.rate===null){await expect(card).toContainText('처리 성공률 —');await expect(card.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');}else await expect(card).toContainText(c.rate.toFixed(1)+'%');
 await expect(page.getByTestId('monitor-current')).toContainText(a.message);
 const boxes=await page.getByTestId('security-work-counts').locator('>span').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().top));expect(new Set(boxes).size).toBe(1);
 await expect(page.getByTestId('monitor-history-data')).toBeAttached();await expect(page.getByTestId('monitor-results-data')).toBeAttached();await expect(page.getByTestId('monitor-counts').locator('>button')).toHaveCount(5);
 if(scenario==='mixed'){const row=page.getByTestId('monitor-target-row');await expect(row).toContainText('미해결');await row.locator('summary').click();await expect(row).toContainText('부분수집');await expect(row).toContainText('재무제표 저장 완료');}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(scenario+'.png'),fullPage:true});
 await card.click();await expect(page).toHaveURL(/detail\/security-data$/);
});
