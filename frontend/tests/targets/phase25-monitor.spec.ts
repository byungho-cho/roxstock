import {test,expect} from './authenticated-test';
import {fixture} from './phase3-fixture';
for(const mode of ['snapshot','interrupted'])test(`${mode}: result and schedule are separate; correct run identity and no horizontal overflow`,async({page},info)=>{
 await fixture(page);
 const interrupted=mode==='interrupted',id=interrupted?'market-prices':'account-snapshots',runId=interrupted?'5409':'5560';
 const at=interrupted?'2026-10-12T11:00:14Z':'2026-10-12T14:00:09Z';
 await page.route('**/api/collection/monitoring**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.endsWith('/monitoring'))return route.fulfill({json:{data:{features:[{id,name:id,status:interrupted?'RUNNING':'OK',lastAttemptAt:at,nextAt:'2026-10-13T14:00:00Z',recent:{target:interrupted?2327:5,success:interrupted?2324:5,failed:interrupted?3:0,excluded:0,skipped:0},resultScope:{runId,label:'최근 실행 대상 결과',startedAt:at},lastExecution:{id:runId,status:interrupted?'RUNNING':'SUCCESS',startedAt:at},scheduleState:{status:interrupted?'DELAYED':'WAITING',reason:interrupted?'실행 제한 시간 초과':null,dueAt:at},duplicateRequest:interrupted?{id:'5451',reason:'잠금 충돌 · 본 실행과 별도 요청'}:null}]}}});
  if(path.endsWith('/runs')||path.endsWith('/items'))return route.fulfill({json:{data:{rows:[],hasNext:false,nextCursor:null}}});
  return route.fulfill({json:{data:{}}});
 });
 await page.goto('/detail/collection-monitoring/'+id);
 await expect(page.getByTestId('monitor-current')).toContainText('실행 #'+runId);
 await expect(page.getByTestId('monitor-current')).toContainText(interrupted?'실행 제한 시간 초과':'다음 회차 대기');
 if(interrupted)await expect(page.getByTestId('monitor-current')).toContainText('별도 요청 #5451');
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);expect(overflow).toBe(false);
 await page.screenshot({path:info.outputPath(mode+'.png'),fullPage:true});
 await page.getByRole('button',{name:'실행 이력 상세보기'}).click();await expect(page).toHaveURL(new RegExp(id+'/runs'));
});
