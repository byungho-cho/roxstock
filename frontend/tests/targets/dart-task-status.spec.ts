import {test,expect} from './authenticated-test';
import {fixture} from './phase3-fixture';
for(const scenario of ['mixed','empty','future'] as const)test(`DART ${scenario}: distinct statuses, correct denominator and bounded detail`,async({page},info)=>{
 await fixture(page);
 const counts=scenario==='mixed'?{SUCCESS:990,NOT_DUE:70,REVIEW_REQUIRED:71}:scenario==='future'?{NOT_DUE:70}:{};
 const progress={planned:scenario==='mixed'?1131:scenario==='future'?70:0,currentTarget:scenario==='mixed'?1061:0,completed:scenario==='mixed'?990:0,byStatus:counts,reviewRequired:scenario==='mixed'?71:0};
 const at='2026-10-21T00:00:00Z';
 await page.route('**/api/collection/monitoring**',route=>{
  const path=new URL(route.request().url()).pathname;
  return route.fulfill({json:{data:path.endsWith('/monitoring')?{generatedAt:at,features:[{id:'dart-financial-statements',name:'DART',status:'OK',phase:'CURRENT',backfillCompletedAt:at,backfill:progress,recent:{target:0,success:0,failed:0,skipped:0}}]}:/\/(runs|items)$/.test(path)?{rows:[],hasNext:false,nextCursor:null}:{dart:{backfill:progress,priority:{...progress,securities:35},reviewRequired:progress.reviewRequired,holidayCalendar:'AVAILABLE'},runs:[],items:[]}}});
 });
 const requested:string[]=[];
 await page.route('**/api/collection/dart/tasks?**',route=>{requested.push(route.request().url());return route.fulfill({json:{data:{total:1,nextOffset:null,items:[{id:'1',symbol:'060310',name:'3S',year:2026,period:'Q2',status:'NOT_DUE',reason:'3월 결산 · 대상기간 2026-09-30',checkedAt:at,nextCheckAt:'2026-10-22T00:00:00Z'}]}}});});
 await page.goto('/detail/collection-monitoring/dart-financial-statements');
 const frame=page.getByTestId('monitor-dart-backfill');
 if(scenario==='mixed'){
  await expect(frame).toContainText('93.3%');await expect(frame).toContainText('990 / 1,061');await expect(frame).toContainText('미도래 70');await expect(frame).toContainText('검토 보류 71');
  await expect(frame).not.toContainText('미공시·대상 아님');await expect(frame).not.toContainText('전체 수집 완료');
 }else{await expect(frame).toContainText(scenario==='empty'?'수집 대상 없음':'전부 미도래');await expect(frame).not.toContainText('100.0%');}
 expect(requested.length).toBe(0);
 await page.getByRole('button',{name:'상태별 작업 상세 보기'}).click();await expect(page.getByText('3S (060310) · 2026 Q2')).toBeVisible();await expect(page.getByText('3월 결산 · 대상기간 2026-09-30',{exact:false})).toBeVisible();
 expect(new URL(requested[0]!).searchParams.get('scope')).toBe('priority');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath(`${scenario}.png`),fullPage:true});
});
