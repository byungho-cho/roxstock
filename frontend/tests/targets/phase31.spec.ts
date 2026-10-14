import {test,expect} from '@playwright/test';
import {fixture} from './phase3-fixture';
const empty={data:[],daily:[],summary:{buyAmount:'0',sellAmount:'0',realizedProfitLoss:'0'}};
test('dates precede month data; annual waits, seeds other months and crosses year boundary',async({page},info)=>{
 await fixture(page);const reads:string[]=[];let release!:()=>void;
 await page.route('**/api/accounts/*/trades*',async r=>{
  const u=new URL(r.request().url());reads.push(u.search);
  if(u.searchParams.get('from')==='2026-01-01'&&u.searchParams.get('to')==='2026-01-31')await new Promise<void>(resolve=>release=resolve);
  return r.fulfill({json:empty});
 });
 const start=Date.now();await page.goto('/journal?date=2026-01-07');
 const calendar=page.getByTestId('journal-calendar-card');await expect(calendar).toBeVisible();
 const shellMs=Date.now()-start;await expect(calendar.locator('button')).toHaveCount(42);
 await expect(calendar.locator('[data-loading-indicator]')).toHaveCount(0);
 await expect.poll(()=>!!release).toBe(true);expect(reads).toHaveLength(1);
 await expect(page.getByTestId('journal-layout')).not.toContainText('0원');
 const before=await calendar.boundingBox();release();
 await expect.poll(()=>reads.some(s=>s.includes('to=2026-12-31'))).toBe(true);
 await expect(page.getByTestId('journal-transactions')).toContainText('내용이 없습니다.');
 const loadedMs=Date.now()-start;expect(await calendar.boundingBox()).toEqual(before);
 await page.getByRole('button',{name:'다음 달',exact:true}).first().click();
 await expect(calendar).toHaveAttribute('aria-label','2026년 2월 거래 달력');
 await expect(page.getByTestId('journal-transactions')).toContainText('내용이 없습니다.');
 expect(reads).toHaveLength(2);
 await page.locator('.MuiBottomNavigation-root:visible').getByRole('button',{name:'더보기',exact:true}).click();
 await page.goBack();
 await expect(calendar).toHaveAttribute('aria-label','2026년 2월 거래 달력');
 await expect(page.getByTestId('journal-transactions')).toContainText('내용이 없습니다.');
 expect(reads).toHaveLength(2);
 await page.getByRole('button',{name:'이전 달',exact:true}).first().click();
 await page.getByRole('button',{name:'이전 달',exact:true}).first().click();
 await expect.poll(()=>reads.some(s=>s.includes('from=2025-12-01')&&s.includes('to=2025-12-31'))).toBe(true);
 await expect.poll(()=>reads.some(s=>s.includes('from=2025-01-01')&&s.includes('to=2025-12-31'))).toBe(true);
 expect(reads.filter(s=>s.includes('from=2026-01-01')&&s.includes('to=2026-12-31'))).toHaveLength(1);
 console.log(JSON.stringify({kind:'phase31-controlled-ui',project:info.project.name,shellMs,loadedMs,reads,sha:process.env.GITHUB_SHA,utc:new Date().toISOString()}));
 await page.screenshot({path:info.outputPath('calendar.png')});
});
test('server version refresh updates menu without reinstall',async({page},info)=>{
 await fixture(page);let version='1.0.31';await page.route('**/api/version',r=>r.fulfill({json:{data:{version}}}));
 await page.goto('/more');await expect(page.getByTestId('release-version')).toHaveText('V 1.0.31');
 const before=await page.locator('header').first().boundingBox();version='1.0.32';
 await page.reload();await expect(page.getByTestId('release-version')).toHaveText('V 1.0.32');
 expect(await page.locator('header').first().boundingBox()).toEqual(before);
 await page.screenshot({path:info.outputPath('version.png')});
});
test('chart card retains height and controls before history arrives',async({page})=>{
 const control=await fixture(page);control.hold();await page.goto('/assets');
 const chart=page.getByTestId('analysis-chart-region');await expect(chart).toBeVisible();
 expect((await chart.boundingBox())!.height).toBe(224);
 await expect(chart.locator('[data-loading-indicator]')).toHaveCount(0);
 await expect(chart.getByRole('status')).toContainText('조회 중');
 control.release();await expect(page.getByTestId('analysis-chart')).toBeVisible();
 expect((await chart.boundingBox())!.height).toBe(224);
});
test('account switch isolates a late month response and an error can retry',async({page})=>{
 await fixture(page);let release!:()=>void,failed=true;
 await page.route('**/api/accounts/*/trades*',async r=>{
  if(new URL(r.request().url()).pathname.includes('/1/'))await new Promise<void>(resolve=>release=resolve);
  if(failed&&new URL(r.request().url()).pathname.includes('/2/'))return r.fulfill({status:503,json:{error:{message:'temporary'}}});
  return r.fulfill({json:empty});
 });
 await page.goto('/journal?date=2026-01-07');await expect.poll(()=>!!release).toBe(true);
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
 await expect(page.getByTestId('journal-layout').getByRole('alert')).toBeVisible({timeout:15000});
 await expect(page.getByTestId('journal-layout')).not.toContainText('내용이 없습니다.');
 failed=false;await page.getByTestId('journal-layout').getByRole('alert').click();
 await expect(page.getByTestId('journal-transactions')).toContainText('내용이 없습니다.');
 release();await expect(page.getByTestId('journal-calendar-grid').locator('[data-testid^="journal-chip-"]')).toHaveCount(0);
});
test('controlled before/after measurements distinguish shell, API and data display',async({browser,page},info)=>{
 test.skip(!process.env.PHASE31_BASELINE_URL,'baseline is prepared in CI');
 for(const [label,base] of [['before',process.env.PHASE31_BASELINE_URL!],['after','http://127.0.0.1:3032']]){
  const samples=[];
  for(let i=0;i<3;i++){
   const p=await browser.newPage({viewport:page.viewportSize()!});await fixture(p);
   let apiMs=0;await p.route('**/api/accounts/*/trades*',async r=>{const start=Date.now();await new Promise(resolve=>setTimeout(resolve,300));apiMs=Date.now()-start;return r.fulfill({json:empty});});
   const start=Date.now();await p.goto(base+'/journal?date=2026-01-07');
   await expect(p.getByTestId('journal-calendar-card')).toBeVisible();const shellMs=Date.now()-start;
   const dateSkeletons=await p.getByTestId('journal-calendar-grid').locator('[data-loading-indicator]').count();
   await expect(p.getByTestId('journal-transactions')).toContainText('내용이 없습니다.');
   samples.push({shellMs,dataMs:Date.now()-start,controlledApiMs:apiMs,dateSkeletons});
   if(i===0)await p.screenshot({path:info.outputPath(`calendar-${label}.png`)});
   await p.close();
  }
  console.log(JSON.stringify({kind:'phase31-ui-before-after',label,project:info.project.name,repeats:3,concurrency:2,controlledDelayMs:300,cache:'fresh browser context per sample',samples,sha:process.env.GITHUB_SHA,utc:new Date().toISOString()}));
 }
});

test('all menu entry headers omit back arrows on cover and tablet',async({page},info)=>{
 await fixture(page,{read:url=>{
  if(url.pathname.endsWith('/cash-overview'))return {json:{data:{account:{id:'1',name:'기본',currentBalance:'10000',balanceStatus:'AVAILABLE',updatedAt:'2026-10-14T03:00:00Z'},currentYearTax:{year:2026,amount:'0'},monthly:{deposit:'0',withdrawal:'0',dividend:'0'},yearly:{deposit:'0',withdrawal:'0',dividend:'0'},recentTransactions:[]}}};
  if(url.pathname==='/api/value-analysis')return {json:{data:{rows:[],total:0,year:2026,query:''}}};
  if(url.pathname==='/api/financial-statements')return {json:{data:{rows:[],total:0,year:2026}}};
 }});
 const entries=[['/detail/assets','대시보드'],['/stocks','종목목록'],['/journal','매매일지'],['/detail/cash','예수금'],['/assets','자산분석'],['/detail/investment','투자금'],['/detail/investment-profit','투자손익'],['/detail/value','가치분석'],['/detail/financials','재무제표'],['/detail/compound','복리계획'],['/detail/settings?view=settings','설정'],['/more','메뉴']];
 for(const [path,title] of entries){
  await page.goto(path);
  await expect(page.getByRole('heading',{name:title,exact:true,level:1})).toBeVisible();
  await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toHaveCount(0);
  await expect(page.locator('.MuiBottomNavigation-root')).toBeVisible();
 }
 await page.goto('/');
 await expect(page.getByRole('heading',{level:1})).toBeVisible();
 await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toHaveCount(0);
 await page.screenshot({path:info.outputPath('main-header-no-back.png')});
});
test('settings and financial child screens retain back navigation',async({page},info)=>{
 await fixture(page,{read:url=>{
  if(url.pathname.startsWith('/api/financial-statements/'))return {status:503,json:{error:{message:'controlled failure'}}};
  if(url.pathname==='/api/financial-statements')return {json:{data:{rows:[],total:0,year:2026}}};
 }});
 await page.goto('/detail/settings?view=account');
 await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toBeVisible();
 await page.goto('/detail/financials?selected=1&view=detail');
 const back=page.getByRole('button',{name:'뒤로가기',exact:true});
 await expect(back).toBeVisible();
 await back.click();
 await expect(page).toHaveURL(/view=list/);
 await expect(back).toHaveCount(0);
 await page.goto('/stocks/1');
 await expect(page.getByRole('button',{name:'뒤로가기',exact:true})).toBeVisible();
 await page.screenshot({path:info.outputPath('detail-header-back.png')});
});

test('value list does not wait for accounts or prefetch invisible cover detail',async({page},info)=>{
 const rows=Array.from({length:60},(_,i)=>({id:String(i+1),symbol:String(i+1).padStart(6,'0'),name:'성능종목'+(i+1),w:String(60-i),eps:'1',roe:'10',currentPrice:'100',previousClosePrice:'90',fairPrices:[],metricBasis:{year:2025,label:'2025',source:'OPEN_DART',isEstimated:false}}));
 const reads:string[]=[];let release!:()=>void;
 await fixture(page,{read:url=>{
  reads.push(url.pathname+url.search);
  if(url.pathname==='/api/value-analysis')return {json:{data:{rows,total:rows.length,year:2026,query:''}}};
  if(url.pathname.startsWith('/api/value-analysis/'))return {status:503,json:{error:{message:'controlled detail failure'}}};
 }});
 await page.route('**/api/accounts',async route=>{await new Promise<void>(r=>release=r);await route.fulfill({json:{data:[{id:'1',name:'기본',isDefault:true,isActive:true}]}});});
 const start=Date.now();await page.goto('/detail/value');await expect(page.getByTestId('value-row-000001')).toBeVisible();
 await expect.poll(()=>!!release).toBe(true);
 expect(reads.some(p=>p.includes('compact=1'))).toBe(true);
 expect(reads.filter(p=>/^\/api\/value-analysis\//.test(p))).toHaveLength(0);
 expect(await page.locator('[data-testid^="value-row-"]').count()).toBe(20);
 console.log(JSON.stringify({kind:'value-list-account-independent',project:info.project.name,dataMs:Date.now()-start,rowsRendered:20,rowsAvailable:60,accountRequest:'still pending'}));
 release();
 if(page.viewportSize()!.width<600){await expect(page.getByTestId('value-detail')).toHaveCount(0);}
 await page.getByRole('button',{name:/더 보기/}).click();expect(await page.locator('[data-testid^="value-row-"]').count()).toBe(40);
 await page.screenshot({path:info.outputPath('value-list-fast.png')});
});
