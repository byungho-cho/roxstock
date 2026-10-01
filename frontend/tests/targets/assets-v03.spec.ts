import { expect, test, type Page } from '@playwright/test';
const stamp = '2026-10-01T03:10:00Z';
const holdings = Array.from({length:8}, (_, index) => ({securityId:String(index+1),symbol:'005380',name:['현대자동차','기아','삼성전자','SK하이닉스','NAVER','LG화학','POSCO','기타종목'][index],quantity:'1000',averagePurchasePrice:'96400',purchaseAmount:'96400000',currentPrice:'100000',marketValue:String([180000000,128500000,96400000,85000000,75000000,45000000,25000000,16100000][index]),unrealizedProfitLoss:index===1?'-4250000':index===2?'0':'49459200',unrealizedReturnRate:index===1?'-3.2':index===2?'0':'15.8',priceChangeRate:'0',priceUpdatedAt:stamp}));
async function fixture(page: Page, initial: 'normal'|'missing'|'error' = 'normal') {
  let state = initial; let hold = false; let release: (()=>void)|undefined;
  await page.clock.install({time:new Date(stamp)});
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const second = path.includes('/2/');
    if(path==='/api/accounts') return route.fulfill({json:{data:[{id:'1',name:'기본',isActive:true,isDefault:true,cashBalance:'203200000'},{id:'2',name:'빈 계좌',isActive:true,cashBalance:'0'}]}});
    if(path.endsWith('/dashboard')) {
      if(hold) await new Promise<void>(resolve=>{release=resolve;});
      if(state==='error') return route.fulfill({status:503,json:{error:{message:'조회 오류'}}});
      return route.fulfill({json:{data:{account:{id:second?'2':'1'},cashBalance:second?'0':'203200000',purchaseAmount:second?'0':'542990800',stockValue:state==='missing'?null:second?'0':'651000000',totalAssetValue:state==='missing'?null:second?'0':'854200000',unrealizedProfitLoss:state==='missing'?null:'108009200',unrealizedReturnRate:state==='missing'?null:'19.89',dailyProfit:state==='missing'?null:'12840000',dailyProfitRate:state==='missing'?null:'1.5',previousDayChange:state==='missing'?null:'22840000',previousDayChangeRate:state==='missing'?null:'2.75',stockMonthlyProfit:'20000000',cashMonthlyProfit:'20000000',pricingComplete:state!=='missing',latestPriceUpdatedAt:state==='missing'?null:stamp,holdings:second?[]:holdings.map(h=>state==='missing'?{...h,currentPrice:null,marketValue:null,unrealizedProfitLoss:null,unrealizedReturnRate:null}:h)}}});
    }
    return route.fulfill({json:{data:[],summary:{}}});
  });
  return {hold:()=>{hold=true;}, release:()=>{hold=false;release?.();}, missing:()=>{state='missing';}, error:()=>{state='error';}};
}

test('1001: four-size layout, distinct profit, donut units, chart toggle and holdings summary', async ({page},info) => {
  await fixture(page);await page.goto('/detail/assets');
  const composition=page.getByTestId('asset-composition-card'),pnl=page.getByTestId('asset-performance-card');
  await expect(page.getByTestId('asset-donut-value')).toHaveText('65,100만원');
  await expect(page.getByTestId('asset-previous-day')).toContainText('+22,840,000원');
  await expect(page.getByTestId('asset-summary-column')).toContainText('12,840,000원');
  await expect(composition).toContainText('갱신 26.10.01 12:10');
  const layout=await page.evaluate(()=>{
    const main=document.querySelector('main')!, grid=document.querySelector('[data-testid="asset-overview"]')!, left=document.querySelector('[data-testid="asset-summary-column"]')!,right=document.querySelector('[data-testid="asset-composition-card"]')!;
    const rect=(node:Element)=>node.getBoundingClientRect().toJSON();
    return {padding:[getComputedStyle(main).paddingTop,getComputedStyle(main).paddingLeft,getComputedStyle(main).paddingRight,getComputedStyle(main).paddingBottom],overflow:document.documentElement.scrollWidth>innerWidth,header:rect(document.querySelector('header')!),title:rect(document.querySelector('h1')!),nav:rect([...document.querySelectorAll('.MuiBottomNavigation-root')].find(n=>getComputedStyle(n).display!=='none')!),main:rect(main),grid:rect(grid),left:rect(left),right:rect(right),internalScrolls:[...main.querySelectorAll('*')].filter(n=>['auto','scroll'].includes(getComputedStyle(n).overflowY)).length};
  });
  expect(layout.padding).toEqual(['0px','8px','8px','80px']);expect(layout.overflow).toBe(false);expect(layout.internalScrolls).toBe(0);expect(layout.header.height).toBe(44);expect(layout.nav.height).toBe(44);expect(layout.title.x).toBe(52);expect(layout.grid.x).toBe(8);expect(layout.grid.y).toBe(44);expect(layout.right.height).toBe(552);
  await expect(page.locator('.MuiBottomNavigation-root:visible').getByRole('button')).toHaveCount(5);
  if(info.project.name.startsWith('tablet')) {
    expect(layout.left.height).toBe(552);expect(layout.right.y).toBe(layout.left.y);expect(layout.right.x-layout.left.right).toBe(16);expect((await pnl.boundingBox())!.height).toBe(162);
    const held=page.getByTestId('asset-holdings-card');expect((await held.boundingBox())!.height).toBe(222);await expect(held).toContainText('8종목');await expect(held.getByTestId('home-holding')).toHaveCount(3);
    const rowColors=await held.getByTestId('home-holding').evaluateAll(rows=>rows.map(r=>getComputedStyle(r).color));expect(rowColors).toEqual(['rgb(248, 113, 113)','rgb(96, 165, 250)','rgb(248, 250, 252)']);
    const clipped=await held.getByTestId('home-holding').evaluateAll(rows=>rows.flatMap(r=>[...r.querySelectorAll(':scope > div > div')].filter((cell,index)=>index%6!==0 && cell.scrollWidth>cell.clientWidth+1).map(c=>c.textContent)));expect(clipped).toEqual([]);
  } else {expect(layout.right.y).toBeGreaterThan(layout.left.bottom);expect((await pnl.boundingBox())!.height).toBe(174);await expect(page.getByTestId('asset-holdings-card')).toBeHidden();}
  const toggle=composition.getByRole('button',{name:'종목별 비중 차트 방식 변경'});await toggle.scrollIntoViewIfNeeded();await expect(toggle).toHaveText('순위형');
  const second=page.getByTestId('asset-weight-fill').nth(1);expect(await second.evaluate(n=>getComputedStyle(n).left)).toBe('0px');await toggle.click();await expect(toggle).toHaveText('누적형');expect(parseFloat(await second.evaluate(n=>getComputedStyle(n).left))).toBeGreaterThan(0);await toggle.click();await expect(toggle).toHaveText('순위형');
  await page.locator('main').evaluate(n=>n.scrollTop=n.scrollHeight);const bottom=await composition.evaluate(n=>({card:n.getBoundingClientRect().bottom,main:document.querySelector('main')!.getBoundingClientRect().bottom}));expect(bottom.main-bottom.card).toBeGreaterThanOrEqual(79);
  if(info.project.name.startsWith('tablet')) {await page.getByTestId('asset-holdings-card').getByRole('button',{name:'더보기',exact:true}).click();await expect(page).toHaveURL(/stocks\?tab=holding/);}
});

test('1001: refresh retains values and account switch shows only selected account',async({page},info)=>{
  const f=await fixture(page);await page.goto('/detail/assets');await expect(page.getByTestId('asset-donut-value')).toHaveText('65,100만원');
  f.hold();await page.clock.fastForward(300_000);await expect(page.getByTestId('asset-composition-card')).toContainText('갱신 중');await expect(page.getByTestId('asset-donut-value')).toHaveText('65,100만원');f.release();await expect(page.getByTestId('asset-composition-card')).not.toContainText('갱신 중');
  await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
  await expect(page.getByTestId('asset-composition-card').getByText('내용이 없습니다.')).toBeVisible();await expect(page.getByTestId('asset-donut-value')).toHaveCount(0);await expect(page.getByTestId('asset-performance-card').locator('.MuiTypography-root').nth(1)).toHaveText('—');await expect(page.getByTestId('asset-holdings-card').getByTestId('home-holding')).toHaveCount(0);
  if(info.project.name.startsWith('tablet')) {expect((await page.getByTestId('asset-holdings-card').boundingBox())!.height).toBe(222);await expect(page.getByTestId('asset-holdings-card')).toContainText('0종목');}
});

test('1001: missing data is not zero or empty, and failed refresh retains prior values',async({page})=>{
  const f=await fixture(page,'missing');await page.goto('/detail/assets');await expect(page.getByTestId('asset-composition-card')).toContainText('가격 미수집');await expect(page.getByTestId('asset-previous-day')).toContainText('—');await expect(page.getByTestId('asset-previous-day')).not.toContainText('0원');await expect(page.getByTestId('asset-composition-card').getByText('내용이 없습니다.')).toHaveCount(0);
  f.error();await page.clock.fastForward(300_000);await page.clock.fastForward(10_000);await expect(page.getByText('최신 데이터 조회에 실패했습니다. 이전 값을 표시합니다.')).toBeVisible();await expect(page.getByTestId('asset-composition-card')).toContainText('가격 미수집');
  await page.reload();await page.clock.fastForward(10_000);await expect(page.getByText('평가자산을 불러오지 못했어요.')).toBeVisible();await expect(page.getByRole('button',{name:'다시 시도'})).toBeVisible();
});
