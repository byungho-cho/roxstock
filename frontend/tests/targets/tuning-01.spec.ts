import { test, expect, type Page } from '@playwright/test';
const account = (id='1') => ({id,name:`계좌${id}`,brokerName:'증권',isDefault:true,isActive:true,cashBalance:'1000'});
const holding={securityId:'1',symbol:'005380',name:'현대자동차',marketType:'KOSPI',quantity:'2',purchaseAmount:'200',averagePurchasePrice:'100',currentPrice:'150',previousClosePrice:'140',marketValue:'300',unrealizedProfitLoss:'100',unrealizedReturnRate:'50',priceChangeRate:'7.14',priceUpdatedAt:'2026-10-13T00:00:00Z'};
const lot=(id:string)=>({id,boughtAt:'2026-10-01T00:00:00Z',buyDate:'2026-10-01',holdingDays:12,currentPrice:'150',returnRate:'50',profitLoss:'100',priceUpdatedAt:'2026-10-13T00:00:00Z',security:{id:'1',symbol:'005380',name:`매수${id}`,marketType:'KOSPI'},quantity:'2',unitPrice:'100',remainingQuantity:'2',soldQuantity:'0',remainingPurchaseAmount:'200',memo:null,sellTrades:[]});
const recent=(count=5,months=0)=>({data:Array.from({length:count},(_,i)=>lot(String(i+1))),meta:{accountId:'1',count,total:7,more:count<7,months}});
const home=(id='1')=>({accounts:[account(id)],accountId:id,dashboard:{account:account(id),cashBalance:'1000',purchaseAmount:'200',stockValue:'300',totalAssetValue:'1300',unrealizedProfitLoss:'100',unrealizedReturnRate:'50',pricingComplete:true,holdings:[holding]},trend:{data:[{date:'2026-10-12',totalAssetValue:'1200'},{date:'2026-10-13',totalAssetValue:'1300'}]},targets:{data:[],meta:{accountId:id,enabled:true,total:0,unavailableCount:0,priceAsOf:null}},recent:{...recent(),meta:{...recent().meta,accountId:id}}});
const stocks=()=>({accounts:[account()],accountId:'1',stocks:{catalog:[],holdings:[holding],trades:[]}});
async function setup(page:Page){
 const calls:string[]=[];
 await page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;calls.push(path);return route.fulfill({status:404,json:{error:{message:'Unexpected request'}}});});
 await page.route('**/api/pages/**',route=>{const url=new URL(route.request().url());if(url.pathname==='/api/pages/read')return route.fulfill({status:404,json:{error:{message:'Use legacy reads in tuning-01 fixture'}}});calls.push(url.pathname);return route.fulfill({json:{data:url.pathname.endsWith('/stocks')?stocks():home(url.searchParams.get('accountId')??'1')}});});
 return calls;
}
test('home and stocks use one API each and preserve cache during tab switches',async({page})=>{
 const calls=await setup(page);await page.goto('/');
 await expect(page.getByTestId('home-total-card')).toContainText('1,300');
 await expect(page.getByTestId('recent-buy-lot')).toHaveCount(5);
 expect(calls).toEqual(['/api/pages/home']);
 await page.goto('/stocks');
 await expect(page.getByTestId('stock-list')).toContainText('현대자동차');
 await page.getByRole('tab',{name:'관심종목'}).click();
 expect(calls).toEqual(['/api/pages/home','/api/pages/stocks']);
});
test('more retains existing DOM and appends without skeleton, duplicates or a second click',async({page})=>{
 await setup(page);let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let requests=0;
 await page.route('**/api/accounts/1/recent-buys**',async route=>{requests++;await gate;await route.fulfill({json:recent(7,1)});});
 await page.goto('/');const card=page.getByTestId('recent-buys-card');
 await expect(card.getByTestId('recent-buy-lot')).toHaveCount(5);
 await card.getByTestId('recent-buy-lot').first().evaluate(el=>(el as HTMLElement).dataset.retained='yes');
 await card.getByRole('button',{name:'더보기',exact:true}).click();
 await expect(card.getByRole('button',{name:'더보기',exact:true})).toBeDisabled();
 await expect(card.getByTestId('recent-buy-lot')).toHaveCount(5);
 await expect(card.locator('.MuiSkeleton-root')).toHaveCount(0);
 const scroll=await page.evaluate(()=>document.querySelector('main')?.scrollTop);
 release();await expect(card.getByTestId('recent-buy-lot')).toHaveCount(7);
 await expect(card.getByTestId('recent-buy-lot').first()).toHaveAttribute('data-retained','yes');
 await expect(card.locator('.MuiSkeleton-root')).toHaveCount(0);
 expect(requests).toBe(1);expect(await page.evaluate(()=>document.querySelector('main')?.scrollTop)).toBe(scroll);
 await page.screenshot({path:`test-results/tuning-01/more-${test.info().project.name}.png`});
});
test('more failure keeps rows and retries, account switch clears prior account content',async({page})=>{
 await setup(page);let fail=true;
 await page.route('**/api/accounts/1/recent-buys**',route=>route.fulfill(fail?{status:500,json:{error:{message:'failure'}}}:{json:recent(7,1)}));
 await page.goto('/');const card=page.getByTestId('recent-buys-card');
 await expect(card.getByTestId('recent-buy-lot')).toHaveCount(5);
 await card.getByRole('button',{name:'더보기',exact:true}).click();
 await expect(page.locator('.MuiSnackbar-root').getByRole('button',{name:'재시도',exact:true})).toBeVisible();
 await expect(card.getByTestId('recent-buy-lot')).toHaveCount(5);await expect(card.locator('.MuiSkeleton-root')).toHaveCount(0);
 fail=false;await card.getByRole('button',{name:'추가 조회 실패 · 재시도'}).click();await expect(card.getByTestId('recent-buy-lot')).toHaveCount(7);
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
 await expect(card.getByTestId('recent-buy-lot')).toHaveCount(5);
});

test('old backend 404 falls back to existing account/list APIs during rollback', async ({page}) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if(path.startsWith('/api/pages/')) return route.fulfill({status:404,json:{error:{message:'Not found'}}});
    if(path==='/api/accounts') return route.fulfill({json:{data:[account()]}});
    if(path.endsWith('/holdings')) return route.fulfill({json:{data:[holding]}});
    return route.fulfill({json:{data:[]}});
  });
  await page.goto('/stocks');
  await expect(page.getByTestId('stock-list')).toContainText('현대자동차');
});
