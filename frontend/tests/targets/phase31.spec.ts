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
