import {test,expect} from '@playwright/test';
import {fixture} from './phase3-fixture';

const screens=[
  {url:'/detail/assets',path:'/dashboard',ready:'asset-overview'},
  {url:'/assets',path:'/asset-history',ready:'analysis-chart'},
  {url:'/journal?date=2026-10-07',path:'/trades',ready:'journal-calendar-card'},
  {url:'/detail/compound',path:'/compound-plans',ready:'compound-empty'},
  {url:'/detail/investment',path:'/asset-history',ready:'investment-page'},
  {url:'/detail/investment-profit',path:'/investment-profit',ready:'profit-page'},
  {url:'/stocks/1',path:'/buy-lots',ready:'stock-detail-content'},
  {url:'/detail/cash',path:'/cash-overview',ready:'cash-balance-value'},
  {url:'/detail/value',path:'/value-analysis',ready:'value-empty'},
  {url:'/detail/financials',path:'/financial-statements',text:'저장된 데이터가 없습니다.'},
];
for(const screen of screens)test(`batched reads render ${screen.url}`,async({page},info)=>{
  const batches:string[][]=[],direct:string[]=[],errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(path.startsWith('/api/')&&path!=='/api/pages/read')direct.push(path);});
  await fixture(page,{batch:true,onBatch:paths=>batches.push(paths),read:url=>{
    if(['/api/value-analysis','/api/financial-statements'].includes(url.pathname))return {json:{data:{year:2026,market:'KOSPI',query:'',total:0,rows:[]}}};
    if(url.pathname.endsWith('/cash-overview'))return {json:{data:{account:{id:'1',name:'기본',currentBalance:'65000',balanceStatus:'AVAILABLE',updatedAt:'2026-10-07T03:00:00Z'},monthly:{deposit:'0',withdrawal:'0',dividend:'0'},yearly:{deposit:'0',withdrawal:'0',dividend:'0'},currentYearTax:{year:2026,amount:'0'},recentTransactions:[]}}};
    return undefined;
  }});
  await page.goto(screen.url);
  await expect.poll(()=>batches.flat().some(path=>path.split('?')[0].endsWith(screen.path))).toBe(true);
  if(screen.ready)await expect(page.getByTestId(screen.ready).first()).toBeVisible();
  else await expect(page.getByText(screen.text!,{exact:true})).toBeVisible();
  await expect(page.locator('[data-loading-indicator="visible"]')).toHaveCount(0);
  expect(direct).toEqual([]);expect(errors).toEqual([]);
  if(screen.url==='/assets')expect(batches.some(paths=>paths.length>1)).toBe(true);
  await page.screenshot({path:info.outputPath('screen.png')});
});

test('phase26 stock profit scope survives batching, linked detail and account switching',async({page})=>{
  const batches:string[][]=[];
  await fixture(page,{batch:true,onBatch:paths=>batches.push(paths),read:url=>{
    if(!url.pathname.endsWith('/investment-profit'))return undefined;
    const accountId=url.pathname.split('/')[3],securityId=url.searchParams.get('securityId');
    const profit=accountId==='2'?'505':securityId==='1'?'120':'-30';
    return {json:{data:{accountId,securityId,capital:[],events:[{date:'2025-10-01',securityId,name:'종목'+securityId,kind:'SELL',buy:'0',sell:'1000',cost:'500',trading:profit,dividend:'0'}]}}};
  }});
  await page.goto('/stocks/1?detailTab=summary');
  await expect(page.getByTestId('stock-annual-row')).toContainText('+120원');
  await page.getByTestId('stock-annual-row').click();
  await expect(page).toHaveURL(/securityId=1/);
  await expect(page.getByTestId('profit-detail-summary')).toContainText('120원');
  await page.goto('/stocks/4?detailTab=summary');
  await expect(page.getByTestId('stock-annual-row')).toContainText('-30원');
  await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
  await expect(page.getByTestId('stock-annual-row')).toContainText('+505원');
  expect(batches.flat()).toEqual(expect.arrayContaining(['/accounts/1/investment-profit?securityId=1','/accounts/1/investment-profit?securityId=4','/accounts/2/investment-profit?securityId=4']));
});

test('secondary failure stays local and a new account cannot inherit old account data',async({page})=>{
  const batches:string[][]=[];
  await fixture(page,{batch:true,onBatch:p=>batches.push(p),read:url=>url.pathname.endsWith('/asset-history')?{status:503,json:{error:{message:'차트 조회 실패'}}}:undefined});
  await page.goto('/detail/assets');
  await expect(page.getByTestId('asset-overview')).toContainText('165,000원');
  await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
  await expect.poll(()=>batches.flat().some(path=>path.startsWith('/accounts/2/dashboard'))).toBe(true);
  await expect(page.getByTestId('asset-overview')).not.toContainText('종목1');
});

test('security management more retains existing DOM, no skeleton and one pending request',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});let more=0;
  const security=(id:string)=>({id,symbol:id.padStart(6,'0'),name:'종목'+id,registrationSource:'MANUAL',isActive:true,excludedFeatures:[],exclusionReason:null});
  await page.route('**/api/pages/read',async route=>{
    const paths=route.request().postDataJSON().paths as string[];
    const data=await Promise.all(paths.map(async path=>{
      if(path==='/accounts')return {status:200,body:{data:[{id:'1',name:'기본',isActive:true,isDefault:true}]}};
      const next=path.includes('cursor=');if(next){more++;await gate;}
      return {status:200,body:{data:{rows:[security(next?'2':'1')],hasNext:!next,nextCursor:next?null:'next'}}};
    }));await route.fulfill({json:{data}});
  });
  await page.goto('/detail/security-management');
  const rows=page.getByTestId('security-master-row');await expect(rows).toHaveCount(1);
  await rows.first().evaluate(el=>(el as HTMLElement).dataset.retained='yes');
  const button=page.getByTestId('security-management').getByRole('button',{name:'더보기',exact:true});await button.click();
  await expect(button).toBeDisabled();await expect(rows).toHaveCount(1);await expect(page.locator('.MuiSkeleton-root')).toHaveCount(0);
  release();await expect(rows).toHaveCount(2);await expect(rows.first()).toHaveAttribute('data-retained','yes');expect(more).toBe(1);
});
