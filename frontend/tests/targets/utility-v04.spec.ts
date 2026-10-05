import {expect,test,type Page} from '@playwright/test';
const features = ['security-master','realtime-prices','market-prices','account-snapshots','dart-financial-statements'].map((id,i)=>({
 id,name:['종목 마스터','실시간 주가','전체 종목 주가','일별 계좌 스냅샷','DART 재무제표'][i],status:['DELAYED','OK','NOT_IMPLEMENTED','WAITING','NO_FILING'][i],
 schedule:'실제 API 일정',lastAttemptAt:'2026-10-05T00:10:00Z',lastSuccessAt:'2026-10-05T00:08:00Z',nextAt:'2026-10-05T01:00:00Z',
 recent:{target:2485,processed:2485,success:2482,failed:1,skipped:2}
}));
async function fixture(page:Page,{empty=false,goalsEmpty=false}={}){
 let fail=false,reset=false,version=1;
 let conditions=[{days:7,rate:'5'},{days:30,rate:'10'},{days:90,rate:'15'},{days:180,rate:'20'},{days:365,rate:'30'}];
 const writes:{path:string;body:any}[]=[];
 const goal={id:'1',goalName:'기준형',isDefault:true,annualTargetRate:'15',displayColor:'#FFC21A',yearTarget:'93600000',finalTarget:'263600000',progress:'27.3',rows:[{year:2025,asset:'93600000',contributed:'84000000'},{year:2026,asset:'127640000',contributed:'104000000'}]};
 const plans=empty?[]:Array.from({length:8},(_,i)=>({id:String(i+1),planName:'계획'+(i+1),startYear:2025,endYear:2029,duration:5,initialAssetValue:'64000000',annualContributionAmount:'20000000',status:'ACTIVE',goals:goalsEmpty?[]:[goal]}));
 let account={id:'1',name:'기본 계좌',brokerName:'증권사',accountNumber:'1234',isActive:true,isDefault:true,cashBalance:'203200000',updatedAt:'2026-10-05T00:00:00Z'};
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()!=='GET'){
   const body=req.postDataJSON();writes.push({path,body});
   if(fail)return route.fulfill({status:503,json:{error:{code:'TEST_FAILURE',message:'테스트 저장 실패'}}});
   if(path.endsWith('/target-arrival-conditions')){conditions=body.conditions;version++;return route.fulfill({json:{data:{accountId:'1',conditions,version}}});}
   if(path.endsWith('/cash-balance')) account.cashBalance=body.amount;
   if(path.endsWith('/reset')){reset=true;account.cashBalance='0';return route.fulfill({json:{data:{accountId:'1',cashBalance:'0'}}});}
   return route.fulfill({json:{data:{id:'1',...account}}});
  }
  if(path==='/api/accounts')return route.fulfill({json:{data:[account]}});
  if(path==='/api/collection/monitoring')return route.fulfill({json:{data:{generatedAt:'2026-10-05T00:12:00Z',features}}});
  if(path.startsWith('/api/collection/monitoring/'))return route.fulfill({json:{data:{runs:[{id:'1',status:'PARTIAL',startedAt:'2026-10-05T00:10:00Z',target:2485,success:2482,failed:1,skipped:2}],items:Array.from({length:24},(_,i)=>({symbol:String(i),status:i?'SUCCESS':'FAILED',reason:i?'성공 · 변경 없음':'실제 실패 · 응답 시간 초과'})),dart:{backfill:{planned:4,byStatus:{SUCCESS:3,PENDING:1}}}}}});
  if(path==='/api/collection/status')return route.fulfill({json:{data:{latestRun:{status:'SUCCESS'},manualRunAvailable:false,settingsAvailable:false}}});
  if(path.endsWith('/target-arrival-conditions'))return route.fulfill({json:{data:{accountId:'1',conditions,version}}});
  if(path.includes('/compound-plans'))return route.fulfill({json:{data:{accountId:'1',currentAssets:'72000000',pricingComplete:true,currentYear:2026,asOf:'2026-10-05T00:00:00Z',plans}}});
  if(reset&&path.endsWith('/dashboard'))return route.fulfill({json:{data:{cashBalance:'0',holdings:[]}}});
  if(reset&&path.endsWith('/holdings'))return route.fulfill({json:{data:[]}});
  if(reset&&path.endsWith('/cash-overview'))return route.fulfill({json:{data:{account:{currentBalance:'0'},recentTransactions:[]}}});
  if(reset&&path.endsWith('/asset-history'))return route.fulfill({json:{data:[],summary:{returnRate:null}}});
  return route.fulfill({json:{data:[],pagination:{total:0,totalPages:0,page:1}}});
 });
 return {writes,fail:()=>{fail=true;},succeed:()=>{fail=false;}};
}
async function geometry(page:Page){
 await expect(page.locator('header')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const v=await page.evaluate(()=>{const main=document.querySelector('main')!,s=getComputedStyle(main);const nav=[...document.querySelectorAll('.MuiBottomNavigation-root')].find(n=>getComputedStyle(n).display!=='none')!;return {padding:[s.paddingTop,s.paddingLeft,s.paddingRight],header:document.querySelector('header')!.getBoundingClientRect().height,nav:nav.getBoundingClientRect().height,font:[...main.querySelectorAll('p')].filter(n=>n.getClientRects().length).every(n=>parseFloat(getComputedStyle(n).fontSize)>=10)};});
 expect(v.padding).toEqual(['0px','8px','8px']);expect(v.header).toBe(44);expect(v.nav).toBe(44);expect(v.font).toBe(true);
}
async function capture(page:Page,name:string,project:string){if(project==='cover-370'||project==='tablet-725'){await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:'test-results/utility/'+name+'-'+project+'.png'});}}
test('menu order, equal theme widths and fixed geometry',async({page},info)=>{
 await fixture(page);await page.goto('/more');await expect(page.getByRole('heading',{name:'메뉴',exact:true})).toBeVisible();await geometry(page);
 const menu=page.getByTestId('more-menu');await expect(menu.getByRole('button')).toHaveText(['홈','종목목록','매매일지','예수금','자산분석','투자금','투자손익','가치분석','재무제표','복리계획','모니터링','설정']);
 const rects=await menu.locator('button').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().toJSON()));for(const r of rects)expect(r.height).toBeCloseTo(rects[0].height,1);
 if(info.project.name.startsWith('tablet')){
  const panel=page.getByTestId('more-settings-panel'),buttons=page.getByTestId('theme-buttons').getByRole('button');const p=await panel.boundingBox(),m=await menu.boundingBox();expect(p!.x-m!.x-m!.width).toBeCloseTo(8,1);
  const b=await buttons.evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().toJSON()));for(const r of b)expect(r.width).toBeCloseTo(b[0].width,1);expect(b[1].left-b[0].right).toBeCloseTo(8,1);expect(b[0].left-p!.x).toBeCloseTo(14,1);expect(p!.x+p!.width-b[2].right).toBeCloseTo(14,1);
  await buttons.nth(1).click();await expect(buttons.nth(1)).toHaveAttribute('aria-pressed','true');
 }
 await expect.poll(()=>menu.locator('img').evaluateAll(ns=>ns.every(n=>(n as HTMLImageElement).naturalWidth===20))).toBe(true);
 await capture(page,'menu',info.project.name);
});
test('monitoring selection resets detail only, states and failed refresh preserve results',async({page},info)=>{
 await fixture(page);await page.goto('/detail/collection-monitoring');await expect(page.getByRole('link',{name:'종목 마스터 상세 보기'})).toBeVisible();await geometry(page);
 if(info.project.name.startsWith('tablet')){
  const left=page.locator('[data-scroll-region="monitoring-list"]'),right=page.locator('[data-scroll-region="monitoring-detail"]');
  await expect(page.getByRole('link',{name:'종목 마스터 상세 보기'})).toHaveAttribute('aria-current','true');await expect(right).toContainText('실제 실패');
  await left.evaluate(n=>n.scrollTop=25);await right.evaluate(n=>n.scrollTop=80);const top=await left.evaluate(n=>n.scrollTop);
  await page.getByRole('link',{name:'전체 종목 주가 상세 보기'}).dispatchEvent('click');await expect(page.getByRole('link',{name:'전체 종목 주가 상세 보기'})).toHaveAttribute('aria-current','true');
  await expect.poll(()=>right.evaluate(n=>n.scrollTop)).toBe(0);expect(await left.evaluate(n=>n.scrollTop)).toBe(top);expect(await page.locator('main').evaluate(n=>n.scrollTop)).toBe(0);
 }else{
  await page.getByRole('link',{name:'종목 마스터 상세 보기'}).click();await expect(page.getByRole('heading',{name:'종목 마스터'})).toBeVisible();await expect(page.locator('main')).toContainText('실제 실패');
 }
 await page.route('**/api/collection/monitoring/**',route=>route.fulfill({status:503,json:{error:{message:'갱신 실패'}}}));
 await page.getByRole('button',{name:'통계 새로고침'}).last().click();await expect(page.locator('main')).toContainText('실제 실패');
 await capture(page,'monitoring',info.project.name);
});
test('settings menu, small form, left title and Enter failure retention',async({page},info)=>{
 const f=await fixture(page);await page.goto('/detail/settings?view=settings');await geometry(page);await capture(page,'settings',info.project.name);
 if(info.project.name.startsWith('tablet')){
  const a=await page.getByTestId('settings-menu').boundingBox(),b=await page.getByTestId('settings-detail').boundingBox();expect(b!.x-a!.x-a!.width).toBeCloseTo(8,1);
 }
 await page.goto('/detail/settings?view=edit');const field=page.getByRole('textbox',{name:'계좌명',exact:true});await expect(field).toBeFocused();await expect.poll(()=>field.evaluate(n=>[(n as HTMLInputElement).selectionStart,(n as HTMLInputElement).selectionEnd])).toEqual([0,5]);
 const heights=await page.getByRole('textbox').evaluateAll(ns=>ns.map(n=>n.closest('.MuiInputBase-root')!.parentElement!.getBoundingClientRect().height));expect(heights).toEqual([36,36,36]);
 const title=await page.getByRole('heading').boundingBox();expect(title!.x).toBe(36);
 await field.fill('변경 계좌');await field.press('Enter');await expect(page.getByRole('textbox',{name:'증권사',exact:true})).toBeFocused();f.fail();
 await page.getByRole('textbox',{name:'계좌번호',exact:true}).press('Enter');await expect(page.getByRole('alert')).toContainText('테스트 저장 실패');await expect(field).toHaveValue('변경 계좌');
 await capture(page,'settings-input',info.project.name);
});
test('target limit, duplicate validation, delete draft and save failure retry',async({page})=>{
 const f=await fixture(page);await page.goto('/detail/settings?view=target-arrival');await expect(page.getByRole('button',{name:'조건 추가',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'삭제',exact:true}).first().click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'삭제',exact:true}).click();expect(f.writes).toHaveLength(0);
 await page.getByRole('button',{name:'조건 추가',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);const days=page.getByRole('textbox',{name:'보유기간 상한',exact:true}),rate=page.getByRole('textbox',{name:'목표수익률',exact:true});await days.fill('30');await days.press('Enter');await rate.fill('12');await expect(page.getByRole('button',{name:'등록',exact:true})).toBeDisabled();await days.fill('120');await rate.press('Enter');
 f.fail();await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('alert')).toContainText('테스트 저장 실패');f.succeed();await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('저장했습니다. 홈 목록을 갱신했습니다.')).toBeVisible();
 expect(f.writes.at(-1)?.body.conditions.map((c:any)=>c.days)).toEqual([30,90,120,180,365]);
});
test('reset confirmation, failure retry and duplicate guards',async({page})=>{
 const f=await fixture(page);await page.goto('/detail/settings?view=reset');const input=page.getByRole('textbox',{name:'계좌명 입력'});await input.fill('틀린 이름');await expect(page.getByRole('button',{name:'계좌 데이터 초기화',exact:true})).toBeDisabled();await input.fill('기본 계좌');await input.press('Enter');expect(f.writes).toHaveLength(0);f.fail();
 await page.getByRole('dialog').getByRole('button',{name:'초기화',exact:true}).click();await expect(page.getByTestId('reset-result')).toContainText('테스트 저장 실패');expect(f.writes).toHaveLength(1);
 await page.getByRole('button',{name:'다시 시도',exact:true}).click();await expect.poll(()=>f.writes.length).toBe(2);await expect(page.getByTestId('reset-result')).toBeVisible();f.succeed();await page.getByRole('button',{name:'다시 시도',exact:true}).click();await expect(page.getByTestId('reset-result')).toContainText('초기화가 완료되었습니다');await expect(page.getByTestId('reset-result')).toContainText('0원');expect(f.writes.filter(w=>w.path.endsWith('/reset'))).toHaveLength(3);
});
test('compound empty once, inherited goal form, title alignment and unchanged calculation basis',async({page},info)=>{
 await fixture(page);await page.goto('/detail/compound?plan=1&goal=1&view=goal');await geometry(page);await expect(page.locator('main')).toContainText('연초 추가금 반영');
 await capture(page,'compound',info.project.name);
 await page.goto('/detail/compound?plan=1&form=goal-add');await expect(page.getByLabel('목표명',{exact:true})).toBeFocused();
 if(!info.project.name.startsWith('tablet')){const h=await page.getByRole('heading').boundingBox();expect(h!.x).toBe(36);}else await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByLabel('시작 연도',{exact:true})).toHaveAttribute('readonly','');
 await fixture(page,{empty:true});await page.goto('/detail/compound');await expect(page.getByText('내용이 없습니다.',{exact:true})).toHaveCount(1);await expect(page.getByTestId('compound-empty').getByRole('button')).toHaveCount(0);await expect(page.getByRole('button',{name:'계획 추가',exact:true})).toBeVisible();
});
