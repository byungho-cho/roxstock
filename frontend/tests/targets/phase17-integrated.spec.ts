import {test,expect,type Page} from '@playwright/test';
import {setup as financialFixture} from './financial-ui-fixture';
import {fixture as stockFixture} from './stock-input-fixture';
const overflow=async(page:Page)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
for(const mode of ['annual','quarter'])test(`common dismiss: all financial ${mode} cards and fullscreen tooltip`,async({page},info)=>{
 await financialFixture(page,{allMetrics:true});await page.goto(`/detail/value?view=chart&selected=1&mode=${mode}`);
 for(const title of ['수익성','가치지표','안정성','성장성']){
  const card=page.getByTestId('value-chart-'+title),svg=card.getByRole('img');await svg.scrollIntoViewIfNeeded();const b=await svg.boundingBox();
  await page.mouse.click(b!.x+40,b!.y+32);await expect(card.getByTestId('financial-drag-guide')).toHaveAttribute('stroke','#FBBF24');await expect(card.getByTestId('financial-chart-tooltip')).toHaveCount(0);await expect(card.locator('[data-period-value][data-selected=true]')).not.toHaveCount(0);
  await page.mouse.move(b!.x+40,b!.y+32);await page.mouse.down();await page.mouse.move(b!.x+b!.width-42,b!.y+32,{steps:4});await page.mouse.up();
  await expect(card.locator('[data-period-value][data-selected=true]').first()).toHaveCSS('color','rgb(251, 191, 36)');
  await card.locator('[data-period-value]').first().click();await expect(card.getByTestId('financial-drag-guide')).toHaveCount(0);await expect(card.locator('[data-selected=true]')).toHaveCount(0);
 }
 const open=page.getByRole('button',{name:'상세보기',exact:true}).first();await open.click();const dialog=page.getByRole('dialog',{name:'재무지표 차트 상세보기'}),svg=dialog.getByRole('img');const b=await svg.boundingBox();await page.mouse.click(b!.x+45,b!.y+40);
 const tooltip=dialog.getByTestId('financial-chart-tooltip');await expect(tooltip).toBeVisible();await tooltip.click();await expect(tooltip).toBeVisible();await page.screenshot({path:info.outputPath('phase17-financial-'+mode+'.png')});
 await dialog.getByRole('button',{name:'차트 상세보기 뒤로가기'}).tap();await expect(dialog).toBeHidden();await expect(page.getByTestId('financial-chart-tooltip')).toHaveCount(0);await overflow(page);
});
for(const refreshMode of ['SUPPLEMENT','FULL'])test(`manual ${refreshMode}: independent progress, partial result, retry and reload`,async({page},info)=>{
 const state=await financialFixture(page,{allMetrics:true});let finished=false;
 const status=()=>({requestId:'99',state:finished?'FINISHED':'PROCESSING',status:finished?'PARTIAL':'RUNNING',startYear:2024,endYear:2026,fiscalYear:2024,period:'ANNUAL',finishedAt:finished?'2026-10-10T10:00:00Z':null,progress:{currentYear:2025,currentPeriod:'ANNUAL',stage:'VALUATION',completed:0,total:3,tasks:{dart:{state:refreshMode==='SUPPLEMENT'?'SKIPPED':'FAILED',code:'DART_TIMEOUT'},valuation:{state:finished?'SUCCESS':'RUNNING'}}},results:finished?[{fiscalYear:2025,period:'ANNUAL',status:'FAILED',valuationStatus:'SUCCESS',tasks:{dart:{state:refreshMode==='SUPPLEMENT'?'SKIPPED':'FAILED'},valuation:{state:'SUCCESS'}}}]:[],counts:finished?{processed:1,disclosureCompleted:0,valuationCompleted:1,noDisclosure:0,disclosureFailed:refreshMode==='FULL'?1:0,supplementFailed:0}:undefined});
 await page.route('**/api/securities/1/financial-refresh/active',route=>route.fulfill({json:{data:state.posts&&!finished?status():null}}));
 await page.route('**/api/securities/1/financial-refresh/99',route=>route.fulfill({json:{data:status()}}));
 await page.goto('/detail/value?view=chart&selected=1');await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();await page.getByRole('button',{name:/수동 업데이트/}).click();
 const chooser=page.getByRole('dialog').filter({hasText:'갱신 방식을 선택해 주세요.'});await expect(chooser).toBeVisible();expect(state.posts).toBe(0);await page.screenshot({path:info.outputPath('phase17-refresh-choice.png')});await chooser.getByRole('button',{name:refreshMode==='FULL'?'전체 갱신':'보완자료만 수집',exact:true}).tap();
 await expect(page.getByRole('button',{name:/갱신 중/})).toBeDisabled();expect((state.body as any).refreshMode).toBe(refreshMode);expect((state.body as any).period).toBe('ANNUAL');expect((state.body as any).clientRequestId).toMatch(/^[\w-]{16,80}$/);expect(state.posts).toBe(1);
 await page.reload();await page.getByRole('button',{name:'재무제표 갱신',exact:true}).click();await expect(page.getByRole('button',{name:/갱신 중/})).toBeDisabled();expect(state.posts).toBe(1);
 finished=true;await expect(page.getByText('가치지표 보충 완료 1 · 보충 실패/근거 부족 0')).toBeVisible({timeout:12000});await expect(page.getByRole('button',{name:/수동 업데이트/})).toBeEnabled();await page.getByText('상세 내용', {exact:true}).click();await expect(page.getByText(/가치지표 보완 완료/)).toBeVisible();await page.screenshot({path:info.outputPath('phase17-refresh-'+refreshMode+'.png')});await overflow(page);
});
test('compound selection is one line, compact tooltip stays inside, first outside tap navigates',async({page},info)=>{
 await stockFixture(page);
 await page.route('**/api/accounts/*/compound-plans',route=>route.fulfill({json:{data:{accountId:'a',currentAssets:'123456789012345',currentYear:2026,pricingComplete:true,plans:[{id:'p',planName:'계획',startYear:2025,endYear:2029,duration:5,initialAssetValue:'100',annualContributionAmount:'10',status:'ACTIVE',goals:[{id:'g',goalName:'목표',isDefault:true,isVisible:true,displayColor:'#60A5FA',annualTargetRate:'10',yearTarget:'120000000000000',finalTarget:'200000000000000',progress:'61.72',rows:[2025,2026,2027,2028,2029].map(year=>({year,asset:'200000000000000',contributed:'100000000000000',realizedAsset:null}))}]}]}}}));
 await page.goto('/detail/compound?view=goal&plan=p&goal=g');const svg=page.getByRole('img',{name:'연도별 예상 자산과 누적 투입금 · 원'});await svg.scrollIntoViewIfNeeded();const b=await svg.boundingBox();await page.mouse.click(b!.x+b!.width/2,b!.y+70);await expect(page.getByTestId('compound-chart-guide')).toHaveAttribute('stroke','#FBBF24');const tooltip=page.getByRole('tooltip');await expect(tooltip).toBeVisible();await tooltip.tap();await expect(tooltip).toBeVisible();expect(await svg.locator('rect').first().evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('none');const t=await tooltip.boundingBox();expect(t!.x).toBeGreaterThanOrEqual(b!.x-1);expect(t!.x+t!.width).toBeLessThanOrEqual(b!.x+b!.width+1);await page.screenshot({path:info.outputPath('phase17-compound-tooltip.png')});await page.getByRole('navigation',{name:'하단 메뉴'}).getByRole('button',{name:'더보기',exact:true}).tap();await expect(tooltip).toHaveCount(0);await expect(page.getByRole('heading',{name:'더보기'})).toBeVisible();await overflow(page);
});
test('journal date picker synchronizes main calendar and holiday/weekend colors',async({page},info)=>{
 await stockFixture(page);await page.route('**/api/accounts/*/trades**',route=>route.fulfill({json:{data:[],summary:{},daily:[]}}));await page.goto('/journal?date=2026-10-08');
 const input=page.getByLabel('거래현황 선택 날짜',{exact:true}),heading=page.getByRole('button',{name:'거래현황 날짜 선택',exact:true});
 // Native picker is reused; its OS rendering requires a physical-device check.
 for(const [date,color] of [['2026-10-08','rgb(248, 250, 252)'],['2026-10-10','rgb(96, 165, 250)'],['2026-10-04','rgb(248, 113, 113)'],['2026-10-03','rgb(248, 113, 113)']]){
  await input.fill(date);await expect(heading).toContainText(date.replaceAll('-','.'));await expect(heading).toHaveCSS('color',color);await expect(page.getByTestId('journal-calendar-grid').getByRole('button',{name:new RegExp('^'+date)})).toHaveAttribute('aria-pressed','true');
 }
 await heading.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('phase17-journal-date.png')});await overflow(page);
});
test('cash MM/DD columns never shrink or overlap long amounts; chart dismiss preserves actions',async({page},info)=>{
 await stockFixture(page);const rows=Array.from({length:4},(_,i)=>({id:String(i),transactionType:'DEPOSIT',transactionDate:'2026-10-08T23:05:00Z',createdAt:'2026-10-09T03:00:00Z',feeTaxAmount:'123456789',balanceAfter:'123456789012345678',amount:'1000',signedAmount:'1000',memo:null}));
 await page.route('**/api/accounts/*/cash-overview',route=>route.fulfill({json:{data:{account:{id:'a',name:'계좌',currentBalance:'10000',balanceStatus:'AVAILABLE'},monthly:{deposit:'0',withdrawal:'0',dividend:'0'},yearly:{deposit:'0',withdrawal:'0',dividend:'0'},recentTransactions:[],currentYearTax:{amount:'0',year:2026}}}}));
 await page.route('**/api/accounts/*/cash-transactions**',route=>route.fulfill({json:{data:rows,meta:{total:4,offset:0,limit:100}}}));await page.route('**/api/accounts/*/asset-history**',route=>route.fulfill({json:{data:[{date:'2026-10-01',cashBalance:'10000'},{date:'2026-10-08',cashBalance:'12000'}],summary:{}}}));
 await page.goto('/detail/cash');const list=page.getByTestId('cash-history-row');await expect(list).toHaveCount(4);await list.first().scrollIntoViewIfNeeded();
 const geometry=await list.evaluateAll(nodes=>nodes.map(e=>{const children=[...e.children].map(c=>c.getBoundingClientRect());return {top:e.getBoundingClientRect().top,bottom:e.getBoundingClientRect().bottom,width:children[1].width,text:e.children[1].textContent,overlap:children.some((c,i)=>i>0&&c.left<children[i-1].right-1),font:getComputedStyle(e).fontVariantNumeric};}));
 expect(new Set(geometry.map(r=>r.width)).size).toBe(1);expect(geometry.every(r=>r.text==='10/09'&&!r.overlap&&r.font==='tabular-nums')).toBe(true);expect(geometry.every((r,i)=>i===0||r.top>=geometry[i-1].bottom)).toBe(true);await page.screenshot({path:info.outputPath('phase17-cash-dates.png')});await overflow(page);
 const chart=page.getByTestId('cash-trend-chart');await chart.scrollIntoViewIfNeeded();const svg=chart.getByRole('img'),b=await svg.boundingBox();await page.mouse.click(b!.x+b!.width/2,b!.y+30);const tip=page.getByTestId('asset-trend-tooltip');await expect(tip).toBeVisible();await tip.tap();await expect(tip).toBeVisible();await page.getByRole('button',{name:'기간 직접 선택'}).tap();await expect(tip).toHaveCount(0);await expect(page.getByRole('dialog')).toBeVisible();
});
