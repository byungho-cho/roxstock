// Uses real production HTTP and server-issued short-lived sessions; no API fixtures or writes.
import {chromium,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const identities=JSON.parse(readFileSync(process.env.SECURITY_DATA_BROWSER_SESSIONS,'utf8')),browser=await chromium.launch(),origin='https://newrox.cafe24.com',checks=[];
try{
 for(const viewport of [{width:370,height:465},{width:725,height:396}])for(const identity of identities){
  const context=await browser.newContext({viewport,locale:'ko-KR',timezoneId:'Asia/Seoul'});await context.addCookies(identity.cookies);const page=await context.newPage(),errors=[];let detailChecked=false;const requests=[];page.on('response',async r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/api/security-data')||path==='/api/auth/me'){try{const b=await r.json();requests.push({path,status:r.status(),code:b.error?.code,quarters:b.data?.quarters?.length,role:path==='/api/auth/me'?b.data?.role:undefined});}catch{requests.push({path,status:r.status()});}}});page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(origin+'/detail/security-data');
   if(identity.role==='USER'){
    await expect(page).toHaveURL(/\/more$/);await expect(page.getByTestId('more-menu').getByRole('button',{name:'종목 관리',exact:true})).toHaveCount(0);
    await page.goto(origin+'/detail/collection-monitoring');await expect(page).toHaveURL(/\/more$/);
   }else{
    await expect(page.getByRole('progressbar')).toHaveCount(4,{timeout:60000});
    const overview=await (await page.request.get(origin+'/api/security-data/quarters')).json(),index=Math.max(0,overview.data.quarters.findIndex(q=>q.missing>0));
    const listResponse=page.waitForResponse(r=>/\/api\/security-data\/quarters\/\d+\/\d+$/.test(new URL(r.url()).pathname)&&r.ok());const cards=page.getByTestId('security-data-page').getByRole('button');await cards.nth(index).click();await expect(page).toHaveURL(/year=\d{4}/);const list=(await (await listResponse).json()).data;
    await expect(page.getByText(/미수집 .*종목 · 공시 후 미수집/)).toBeVisible({timeout:60000});
    const stocks=page.getByTestId('security-data-page').getByRole('button').filter({has:page.locator('strong')});
    await expect(stocks).toHaveCount(list.items.length);if(list.items.length){
     const response=page.waitForResponse(r=>/\/api\/security-data\/quarters\/\d+\/\d+\/\d+$/.test(new URL(r.url()).pathname)&&r.ok());await stocks.first().click();const detail=(await (await response).json()).data;expect(detail.fields).toHaveLength(26);await expect(page.locator('[data-testid^="security-data-field-"]')).toHaveCount(26);
     for(const field of detail.fields){const value=field.value===null?'—':field.value.split('.').map((s,i)=>i===0?s.replace(/\B(?=(\d{3})+(?!\d))/g,','):s).join('.');await expect(page.getByTestId('security-data-field-'+field.key)).toContainText(value);}detailChecked=true;
    }
    await page.goto(origin+'/detail/collection-monitoring/dart-financial-statements');await expect(page.getByTestId('security-collection-card')).toBeVisible({timeout:60000});
    await expect(page.getByTestId('monitor-history-data')).toBeAttached();await expect(page.getByTestId('monitor-results-data')).toBeAttached();await page.getByTestId('security-collection-card').click();await expect(page).toHaveURL(/\/detail\/security-data$/);
    await page.goto(origin+'/more');await expect(page.getByTestId('more-menu').getByRole('button')).toHaveCount(16);
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);checks.push({role:identity.role,viewport,detailChecked,passed:true});
  }catch(error){console.error(JSON.stringify({marker:'SECURITY_DATA_BROWSER_FAILURE',role:identity.role,viewport,path:new URL(page.url()).pathname,requests,errors,alerts:await page.getByRole('alert').allTextContents().then(a=>a.map(t=>t.slice(0,240)))}));throw error;}finally{await context.close();}
 }
 console.log(JSON.stringify({marker:'SECURITY_DATA_PRODUCTION_BROWSER_VERIFIED',checkedAt:new Date().toISOString(),checks}));
}finally{await browser.close();}
