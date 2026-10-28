// Real production HTTP; optional isolated inactive fixture is the only manual-write target.
import {chromium,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
expect.configure({timeout:15000});
const identities=JSON.parse(readFileSync(process.env.SECURITY_DATA_BROWSER_SESSIONS,'utf8')),browser=await chromium.launch(process.env.SECURITY_DATA_BROWSER_CHANNEL?{channel:process.env.SECURITY_DATA_BROWSER_CHANNEL}:{}),origin='https://newrox.cafe24.com',checks=[];
try{
 for(const viewport of [{width:370,height:465},{width:725,height:396}])for(const identity of identities){
  const context=await browser.newContext({viewport,locale:'ko-KR',timezoneId:'Asia/Seoul'});await context.addCookies(identity.cookies);const page=await context.newPage(),errors=[];let detailChecked=false;const requests=[];page.on('response',async r=>{const path=new URL(r.url()).pathname;if(path.startsWith('/api/security-data')||path==='/api/auth/me'){try{const b=await r.json();requests.push({path,query:new URL(r.url()).search,status:r.status(),code:b.error?.code,quarters:b.data?.quarters?.length,role:path==='/api/auth/me'?b.data?.role:undefined});}catch{requests.push({path,status:r.status()});}}});page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.goto(origin+'/detail/security-data');
   if(identity.role==='USER'){
    await expect(page).toHaveURL(/\/more$/);await expect(page.getByTestId('more-menu').getByRole('button',{name:'종목 관리',exact:true})).toHaveCount(0);
    await page.goto(origin+'/detail/collection-monitoring');await expect(page).toHaveURL(/\/more$/);
    if(process.env.SECURITY_DATA_UI_FIXTURE){const f=JSON.parse(readFileSync(process.env.SECURITY_DATA_UI_FIXTURE,'utf8')),path='/api/security-data/quarters/'+f.year+'/'+f.quarter+'/'+f.id;expect((await page.request.get(origin+path)).status()).toBe(403);const csrf=identity.cookies.find(c=>c.name==='rox_csrf').value;expect((await page.request.patch(origin+path,{headers:{Origin:origin,'X-CSRF-Token':csrf},data:{field:'eps',value:'1',expectedValue:null}})).status()).toBe(403);}

   }else{
    await expect(page.getByRole('progressbar')).toHaveCount(4,{timeout:60000});
    const overview=await (await page.request.get(origin+'/api/security-data/quarters')).json(),index=Math.max(0,overview.data.quarters.findIndex(q=>q.missing>0));
    const listResponse=page.waitForResponse(r=>/\/api\/security-data\/quarters\/\d+\/\d+$/.test(new URL(r.url()).pathname)&&r.ok());const cards=page.getByRole('progressbar');await cards.nth(index).locator('..').click();await expect(page).toHaveURL(/year=\d{4}/);const list=(await (await listResponse).json()).data;
    await expect(page.getByText(`${list.items.length}/${list.total}건`,{exact:true})).toBeVisible({timeout:60000});
    const stocks=page.getByTestId('security-data-page').getByRole('button').filter({has:page.locator('strong')});
    await expect(stocks).toHaveCount(list.items.length);if(list.hasNext){await expect.poll(()=>requests.some(r=>r.query?.includes('offset=50')&&r.status===200),{timeout:60000}).toBe(true);await page.getByTestId('security-data-page').getByRole('button',{name:'더보기',exact:true}).click();await expect(stocks).toHaveCount(Math.min(100,list.total));await expect(page.getByText(`${Math.min(100,list.total)}/${list.total}건`,{exact:true})).toBeVisible();}if(list.items.length){
     const response=page.waitForResponse(r=>/\/api\/security-data\/quarters\/\d+\/\d+\/\d+$/.test(new URL(r.url()).pathname)&&r.ok());await stocks.first().click();const detail=(await (await response).json()).data;expect(detail.fields).toHaveLength(26);await expect(page.locator('[data-testid^="security-data-field-"]')).toHaveCount(26);
     for(const field of detail.fields){const value=field.value===null?'—':field.value.split('.').map((s,i)=>i===0?s.replace(/\B(?=(\d{3})+(?!\d))/g,','):s).join('.');await expect(page.getByTestId('security-data-field-'+field.key)).toContainText(value);}detailChecked=true;
    }
    if(process.env.SECURITY_DATA_UI_FIXTURE){
     const fixture=JSON.parse(readFileSync(process.env.SECURITY_DATA_UI_FIXTURE,'utf8')),q=fixture.quarter;
     await page.goto(origin+'/detail/security-data?year='+fixture.year+'&quarter='+q+'&selected='+fixture.id);
     // An automatic modal correctly hides the background heading from the accessibility tree.
     await expect(page.getByRole('heading',{name:'UI 검증용 임시 종목('+fixture.symbol+')',exact:true,includeHidden:true})).toBeAttached();
     if(viewport.width===370){
      await expect(page.getByRole('dialog',{name:'자료 기준 설정'})).toBeVisible();
      await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeHidden();
      await expect(page.getByRole('heading',{name:'UI 검증용 임시 종목('+fixture.symbol+')',exact:true})).toBeVisible();
      await page.reload();await expect(page.getByRole('dialog',{name:'자료 기준 설정'})).toBeVisible();
      await page.getByRole('combobox',{name:'연결/별도'}).click();await page.getByRole('option',{name:'연결',exact:true}).click();
      await expect(page.getByRole('combobox')).toHaveCount(1);await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('dialog')).toBeHidden();
      await page.reload();await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.getByTestId('security-data-field-eps').click();await page.getByPlaceholder('편집 값').fill('-12.5');await page.getByPlaceholder('편집 값').press('Enter');await expect(page.getByTestId('security-data-field-eps')).toContainText('-12.5원');
      await page.getByTestId('security-data-field-pbr').click();await page.getByPlaceholder('편집 값').fill('1.25');await page.getByPlaceholder('편집 값').press('Enter');await expect(page.getByTestId('security-data-field-pbr')).toContainText('1.25배');
     }else {await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('heading',{name:'UI 검증용 임시 종목('+fixture.symbol+')',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'자료 기준 설정',exact:true})).toHaveCount(0);await expect(page.getByTestId('security-data-field-pbr')).toContainText('1.25배');}
     const actual=(await (await page.request.get(origin+'/api/security-data/quarters/'+fixture.year+'/'+q+'/'+fixture.id)).json()).data;
     expect(actual.fields.find(f=>f.key==='eps').value).toBe('-12.5');expect(actual.fields.find(f=>f.key==='eps').source).toBe('MANUAL');expect(actual.basis.currency).toBe('KRW');
    }
    await page.goto(origin+'/detail/collection-monitoring/dart-financial-statements');await expect(page.getByTestId('security-collection-card')).toBeVisible({timeout:60000});
    const processing=(await (await page.request.get(origin+'/api/security-data/status')).json()).data.aggregation;const cc=processing.counts;expect(cc.target).toBe(cc.pending+cc.processing+cc.success+cc.partial+cc.failed+cc.excluded);await expect(page.getByTestId('security-collection-card')).toContainText('처리 대상 '+cc.target+'건');await expect(page.getByTestId('security-collection-card')).toContainText('처리 성공률 '+(cc.rate===null?'—':cc.rate.toFixed(1)+'%'));
    await expect(page.getByTestId('monitor-current')).toContainText(processing.message,{timeout:60000});
    await expect(page.getByTestId('monitor-counts').locator('>button')).toHaveCount(5);
    await expect(page.getByTestId('monitor-history-data')).toBeAttached();await expect(page.getByTestId('monitor-results-data')).toBeAttached();await page.getByTestId('security-collection-card').click();await expect(page).toHaveURL(/\/detail\/security-data$/);
    await page.goto(origin+'/more');await expect(page.getByTestId('more-menu').getByRole('button')).toHaveCount(16);
   }
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);checks.push({role:identity.role,viewport,detailChecked,manualFixtureVerified:!!process.env.SECURITY_DATA_UI_FIXTURE&&identity.role==='ADMIN',prefetchRequests:requests.filter(r=>r.query?.includes('offset=50')).length,passed:true});
  }catch(error){console.error(JSON.stringify({marker:'SECURITY_DATA_BROWSER_FAILURE',role:identity.role,viewport,path:new URL(page.url()).pathname,requests,errors,alerts:await page.getByRole('alert').allTextContents().then(a=>a.map(t=>t.slice(0,240)))}));throw error;}finally{await context.close();}
 }
 console.log(JSON.stringify({marker:'SECURITY_DATA_PRODUCTION_BROWSER_VERIFIED',checkedAt:new Date().toISOString(),checks}));
}finally{await browser.close();}
