import {test,expect} from './authenticated-test';
import {fixture} from './phase3-fixture';
for(const scenario of ['mixed','empty','running'] as const)test(`종목 데이터 수집 ${scenario}: unique outcomes, preserved monitor sections and management navigation`,async({page},info)=>{
 await fixture(page);const at='2026-10-27T00:00:00Z',counts=scenario==='empty'?{target:0,success:0,failed:0,skipped:0,unresolved:0,pending:0,processing:0}:{target:10,success:5,failed:1,skipped:1,unresolved:1,pending:scenario==='running'?1:2,processing:scenario==='running'?1:0};
 await page.route('**/api/security-data/status',r=>r.fulfill({json:{data:{enabled:true,run:{status:'PARTIAL',counts}}}}));
 await page.route('**/api/collection/monitoring**',r=>{const p=new URL(r.request().url()).pathname;return r.fulfill({json:{data:p.endsWith('/monitoring')?{generatedAt:at,features:[{id:'dart-financial-statements',name:'종목 데이터 수집',status:'WAITING',phase:'SECURITY_DATA',recent:counts,unresolved:counts.unresolved}]}:/\/(runs|items)$/.test(p)?{rows:[],hasNext:false,nextCursor:null}:{runs:[],items:[]}}});});
 await page.goto('/detail/collection-monitoring/dart-financial-statements');const card=page.getByTestId('security-collection-card');await expect(card).toBeVisible();
 await expect(card).toContainText(`대상 ${counts.target}`);await expect(card).toContainText(`실패 ${counts.failed}`);await expect(card).toContainText(`미해결 ${counts.unresolved}`);
 await expect(page.getByTestId('monitor-history-data')).toBeAttached();await expect(page.getByTestId('monitor-results-data')).toBeAttached();await expect(page.getByTestId('monitor-counts').locator('>button')).toHaveCount(5);
 await expect(page.locator('main')).not.toContainText('1단계');await expect(page.locator('main')).not.toContainText('2단계');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath(`${scenario}.png`),fullPage:true});
 await card.click();await expect(page).toHaveURL(/detail\/security-data$/);
});
