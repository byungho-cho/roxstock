import {expect,test,type Page} from '@playwright/test';
const makeGoal=(id:string,name:string,isDefault:boolean)=>({id,goalName:name,annualTargetRate:'10',displayColor:'#5EA1F0',isDefault,isVisible:true,rows:[{year:2025,asset:'132',contributed:'120'},{year:2026,asset:'167.2',contributed:'140'}],yearTarget:'167.2',finalTarget:'167.2',progress:'50'});
const makePlan=(id:string)=>({id,planName:'계획'+id,startYear:2025,endYear:2026,duration:2,initialAssetValue:'100',annualContributionAmount:'20',goals:[makeGoal('1','기준형',true),makeGoal('2','안정형',false)],status:'ACTIVE'});
async function fixture(page:Page,empty=false,goalsEmpty=false){
 const plans=empty?[]:Array.from({length:8},(_,i)=>makePlan(String(i+1)));if(goalsEmpty)plans.forEach(p=>p.goals=[]);
 let fail=false,saveFail=false,held:string|null=null;const releases:(()=>void)[]=[],writes:{method:string;path:string;body:any}[]=[];
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url()),method=route.request().method();
  if(u.pathname==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'기본 계좌',isActive:true,isDefault:true},{id:'2',name:'둘째 계좌',isActive:true}]}});
  if(/\/compound-plans/.test(u.pathname)){
   const account=u.pathname.split('/')[3];
   if(method==='GET'){
    if(account===held)await new Promise<void>(r=>releases.push(r));
    if(fail)return route.fulfill({status:503,json:{error:{message:'조회 테스트 실패'}}});
    return route.fulfill({json:{data:{accountId:account,currentAssets:account==='2'?'900':'83.6',asOf:'2026-10-05T00:00:00Z',calculatedAt:'2026-10-05T00:00:00Z',currentYear:2026,pricingComplete:true,plans:account==='2'?[]:plans,basis:{contributionTiming:'START_OF_YEAR'}}}});
   }
   const body=route.request().postDataJSON();writes.push({method,path:u.pathname,body});
   if(saveFail)return route.fulfill({status:503,json:{error:{message:'저장 테스트 실패'}}});
   const parts=u.pathname.split('/'),p=plans.find(p=>p.id===parts[5]);
   if(u.pathname.endsWith('/default')&&p)p.goals.forEach(g=>g.isDefault=g.id===parts[7]);
   if(method==='DELETE'&&parts.length===6){const index=plans.findIndex(p=>p.id===parts[5]);if(index>=0)plans.splice(index,1);}
   if(method==='POST'&&parts.length===5){plans.push({...makePlan('9'),...body});}
   if(method==='POST'&&p)p.goals.push({...makeGoal('3',body.goalName,false),...body});
   return route.fulfill({json:{data:{id:method==='POST'&&parts.length===5?'9':'3',deleted:method==='DELETE'}}});
  }
  return route.fulfill({json:{data:[]}});
 });
 return {writes,fail:(v:boolean)=>fail=v,saveFail:(v:boolean)=>saveFail=v,hold:(id:string)=>held=id,release:()=>{held=null;releases.splice(0).forEach(r=>r());}};
}
test('cover plan compare detail same targets, default change confirmation and delete cancel',async({page})=>{
 const f=await fixture(page);await page.goto('/detail/compound');await page.getByTestId('compound-plan-1').getByRole('button').click();await expect(page.getByTestId('compound-goal-1')).toContainText('167원');
 await page.getByRole('button',{name:'안정형 기본 목표로 변경'}).click();await expect(page.getByRole('dialog')).toContainText('올해 목표·최종 목표·진행률');await page.getByRole('button',{name:'변경',exact:true}).click();await expect(page.getByTestId('compound-goal-2')).toContainText('안정형 · 기본');
 await page.getByTestId('compound-goal-2').getByRole('button',{name:'상세보기'}).click();await expect(page.getByRole('img',{name:'연도별 예상 자산과 누적 투입금 · 원'})).toBeVisible();
 await page.getByRole('button',{name:'뒤로가기'}).click();await page.getByRole('button',{name:'계획 삭제',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('계획1 · 2025–2026');await expect(page.getByRole('dialog')).toContainText('목표 2개');await page.getByRole('button',{name:'취소',exact:true}).click();expect(f.writes.filter(w=>w.method==='DELETE')).toHaveLength(0);
});
test('cover full-page goal form skips inherited inputs, Enter last saves and failure retains input',async({page})=>{
 const f=await fixture(page);await page.goto('/detail/compound');await page.getByTestId('compound-plan-1').getByRole('button').click();await page.getByRole('button',{name:'목표 추가',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByLabel('목표명',{exact:true})).toBeFocused();await expect(page.getByLabel('시작 연도',{exact:true})).toHaveAttribute('readonly','');
 await page.getByLabel('목표명',{exact:true}).fill('새 목표');await page.getByLabel('목표명',{exact:true}).press('Enter');await expect(page.getByLabel('연 수익률',{exact:true})).toBeFocused();await page.getByLabel('연 수익률',{exact:true}).fill('15');f.saveFail(true);await page.getByLabel('연 수익률',{exact:true}).press('Enter');await expect(page.getByRole('alert')).toContainText('저장 실패');await expect(page.getByLabel('목표명',{exact:true})).toHaveValue('새 목표');
 f.saveFail(false);await page.getByRole('button',{name:'재시도 · 저장'}).click();await expect(page.getByTestId('compound-goal-3')).toContainText('새 목표');expect(f.writes.at(-1)?.body).toEqual({goalName:'새 목표',annualTargetRate:'15',displayColor:'#5EA1F0'});
});
test('tablet empty once, first plan modal, inclusive duration and period validation',async({page})=>{
 await page.setViewportSize({width:725,height:396});await fixture(page,true);await page.goto('/detail/compound');await expect(page.getByTestId('compound-empty')).toHaveCount(1);await expect(page.locator('[data-scroll-region]')).toHaveCount(0);
 await page.getByRole('button',{name:'첫 계획 추가'}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(page.getByLabel('계획명',{exact:true})).toBeFocused();
 await page.getByLabel('시작 연도',{exact:true}).fill('2026');await page.getByLabel('종료 연도',{exact:true}).fill('2025');await dialog.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('alert')).toContainText('시작 연도');await page.getByLabel('종료 연도',{exact:true}).fill('2027');await expect(page.getByTestId('compound-duration')).toHaveText('2년');await dialog.getByRole('button',{name:'취소'}).click();await expect(page.getByTestId('compound-empty')).toHaveCount(1);
});
test('tablet independent columns, modal cancel preserves list position and no-goal right empty',async({page})=>{
 await page.setViewportSize({width:725,height:396});await fixture(page,false,true);await page.goto('/detail/compound');await expect(page.getByTestId('compound-plan-1')).toBeVisible();await expect(page.getByTestId('compound-empty')).toHaveCount(1);
 const left=page.locator('[data-scroll-region="compound-left"]'),right=page.locator('[data-scroll-region="compound-right"]');
 await left.evaluate(el=>el.scrollTop=250);expect(await right.evaluate(el=>el.scrollTop)).toBe(0);const before=await left.evaluate(el=>el.scrollTop);
 await right.getByRole('button',{name:'목표 추가',exact:true}).last().click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'팝업 닫기'}).click();expect(await left.evaluate(el=>el.scrollTop)).toBe(before);
});
test('refresh failure preserves contents and timestamp; account switch hides old account and ignores late response',async({page})=>{
 const f=await fixture(page);await page.goto('/detail/compound');await expect(page.getByTestId('compound-plan-1')).toBeVisible();f.saveFail(true);
 await page.getByTestId('compound-plan-1').getByRole('button').click();await page.getByRole('button',{name:'계획 삭제',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true}).click();await expect(page.getByRole('alert')).toContainText('기존 내용을 유지');await page.getByRole('button',{name:'취소',exact:true}).click();
 f.saveFail(false);f.fail(true);await page.getByRole('button',{name:'안정형 기본 목표로 변경'}).click();await page.getByRole('button',{name:'변경',exact:true}).click();await expect(page.getByRole('alert')).toContainText('조회 실패');await expect(page.getByTestId('compound-goal-1')).toContainText('기준형 · 기본');f.fail(false);await page.getByRole('button',{name:'재시도',exact:true}).click();await expect(page.getByTestId('compound-goal-2')).toContainText('안정형 · 기본');
 f.hold('2');await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});await expect(page.getByTestId('compound-plan-1')).toHaveCount(0);
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','1');window.dispatchEvent(new Event('roxstock-selected-account'));});await expect(page.getByTestId('compound-goal-1')).toBeVisible();f.release();await expect(page.getByTestId('compound-goal-1')).toBeVisible();
});

test('tablet input popup closing restores both column positions and selected plan',async({page})=>{
 await page.setViewportSize({width:725,height:396});await fixture(page);await page.goto('/detail/compound');await expect(page.getByTestId('compound-goal-1')).toBeVisible();
 const left=page.locator('[data-scroll-region="compound-left"]'),right=page.locator('[data-scroll-region="compound-right"]');
 await left.evaluate(el=>el.scrollTop=250);await right.evaluate(el=>el.scrollTop=80);const beforeLeft=await left.evaluate(el=>el.scrollTop),beforeRight=await right.evaluate(el=>el.scrollTop);
 await page.getByRole('button',{name:'계획 추가',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'팝업 닫기',exact:true}).click();
 expect(await left.evaluate(el=>el.scrollTop)).toBe(beforeLeft);expect(await right.evaluate(el=>el.scrollTop)).toBe(beforeRight);await expect(page.getByTestId('compound-plan-1').getByRole('button')).toHaveAttribute('aria-pressed','true');
});
