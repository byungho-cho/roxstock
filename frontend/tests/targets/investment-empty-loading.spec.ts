import {test,expect} from '@playwright/test';
import {fixture} from './phase3-fixture';
for(const item of [{accountFirst:true,path:'/detail/investment',module:'InvestmentPage',shell:'investment-download-shell',page:'investment-page'},{accountFirst:false,path:'/detail/investment',module:'InvestmentPage',shell:'investment-download-shell',page:'investment-page'},{accountFirst:false,path:'/detail/investment-profit',module:'InvestmentProfitPage',shell:'profit-download-shell',page:'profit-page'}]){
 test(`${item.module} ${item.accountFirst?'account-first':'code-first'}: code and accounts wait show blank frames without skeletons`,async({page},info)=>{
  await fixture(page);let releaseCode!:()=>void,releaseAccount!:()=>void;
  await page.route(`**/assets/${item.module}-*.js`,async r=>{await new Promise<void>(resolve=>releaseCode=resolve);await r.continue();});
  await page.route('**/api/accounts',async r=>{await new Promise<void>(resolve=>releaseAccount=resolve);await r.fallback();});
  await page.goto(item.path,{waitUntil:'domcontentloaded'});await expect(page.getByTestId(item.shell)).toBeVisible();await expect.poll(()=>!!releaseCode).toBe(true);
  await expect(page.locator('.MuiSkeleton-root,.MuiCircularProgress-root')).toHaveCount(0);await expect(page.locator('main')).not.toContainText('0원');await expect(page.locator('main')).not.toContainText('조회 중');
  const chart=item.module==='InvestmentPage'?await page.getByTestId('investment-chart-region').boundingBox():null;
  await page.screenshot({path:info.outputPath('download.png')});
  if(item.module==='InvestmentPage')await page.getByRole('button',{name:'1분기',exact:true}).click();else {await page.getByRole('button',{name:'종목별',exact:true}).click();await page.getByRole('button',{name:'손익액 오름차순 정렬',exact:true}).click();}
  if(item.accountFirst){await expect.poll(()=>!!releaseAccount).toBe(true);releaseAccount();await expect.poll(()=>page.evaluate(()=>Object.keys(sessionStorage).some(k=>k.includes('investment-quarter:initial-account-owner')))).toBe(true);await expect(page.getByRole('button',{name:'1분기',exact:true})).toHaveAttribute('aria-pressed','true');}
  releaseCode();await expect(page.getByTestId(item.page)).toBeVisible();await expect(page.locator('.MuiSkeleton-root,.MuiCircularProgress-root')).toHaveCount(0);
  if(chart){expect(await page.getByTestId('investment-chart-region').boundingBox()).toEqual(chart);if(!item.accountFirst){await expect(page.getByTestId('investment-value')).toHaveText('');await expect(page.getByTestId('investment-evaluation-line')).toHaveCount(0);}await expect(page.getByRole('button',{name:'1분기',exact:true})).toHaveAttribute('aria-pressed','true');}
  else{await expect(page.getByTestId('profit-total')).toHaveText('');await expect(page.getByText('종목별 누적 수익',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'손익액 내림차순 정렬',exact:true})).toBeVisible();}
  if(chart){await page.getByRole('button',{name:'상세보기 ›',exact:true}).click();await expect(page.getByTestId('investment-detail-quarters')).toHaveCount(0);}
  await expect.poll(()=>!!releaseAccount).toBe(true);releaseAccount();
  if(chart){await expect(page.getByTestId('investment-detail-quarters')).toHaveCount(0);await page.getByRole('button',{name:'차트 상세 뒤로가기'}).click();}
  await expect(page.getByTestId(item.page)).toHaveAttribute('data-restoration-ready','true');
  await page.screenshot({path:info.outputPath('ready.png')});
  if(chart)expect(await page.getByTestId('investment-chart-region').boundingBox()).toEqual(chart);
 });
}
