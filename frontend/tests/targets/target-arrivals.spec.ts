import { expect, test, type Page } from '@playwright/test';

const conditions=[{days:7,rate:'5'},{days:30,rate:'10'},{days:90,rate:'15'},{days:180,rate:'20'},{days:365,rate:'30'}];
const sample=(i:number)=>({lotId:String(i+1),securityId:'1',symbol:'005380',name:i===4?'한국투자글로벌반도체장기종목':'현대차',buyDate:'2026-09-11',holdingDays:20,remainingQuantity:'10',unitPrice:'180000',currentPrice:'200000',returnRate:'11.111111111111111',profitLoss:'200000',representativeCondition:conditions[1],priceUpdatedAt:'2026-10-01T03:10:00Z'});
const meta={accountId:'1',conditionsVersion:0,enabled:true,total:26,unavailableCount:0,unavailable:[],calculatedAt:'2026-10-01T03:10:00Z',asOfDate:'2026-10-01',priceAsOf:'2026-10-01T03:10:00Z',priceAsOfLatest:'2026-10-01T03:10:00Z'};
async function fixture(page:Page) {
  let settings={accountId:'1',scope:'ACCOUNT',version:0,conditions:[...conditions]};
  let failSave=false; let failRead=false; let unavailable=0;
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());const path=url.pathname;
    if(path==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'테스트 계좌',brokerName:'증권사',isActive:true,isDefault:true,cashBalance:'1000000'},{id:'2',name:'다른 계좌',brokerName:'증권사',isActive:true,cashBalance:'0'}]}});
    if(path.endsWith('/target-arrival-conditions')){
      if(route.request().method()==='PUT'){
        if(failSave)return route.fulfill({status:500,json:{error:{message:'저장 실패'}}});
        const body=route.request().postDataJSON();settings={...settings,...body,version:settings.version+1};
      }
      return route.fulfill({json:{data:settings}});
    }
    if(path.endsWith('/target-arrivals')){
      if(failRead)return route.fulfill({status:503,json:{error:{message:'조회 실패'}}});
      const second=path.includes('/2/');const data=second?[]:Array.from({length:26},(_,i)=>sample(i));
      return route.fulfill({json:{data:settings.conditions.length&& !unavailable?data:[],meta:{...meta,accountId:second?'2':'1',conditionsVersion:settings.version,enabled:settings.conditions.length>0,total:!unavailable?data.length:0,unavailableCount:unavailable}}});
    }
    if(path.endsWith('/buy-lots'))return route.fulfill({json:{data:Array.from({length:6},(_,i)=>({id:String(i+1),boughtAt:`2026-10-01T0${i}:00:00Z`,security:{id:'1',symbol:'005380',name:'현대차',marketType:'KOSPI'},quantity:'10',soldQuantity:i===5?'10':'0',remainingQuantity:i===5?'0':'10',unitPrice:'180000',remainingPurchaseAmount:'1800000',memo:null,sellTrades:[]}))}});
    if(path.endsWith('/dashboard'))return route.fulfill({json:{data:{account:{id:'1',name:'테스트 계좌',brokerName:'증권사'},cashBalance:'1000000',purchaseAmount:'1800000',stockValue:'2000000',totalAssetValue:'3000000',unrealizedProfitLoss:'200000',unrealizedReturnRate:'11.1',pricingComplete:true,missingPriceSymbols:[],latestPriceUpdatedAt:'2026-10-01T03:10:00Z',dailyProfit:'0',dailyProfitRate:'0',stockMonthlyProfit:'0',cashMonthlyProfit:'0',performanceMeta:{},holdings:[{securityId:'1',symbol:'005380',name:'현대차',marketType:'KOSPI',quantity:'10',purchaseAmount:'1800000',averagePurchasePrice:'180000',currentPrice:'200000',previousClosePrice:'198000',marketValue:'2000000',unrealizedProfitLoss:'200000',unrealizedReturnRate:'11.1',priceChangeRate:'1.0',priceUpdatedAt:'2026-10-01T03:10:00Z',marketStatus:'STORED'}]}}});
    if(path.endsWith('/asset-history'))return route.fulfill({json:{data:[{date:'2026-09-01',totalAssetValue:'2900000'},{date:'2026-10-01',totalAssetValue:'3000000'}],summary:{profitLoss:'100000',returnRate:'3.4'}}});
    return route.fulfill({json:{data:[]}});
  });
  return {failSave:()=>{failSave=true;},allowSave:()=>{failSave=false;},failRead:()=>{failRead=true;},unavailable:()=>{unavailable=2;}};
}
async function checkLayout(page:Page){
  const r=await page.evaluate(()=>{const main=document.querySelector('main')!;return {overflow:document.documentElement.scrollWidth>innerWidth,main:main.getBoundingClientRect().toJSON(),header:document.querySelector('header')?.getBoundingClientRect().height,nav:[...document.querySelectorAll('.MuiBottomNavigation-root')].find(n=>getComputedStyle(n).display!=='none')?.getBoundingClientRect().height};});
  expect(r.overflow).toBe(false);expect(r.header).toBe(44);expect(r.nav).toBe(44);
}
test('home five-lot summary, complete snapshot, row navigation and bottom safety',async({page},info)=>{
  await fixture(page);await page.goto('/');const card=page.getByTestId('target-arrival-card');await expect(card.getByText('26건')).toBeVisible();await expect(card.getByTestId('target-lot')).toHaveCount(5);
  await checkLayout(page);await card.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('home-cards.png')});
  await card.getByRole('button',{name:'더보기',exact:true}).click();await expect(page).toHaveURL(/target-arrivals/);await expect(page.getByTestId('target-lot')).toHaveCount(20);
  await page.getByRole('button',{name:'20건 더 보기'}).click();await expect(page.getByTestId('target-lot')).toHaveCount(26);
  await page.locator('main').evaluate(n=>n.scrollTop=n.scrollHeight);await page.screenshot({path:info.outputPath('full-list-bottom.png')});
  const safe=await page.getByTestId('target-lot').last().evaluate(n=>({bottom:n.getBoundingClientRect().bottom,mainBottom:document.querySelector('main')!.getBoundingClientRect().bottom}));expect(safe.mainBottom-safe.bottom).toBeGreaterThanOrEqual(70);
  await page.getByTestId('target-lot').first().click();await expect(page).toHaveURL(/edit=1/);
});
test('conditions edit, max five, enter flow, retry and explicit empty settings',async({page},info)=>{
  const f=await fixture(page);await page.goto('/detail/settings?view=target-arrival');await expect(page.getByRole('button',{name:'조건 추가',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'수정',exact:true}).first().click();const dialog=page.getByRole('dialog');await dialog.getByRole('textbox',{name:'보유기간 상한'}).fill('8');await dialog.getByRole('textbox',{name:'보유기간 상한'}).press('Enter');await expect(dialog.getByRole('textbox',{name:'목표수익률'})).toBeFocused();await dialog.getByRole('textbox',{name:'목표수익률'}).fill('6.5');await dialog.getByRole('textbox',{name:'목표수익률'}).press('Enter');await expect(dialog).not.toBeVisible();
  f.failSave();await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('저장 실패',{exact:false})).toBeVisible();await expect(page.getByText('8일 이내 / 6.5% 이상')).toBeVisible();f.allowSave();await page.getByRole('button',{name:'다시 시도'}).click();await expect(page.getByText('저장했습니다. 홈 목록을 갱신했습니다.')).toBeVisible();
  for(let i=0;i<5;i++){await page.getByRole('button',{name:'삭제',exact:true}).first().click();await page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByRole('button',{name:'수정',exact:true})).toHaveCount(4-i);}
  await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('저장했습니다. 홈 목록을 갱신했습니다.')).toBeVisible();await page.goto('/detail/target-arrivals');await expect(page.getByText('조건이 설정되지 않아 기능이 비활성화되었습니다.')).toBeVisible();await page.screenshot({path:info.outputPath('conditions-empty.png')});
});
test('unavailable is distinct from empty and account switches discard prior results',async({page})=>{
  const f=await fixture(page);f.unavailable();await page.goto('/detail/target-arrivals');await expect(page.getByText(/판정 불가 2건/)).toBeVisible();await expect(page.getByText('내용이 없습니다.')).toHaveCount(0);
  await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});await expect(page.getByTestId('target-lot')).toHaveCount(0);
});
test('long names and large amounts preserve all numeric cells',async({page},info)=>{
  await fixture(page);await page.route('**/api/accounts/*/target-arrivals',route=>route.fulfill({json:{data:[{...sample(4),remainingQuantity:'100000000000',currentPrice:'999999999999999',unitPrice:'888888888888888',profitLoss:'11111111111111100000000000'}],meta:{...meta,total:1}}}));await page.goto('/detail/target-arrivals');await expect(page.getByTestId('target-lot')).toHaveCount(1);await checkLayout(page);await expect(page.getByLabel('평가이익액')).toContainText('11,111,111,111,111,100,000,000,000원');await page.screenshot({path:info.outputPath('large-values.png')});
});
