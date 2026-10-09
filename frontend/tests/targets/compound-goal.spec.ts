import {expect,test,type Page} from '@playwright/test';
import {fixture as stockFixture} from './stock-input-fixture';
const rows=[2023,2024,2025,2026,2027].map((year,i)=>({year,asset:String(100+i*10),contributed:String(80+i*5),realizedAsset:year===2023?'100':year===2024?'0':null}));
const goal={id:'g1',goalName:'기본 목표',annualTargetRate:'10',displayColor:'#5EA1F0',isDefault:true,isVisible:true,rows,yearTarget:'130',finalTarget:'140',progress:'83.57'};
const plan={id:'p1',planName:'실제 계좌의 아주 긴 복리계획 이름 · 장기 자산 형성 계획',startYear:2023,endYear:2027,duration:5,initialAssetValue:'80',annualContributionAmount:'5',goals:[goal],status:'ACTIVE'};
async function setup(page:Page){
 await stockFixture(page);
 let assets:string|null='117',fail=false,empty=false,noDefault=false,year=2026,hold:string|null=null,target:string|null|undefined=undefined;
 const releases:(()=>void)[]=[],reads:string[]=[];
 await page.route('**/api/accounts',route=>route.fulfill({json:{data:[{id:'a',name:'계좌 A',isActive:true,isDefault:true},{id:'b',name:'계좌 B',isActive:true}]}}));
 await page.route('**/api/accounts/*/compound-plans',async route=>{
  const id=new URL(route.request().url()).pathname.split('/')[3];reads.push(id);
  if(id===hold)await new Promise<void>(resolve=>releases.push(resolve));
  if(fail)return route.fulfill({status:503,json:{error:{message:'조회 실패 검사'}}});
  return route.fulfill({json:{data:{accountId:id,currentAssets:id==='b'?'999':assets,currentYear:year,pricingComplete:assets!==null,asOf:'2026-10-09T00:00:00Z',plans:empty?[]:[{...plan,id:id==='b'?'p2':'p1',goals:[{...goal,isDefault:!noDefault,yearTarget:target===undefined?(year===2026?'130':'140'):target,progress:assets==null?null:String(Number(assets)/140*100)}]}]}}});
 });
 await page.route('**/api/accounts/*/asset-history**',route=>route.fulfill({json:{data:[],summary:{},compoundPlan:empty?null:{id:'p1'}}}));
 return {reads,assets:(value:string|null)=>assets=value,target:(value:string|null)=>target=value,fail:(value:boolean)=>fail=value,empty:(value=true)=>empty=value,noDefault:()=>noDefault=true,year:(value:number)=>year=value,hold:(id:string)=>hold=id,release:()=>{hold=null;releases.splice(0).forEach(f=>f());}};
}
for(const width of [370,725,1280])test('summary direct navigation, restore, popup history and chart '+width,async({page})=>{
 await page.setViewportSize({width,height:width===370?465:width===725?396:800});await setup(page);await page.goto('/assets');
 await page.getByRole('button',{name:'3개월',exact:true}).click();const summary=page.getByTestId('analysis-compound-summary');await expect(summary).toContainText(plan.planName);await expect(summary.getByTestId('compound-summary-current')).toHaveText('117원');await expect(summary.getByTestId('compound-summary-current')).toHaveCSS('color','rgb(251, 191, 36)');await expect(summary.getByTestId('compound-summary-year')).toHaveCSS('color','rgb(248, 250, 252)');
 await summary.scrollIntoViewIfNeeded();const region=width<600?page.locator('main'):page.locator('[data-scroll-region="analysis-right"]'),top=await region.evaluate(el=>el.scrollTop);
 await page.screenshot({path:`test-results/compound-goal/analysis-${width}.png`});
 await summary.click();await expect(page).toHaveURL(/view=goal.*plan=p1.*goal=g1/);await expect(page.getByTestId('compound-goal-summary')).toContainText('117원');await expect(page.getByText('2023 ~ 2027',{exact:true})).toBeVisible();await expect(page.getByText('5년',{exact:true})).toBeVisible();
 await page.screenshot({path:`test-results/compound-goal/summary-${width}.png`});
 for(let i=0;i<3;i++){
  const edit=page.getByRole('button',{name:'목표 수정',exact:true});await edit.scrollIntoViewIfNeeded();const goalRegion=width<600?page.locator('main'):page.locator('[data-scroll-region="compound-right"]'),goalTop=await goalRegion.evaluate(el=>el.scrollTop);await edit.click();await expect(page.getByLabel('목표명',{exact:true})).toBeVisible();
  if(i===0){await page.screenshot({path:`test-results/compound-goal/input-${width}.png`});await page.goBack();}else if(width>=600)await page.getByRole('button',{name:'팝업 닫기',exact:true}).click();else await page.getByRole('button',{name:'취소',exact:true}).click();
  await expect(page).not.toHaveURL(/form=/);await expect(page).toHaveURL(/view=goal/);await expect(page.getByTestId('compound-goal-summary')).toContainText(plan.planName);await expect.poll(()=>goalRegion.evaluate(el=>el.scrollTop)).toBe(goalTop);
 }
 const chart=page.getByRole('img',{name:'연도별 예상 자산과 누적 투입금 · 원'});await chart.scrollIntoViewIfNeeded();await expect(chart).toHaveCSS('touch-action','pan-y');await chart.hover();await expect(page.getByRole('tooltip')).toBeVisible();await expect(page.getByTestId('compound-realized-line')).toHaveAttribute('stroke','#F87171');
 const path=await page.getByTestId('compound-realized-line').getAttribute('d');expect(path?.match(/M/g)).toHaveLength(2);expect(path?.match(/L/g)).toHaveLength(1);
 await page.getByRole('button',{name:'2024년 자산 조회'}).focus();await expect(page.getByRole('tooltip')).toContainText('실현금액0원');await page.keyboard.press('ArrowRight');await expect(page.getByRole('tooltip')).toContainText('2025년');await expect(page.getByRole('tooltip')).toContainText('데이터 없음');await page.keyboard.press('End');await expect(page.getByRole('tooltip')).toContainText('2027년');
 const tooltip=(await page.getByRole('tooltip').boundingBox())!;expect(tooltip.x).toBeGreaterThanOrEqual(0);expect(tooltip.x+tooltip.width).toBeLessThanOrEqual(width);
 await page.keyboard.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);await page.getByRole('button',{name:'2026년 자산 조회'}).tap();await expect(page.getByRole('tooltip')).toContainText('실현금액117원');await expect(page.getByTestId('compound-year-2026').getByRole('cell').nth(1)).toHaveText('117원');
 await page.screenshot({path:`test-results/compound-goal/chart-${width}.png`});
 await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page).toHaveURL(/\/assets$/);await expect(page.getByRole('button',{name:'3개월',exact:true})).toHaveAttribute('aria-pressed','true');await expect.poll(()=>region.evaluate(el=>el.scrollTop)).toBe(top);
});
test('missing plan/default/error has no arbitrary navigation',async({page})=>{
 const f=await setup(page);f.empty();await page.goto('/assets');await expect(page.getByTestId('analysis-compound')).toContainText('현재년도의 복리계획이 없습니다.');expect(await page.getByTestId('analysis-compound').getByRole('button').count()).toBe(0);
 f.empty(false);await page.goto('/detail/compound?view=goal&plan=unknown&goal=g1');await expect(page.getByText('해당 계획을 찾을 수 없습니다.')).toBeVisible();
 f.empty(false);f.noDefault();await page.goto('/assets');await expect(page.getByTestId('analysis-compound')).toContainText('기본 목표가 없습니다.');
 f.fail(true);await page.goto('/assets');await expect(page.getByTestId('analysis-compound')).toContainText('조회에 실패');await page.getByTestId('analysis-compound').click();await expect(page).toHaveURL(/\/assets$/);
});
test('polling refresh retains summary, zero and unavailable, isolates late accounts',async({page})=>{
 await page.clock.install({time:new Date('2026-10-09T00:00:00Z')});const f=await setup(page);await page.goto('/detail/compound?view=goal&plan=p1&goal=g1');await expect(page.getByTestId('compound-summary-current')).toHaveText('117원');
 f.assets('0');await page.clock.fastForward(60_100);await expect(page.getByTestId('compound-summary-current')).toHaveText('0원');await expect(page.getByTestId('compound-summary-current')).toHaveCSS('color','rgb(96, 165, 250)');await expect(page.getByTestId('compound-year-2026').getByRole('cell').nth(1)).toHaveText('0원');
 f.hold('a');f.assets(null);await page.clock.fastForward(60_100);await expect(page.getByTestId('compound-summary-current')).toHaveText('0원');f.release();await expect(page.getByTestId('compound-summary-current')).toHaveText('—');await expect(page.getByTestId('compound-summary-current')).toHaveCSS('color','rgb(248, 250, 252)');await expect(page.getByRole('meter',{name:'목표 진행률'})).not.toHaveAttribute('aria-valuenow');
 f.hold('b');await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','b');window.dispatchEvent(new Event('roxstock-selected-account'));});await expect(page.getByTestId('compound-goal-summary')).toHaveCount(0);
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','a');window.dispatchEvent(new Event('roxstock-selected-account'));});await expect(page.getByTestId('compound-summary-current')).toHaveText('—');f.release();await expect(page.getByTestId('compound-summary-current')).toHaveText('—');
});
test('Seoul year crossing refetches historical/current classification',async({page})=>{
 await page.clock.install({time:new Date('2026-12-31T14:59:40Z')});const f=await setup(page);await page.goto('/detail/compound?view=goal&plan=p1&goal=g1');await expect(page.getByTestId('compound-year-2026').getByRole('cell').nth(1)).toHaveText('117원');
 f.year(2027);f.assets('140');await page.clock.setSystemTime(new Date('2026-12-31T14:59:59Z'));await page.clock.fastForward(2000);await expect(page.getByTestId('compound-year-2027').getByRole('cell').nth(1)).toHaveText('140원');await expect(page.getByTestId('compound-year-2026').getByRole('cell').nth(1)).toHaveText('—');expect(f.reads.length).toBeGreaterThan(1);
});

test('manual price save invalidates cached compound assets and final progress on return',async({page})=>{
 const f=await setup(page);await page.goto('/detail/compound?view=goal&plan=p1&goal=g1');await expect(page.getByTestId('compound-summary-current')).toHaveText('117원');
 // Client-side navigation keeps the query cache, unlike page.goto.
 await page.locator('.MuiBottomNavigation-root').getByRole('button',{name:'종목목록',exact:true}).click();
 await page.getByRole('button',{name:'현대자동차 상세보기',exact:true}).click();await page.getByRole('button',{name:/65,000원/}).last().click();
 f.assets('140');await page.getByTestId('stock-price-form').getByRole('textbox',{name:'금액',exact:true}).fill('520000');await page.getByRole('button',{name:'변경',exact:true}).click();
 await expect(page.getByTestId('stock-price-form')).toHaveCount(0);await expect(page).toHaveURL(/stocks\/1(?:\?|$)/);await page.goBack();await expect(page).toHaveURL(/stocks(?:\?|$)/);await page.goBack();await expect(page).toHaveURL(/detail\/compound/);await expect(page.getByTestId('compound-summary-current')).toHaveText('140원');await expect(page.getByRole('meter',{name:'목표 진행률'})).toHaveAttribute('aria-valuenow','100');await expect(page.getByTestId('compound-summary-current')).toHaveCSS('color','rgb(248, 113, 113)');
});

test('cash edit refreshes the inactive compound cache without changing its source policy',async({page})=>{
 const f=await setup(page),entry={id:'c1',transactionType:'DEPOSIT',createdAt:'2026-10-09T03:00:00Z',transactionDate:'2026-10-09T03:00:00Z',amount:'117',feeTaxAmount:'0',balanceAfter:'117',signedAmount:'117',memo:'격리 모의 계좌'};
 await page.route('**/api/accounts/a/cash-overview',route=>route.fulfill({json:{data:{account:{id:'a',name:'계좌 A',currentBalance:'117',balanceStatus:'AVAILABLE',updatedAt:'2026-10-09T03:00:00Z'},currentYearTax:{year:2026,amount:'0'},monthly:{deposit:'117',withdrawal:'0',dividend:'0'},yearly:{deposit:'117',withdrawal:'0',dividend:'0'},recentTransactions:[entry]}}}));
 await page.route('**/api/accounts/a/cash-transactions**',route=>route.fulfill({json:{data:[entry],meta:{total:1,limit:100,offset:0}}}));
 await page.goto('/detail/compound?view=goal&plan=p1&goal=g1');await expect(page.getByTestId('compound-summary-current')).toHaveText('117원');
 await page.locator('.MuiBottomNavigation-root').getByRole('button',{name:'예수금',exact:true}).click();await page.getByTestId('cash-balance').click();await page.getByLabel('세후예수금',{exact:true}).fill('130');f.assets('130');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByTestId('cash-form')).not.toBeVisible();await page.goBack();await expect(page.getByTestId('compound-summary-current')).toHaveText('130원');await expect(page.getByTestId('compound-summary-current')).toHaveCSS('color','rgb(251, 191, 36)');await expect(page.getByTestId('compound-year-2026').getByRole('cell').nth(1)).toHaveText('130원');
});
test('trade edit refreshes compound progress and current-year assets on return',async({page})=>{
 const f=await setup(page);await page.goto('/detail/compound?view=goal&plan=p1&goal=g1');await expect(page.getByTestId('compound-summary-current')).toHaveText('117원');
 await page.locator('.MuiBottomNavigation-root').getByRole('button',{name:'종목목록',exact:true}).click();await page.getByRole('button',{name:'현대자동차 상세보기',exact:true}).click();await page.getByRole('button',{name:'lot1 매수 수정'}).click();await expect(page.getByTestId('trade-form')).toBeVisible();f.assets('140');await page.getByRole('textbox',{name:'매수가격',exact:true}).fill('240000');await page.getByRole('button',{name:'변경',exact:true}).click();await expect(page.getByTestId('trade-form')).toHaveCount(0);
 await page.goBack();await expect(page).toHaveURL(/stocks(?:\?|$)/);await page.goBack();await expect(page.getByTestId('compound-summary-current')).toHaveText('140원');await expect(page.getByRole('meter',{name:'목표 진행률'})).toHaveAttribute('aria-valuenow','100');await expect(page.getByTestId('compound-year-2026').getByRole('cell').nth(1)).toHaveText('140원');
});

test('summary preserves unrounded thresholds, unavailable targets and long money layout',async({page})=>{
 await page.clock.install({time:new Date('2026-10-09T00:00:00Z')});const f=await setup(page);await page.goto('/detail/compound?view=goal&plan=p1&goal=g1');await expect(page.getByTestId('compound-summary-current')).toHaveText('117원');
 for(const [value,color] of [['116.999999','rgb(96, 165, 250)'],['117','rgb(251, 191, 36)'],['130','rgb(251, 191, 36)'],['130.000001','rgb(248, 113, 113)']] as const){f.assets(value);await page.clock.fastForward(60_100);await expect(page.getByTestId('compound-summary-current')).toHaveCSS('color',color);await expect(page.getByTestId('compound-summary-year')).toHaveCSS('color','rgb(248, 250, 252)');}
 for(const target of ['0','-1',null]){f.target(target);await page.clock.fastForward(60_100);await expect(page.getByTestId('compound-summary-current')).toHaveCSS('color','rgb(248, 250, 252)');}
 f.target('130');f.assets('123456789012345678.01');await page.clock.fastForward(60_100);await expect(page.getByTestId('compound-summary-current')).toContainText('123,456,789,012,345,680원');const box=(await page.getByTestId('compound-summary-current').boundingBox())!;expect(box.x+box.width).toBeLessThanOrEqual(370);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(370);
});

test('back during a late save does not consume the goal entry twice',async({page})=>{
 await page.setViewportSize({width:725,height:396});await setup(page);await page.goto('/detail/compound?view=goal&plan=p1&goal=g1');await page.getByRole('button',{name:'목표 수정',exact:true}).click();let release:()=>void=()=>{};
 await page.route('**/api/accounts/a/compound-plans/p1/goals/g1',async route=>{await new Promise<void>(resolve=>release=resolve);await route.fulfill({json:{data:{id:'g1'}}});});
 await page.getByLabel('목표명',{exact:true}).fill('저장 중 목표');const request=page.waitForRequest(request=>request.method()==='PUT');await page.getByRole('button',{name:'저장',exact:true}).click();await request;await page.goBack();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(/view=goal/);release();await expect(page.getByRole('button',{name:'목표 수정',exact:true})).toBeEnabled();await expect(page).toHaveURL(/view=goal/);
});

test('malformed or mismatched account responses show an error without breaking analysis',async({page})=>{
 await setup(page);await page.route('**/api/accounts/a/compound-plans',route=>route.fulfill({json:{data:[]}}));await page.goto('/assets');await expect(page.getByTestId('analysis-compound')).toContainText('조회에 실패');await page.getByRole('button',{name:'3개월',exact:true}).click();await expect(page.getByRole('button',{name:'3개월',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.route('**/api/accounts/a/compound-plans',route=>route.fulfill({json:{data:{accountId:'b',currentAssets:'999',currentYear:2026,plans:[plan]}}}));await page.getByRole('button',{name:'복리계획 다시 시도'}).click();await expect(page.getByTestId('analysis-compound-summary')).toHaveCount(0);await expect(page.getByTestId('analysis-compound')).toContainText('조회에 실패');
});
