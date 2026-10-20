import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 await page.route('**/api/auth/**',route=>route.fulfill({status:route.request().url().endsWith('/me')?401:200,json:route.request().url().endsWith('/me')?{error:{code:'LOGIN_REQUIRED'}}:{data:{sent:true}}}));
});
test('Figma login geometry, assets, password visibility, default remember and Enter error preservation',async({page},info)=>{
 await page.goto('/auth/login');await expect(page.getByLabel('이메일',{exact:true})).toBeVisible();
 await expect(page.getByRole('checkbox',{name:'자동 로그인'})).not.toBeChecked();
 await expect(page.getByRole('navigation',{name:'하단 메뉴'})).toHaveCount(0);
 const panel=await page.locator('form').boundingBox();expect(panel!.width).toBe(338);
 const icon=await page.locator('img[src="/auth-v12/rox-r.svg"]').evaluate((image:HTMLImageElement)=>({loaded:image.complete&&image.naturalWidth>0,width:image.width,height:image.height}));expect(icon.loaded).toBe(true);expect(icon.width).toBeCloseTo(74.36,0);expect(icon.height).toBeCloseTo(74.36,0);
 await page.getByLabel('비밀번호',{exact:true}).fill('long passphrase with spaces');await page.getByRole('button',{name:'비밀번호 표시',exact:true}).click();await expect(page.getByLabel('비밀번호',{exact:true})).toHaveAttribute('type','text');await page.getByRole('button',{name:'비밀번호 숨기기',exact:true}).click();
 await page.getByLabel('비밀번호',{exact:true}).clear();await page.getByText('나의 투자를 기록하다',{exact:true}).click();await page.screenshot({path:info.outputPath('login.png')});
 await page.route('**/api/auth/login',route=>route.fulfill({status:401,json:{error:{code:'LOGIN_FAILED',message:'이메일 또는 비밀번호를 확인해 주세요.'}}}));
 await page.getByLabel('이메일',{exact:true}).fill('test@example.invalid');await page.getByLabel('비밀번호',{exact:true}).fill('long passphrase with spaces');await page.getByLabel('비밀번호',{exact:true}).press('Enter');await expect(page.getByRole('alert')).toContainText('확인해 주세요');await expect(page.getByLabel('이메일',{exact:true})).toHaveValue('test@example.invalid');
 await page.getByRole('button',{name:'이메일로 회원가입',exact:true}).click();await expect(page.getByLabel('비밀번호 확인',{exact:true})).toBeVisible();
});
test('reset states, center links, token removed from URL, reduced viewport scroll',async({page},info)=>{
 for(const state of ['forgot','sent','reset','complete','expired']){
  await page.goto('/auth/'+state+(state==='reset'?'#token=fixture-token':''));await expect(page.locator('form')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(state==='reset')expect(page.url()).not.toContain('#token');
  await page.screenshot({path:info.outputPath(state+'.png')});
 }
 await page.goto('/auth/register');await page.setViewportSize({width:370,height:240});await page.getByRole('button',{name:'인증 메일 보내기'}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'인증 메일 보내기'})).toBeInViewport();
});
test('session restoration never renders personal content or a login flash before identity resolves',async({page})=>{
 let release=()=>{};await page.route('**/api/auth/me',async route=>{await new Promise<void>(resolve=>release=resolve);await route.fulfill({status:401,json:{error:{code:'LOGIN_REQUIRED'}}});});
 await page.goto('/');await expect(page.getByRole('status')).toContainText('로그인을 확인');await expect(page.locator('form')).toHaveCount(0);await expect(page.getByTestId('asset-composition-card')).toHaveCount(0);release();await expect(page.locator('form')).toBeVisible();
});

test('foreground identity check covers the previous screen without discarding same-user form state',async({page})=>{
 let held=false,release=()=>{};
 await page.route('**/api/auth/me',async route=>{if(held)await new Promise<void>(resolve=>release=resolve);await route.fulfill({json:{data:{id:'foreground-user',role:'USER',email:'foreground@example.invalid',mustChangePassword:false,settings:{}}}});});
 await page.goto('/auth/login');const email=page.getByLabel('이메일',{exact:true});await email.fill('retained@example.invalid');held=true;
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
 const cover=page.getByRole('status');await expect(cover).toBeVisible();await expect(cover).toHaveCSS('z-index','2147483647');
 await expect(email).toHaveValue('retained@example.invalid');release();await expect(cover).toHaveCount(0);await expect(email).toHaveValue('retained@example.invalid');
});

test('settings logout clears the screen and does not reload its own broadcast indefinitely',async({page})=>{
 let signedIn=true;
 await page.route('**/api/**',route=>route.fulfill({json:{data:[]}}));
 await page.route('**/api/auth/me',route=>route.fulfill(signedIn?{json:{data:{id:'logout-user',role:'USER',email:'logout@example.invalid',mustChangePassword:false,settings:{}}}}:{status:401,json:{error:{code:'LOGIN_REQUIRED'}}}));
 await page.route('**/api/auth/logout',route=>{signedIn=false;return route.fulfill({json:{data:{loggedOut:true}}});});
 await page.goto('/detail/settings?view=settings');await page.getByRole('button',{name:'로그아웃',exact:true}).click();
 await expect(page.getByLabel('이메일',{exact:true})).toBeVisible();await expect(page.getByRole('status')).toHaveCount(0);await expect(page.getByRole('navigation',{name:'하단 메뉴'})).toHaveCount(0);
});
