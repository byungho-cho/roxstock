import {test,expect} from '@playwright/test';
import {fixture} from './phase3-fixture';
async function identity(page:any,role='ADMIN'){await fixture(page);await page.route('**/api/auth/me', (route:any)=>route.fulfill({json:{data:{id:'fixture-user',email:'fixture@example.invalid',role,mustChangePassword:false,settings:{}}}}));}
test('administrator version link, separated settings, bounded user lists and masked detail',async({page},info)=>{
 await identity(page);await page.route('**/api/version',route=>route.fulfill({json:{data:{version:'1.2.3'}}}));
 await page.route('**/api/admin/users**',route=>route.fulfill({json:{data:new URL(route.request().url()).pathname.endsWith('/a')?{id:'a',email:'fixture@example.invalid',status:'정상',createdAt:'2026-10-20T15:30:00Z',accounts:[{id:'1',brokerName:'TEST',accountNumber:'******7890',isDefault:true}],nextAccountCursor:null}:{items:[{id:'a',email:'fixture@example.invalid',status:'정상',createdAt:'2026-10-20T15:30:00Z'}],nextCursor:null}}}));
 await page.goto('/more');await page.getByRole('button',{name:'관리자 화면',exact:true}).click();await expect(page.getByRole('button',{name:'사용자 목록',exact:true})).toBeVisible();await page.getByRole('button',{name:'사용자 목록',exact:true}).click();await page.getByRole('button',{name:/fixture@example.invalid/}).click();await expect(page.getByText('******7890',{exact:false})).toBeVisible();await expect(page.getByText('한국시간',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('admin-detail.png')});
 await page.goto('/detail/settings?view=settings');const menu=page.getByRole('navigation',{name:'설정 메뉴'});await expect(menu.getByText('DB 백업',{exact:true})).toHaveCount(0);await expect(menu.getByText('시세 수집',{exact:true})).toHaveCount(0);await expect(menu.getByText('알림 설정',{exact:true})).toBeVisible();
});
test('ordinary user has no admin version action or monitoring; direct URLs rejected',async({page})=>{
 await identity(page,'USER');await page.goto('/more');await expect(page.getByRole('button',{name:/^시세 수집|^종목 관리/})).toHaveCount(0);await expect(page.getByRole('button',{name:'관리자 화면',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'모니터링',exact:true})).toHaveCount(0);await expect(page.getByRole('navigation',{name:'하단 메뉴'}).getByText('모니터링',{exact:true})).toHaveCount(0);
 for(const path of ['/detail/admin','/detail/admin/backup','/detail/admin/collection','/detail/admin/users/a','/detail/collection-monitoring','/detail/security-management','/detail/news-collection-settings','/detail/settings?view=backup']){await page.goto(path);await expect(page).toHaveURL(/\/more$/);}
});
test('notification defaults, failed saves and OS permission refusal preserve real settings',async({page},info)=>{
 await identity(page,'USER');let settings={targetEnabled:false,newsEnabled:false,pushConfigured:true};let fail=false;
 await page.addInitScript(()=>{(window as any).RoxStockPush={postMessage:(raw:string)=>{const message=JSON.parse(raw);setTimeout(()=>(window as any).RoxStockPush.onmessage?.({data:JSON.stringify({requestId:message.requestId,configured:true,granted:false})}),0);}};});
 await page.route('**/api/notifications/settings',route=>{if(route.request().method()==='PUT'){if(fail)return route.fulfill({status:500,json:{error:{message:'설정 저장 실패'}}});settings={...settings,...route.request().postDataJSON()};}return route.fulfill({json:{data:settings}});});
 await page.goto('/detail/settings?view=notifications');await expect(page.getByRole('switch',{name:'목표가 도래 알림'})).not.toBeChecked();await page.getByRole('switch',{name:'목표가 도래 알림'}).click();await expect(page.getByText('시스템 알림 권한이 꺼져 있습니다.',{exact:false})).toBeVisible();await expect(page.getByRole('switch',{name:'목표가 도래 알림'})).not.toBeChecked();
 await page.evaluate(()=>{(window as any).RoxStockPush.postMessage=(raw:string)=>{const c=JSON.parse(raw);setTimeout(()=>(window as any).RoxStockPush.onmessage?.({data:JSON.stringify({requestId:c.requestId,configured:true,granted:true,installationId:'installation-fixture-0123456789',token:'f'.repeat(150),revision:'1'})}),0);};});
 await page.route('**/api/notifications/devices',route=>route.fulfill({json:{data:{binding:'00000000-0000-0000-0000-000000000001'}}}));
 await page.getByRole('switch',{name:'목표가 도래 알림'}).click();await expect(page.getByRole('switch',{name:'목표가 도래 알림'})).toBeChecked();fail=true;await page.getByRole('switch',{name:'목표가 도래 알림'}).click();await expect(page.getByText('설정 저장 실패',{exact:true})).toBeVisible();await expect(page.getByRole('switch',{name:'목표가 도래 알림'})).toBeChecked();await page.reload();await expect(page.getByRole('switch',{name:'목표가 도래 알림'})).toBeChecked();
 await page.screenshot({path:info.outputPath('notification-settings.png')});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('investment trends honors supplied symbol and does not substitute unrelated cached target',async({page})=>{
 await identity(page);const requested:string[]=[];await page.route('**/api/accounts/*/investor-targets',route=>route.fulfill({json:{data:[{id:'2',symbol:'000660',name:'SK하이닉스'}]}}));await page.route('**/api/investor-trends?**',route=>{requested.push(route.request().url());return route.fulfill({json:{data:{rows:[],points:[],reason:'자료 없음'}}});});
 await page.goto('/detail/investor-trends?mode=stock&symbol=005380');await expect(page.getByText('005380 · 대상 종목 자료 없음')).toBeVisible();expect(requested).toHaveLength(0);
});
test('stock detail button forwards exact symbol, keeps buy action and restores detail tab',async({page})=>{
 await identity(page);const targets:string[]=[];
 await page.route('**/api/accounts/*/investor-targets',route=>route.fulfill({json:{data:[{id:'2',symbol:'000660',name:'다른 종목'},{id:'1',symbol:'000001',name:'종목1'}]}}));
 await page.route('**/api/investor-trends?**',route=>{targets.push(new URL(route.request().url()).searchParams.get('target')!);return route.fulfill({json:{data:{rows:[],points:[],reason:'자료 없음',status:'NO_DATA'}}});});
 await page.goto('/stocks/1?detailTab=summary');const content=page.getByTestId('stock-detail-content');await expect(content.getByRole('button',{name:'매수',exact:true})).toBeVisible();await content.getByRole('button',{name:'투자동향',exact:true}).click();await expect(page).toHaveURL(/mode=stock&symbol=000001/);await expect.poll(()=>targets.length).toBeGreaterThan(0);expect(targets.every(t=>t==='000001')).toBe(true);await page.getByRole('button',{name:'뒤로가기',exact:true}).click();await expect(page).toHaveURL(/stocks\/1\?detailTab=summary/);await expect(page.getByRole('tab',{name:'요약',exact:true})).toHaveAttribute('aria-selected','true');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('cold push link survives login and selects the server-authorized destination account',async({page})=>{
 await fixture(page);let logged=false,selected:string|null=null;const event='00000000-0000-0000-0000-000000000123';
 await page.route('**/api/auth/me',route=>route.fulfill({status:logged?200:401,json:logged?{data:{id:'fixture-user',role:'USER',email:'fixture@example.invalid',mustChangePassword:false,settings:{}}}:{error:{code:'LOGIN_REQUIRED'}}}));
 await page.route('**/api/auth/login',route=>{logged=true;return route.fulfill({json:{data:{ok:true}}});});
 await page.route('**/api/auth/settings',route=>{selected=route.request().postDataJSON().selectedAccountId;return route.fulfill({json:{data:{selectedAccountId:selected}}});});
 await page.route('**/api/notifications/events/'+event,route=>route.fulfill({json:{data:{destination:'/',accountId:'2'}}}));
 await page.goto('/?pushEvent='+event);await page.getByLabel('이메일',{exact:true}).fill('fixture@example.invalid');await page.getByLabel('비밀번호',{exact:true}).fill('fixture-password');await page.getByRole('button',{name:'로그인',exact:true}).click();await expect.poll(()=>selected).toBe('2');await expect(page).toHaveURL(/\/$/);expect(await page.evaluate(()=>localStorage.getItem('roxstock:user:fixture-user:selected-account-id'))).toBe('2');
});
