import {test,expect} from '@playwright/test';
import {fixture as base} from './phase28-fixture';
const user={id:'1',email:'fixture@example.invalid',role:'USER',mustChangePassword:false,settings:{}};
async function setup(page:any){const f=await base(page);await page.route('**/api/auth/me',(r:any)=>r.fulfill({json:{data:user}}));return f;}
const resume=async(page:any)=>page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));});
test('legend toggle changes only numbers; grouped amounts, layout and refresh persistence',async({page},info)=>{
 await page.clock.install();const f=await setup(page);let reads=0;
 const read=async(path:string)=>{const r=await f.read(path);if(path.includes('/dashboard')){reads++;const amounts=[23070000,15000,10000,9000,8000,7000,6000,5000,4000];r.body.data={...r.body.data,stockValue:String(amounts.reduce((a,b)=>a+b)),totalAssetValue:String(amounts.reduce((a,b)=>a+b)+1000),holdings:amounts.map((v,i)=>({securityId:String(i+1),symbol:String(i+1),name:'아주 긴 종목명 '+i,quantity:'100000',averagePurchasePrice:'23070',purchaseAmount:'23070000',currentPrice:'23070',marketValue:String(v),unrealizedProfitLoss:i%2?'500':'-500',unrealizedReturnRate:i%2?'50':'-50'}))};}return r;};
 await page.route('**/api/pages/read',async r=>r.fulfill({json:{data:await Promise.all(r.request().postDataJSON().paths.map(read))}}));
 await page.route('**/api/accounts/*/dashboard**',async r=>{const u=new URL(r.request().url());return r.fulfill({json:(await read(u.pathname.slice(4)+u.search)).body});});
 await page.goto('/detail/assets');const legends=page.getByTestId('asset-legend-row');await expect(legends).toHaveCount(8);const toggle=page.getByRole('button',{name:'자산구성 범례 표시 변경'});await expect(toggle).toHaveText('비율');
 const donut=await page.getByTestId('asset-donut').innerHTML(),count=reads,names=await legends.locator('p').filter({hasText:'아주 긴'}).allTextContents();
 await toggle.click();await expect(toggle).toHaveText('금액');await expect(legends.first()).toContainText('2,307만원');await expect(legends.nth(3)).toContainText('1만원 미만');await expect(legends.last()).toContainText('기타1만원 미만');expect(reads).toBe(count);expect(await page.getByTestId('asset-donut').innerHTML()).toBe(donut);
 expect(await legends.locator('p').filter({hasText:'아주 긴'}).allTextContents()).toEqual(names);
 await page.clock.fastForward(300000);await expect.poll(()=>reads).toBeGreaterThan(count);await expect(toggle).toHaveText('금액');
 for(const row of await legends.all()){const boxes=await row.locator('p').evaluateAll(ns=>ns.map(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right})));expect(boxes[0].right).toBeLessThanOrEqual(boxes[1].left);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('legend-amount.png'),fullPage:true});await legends.last().scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('legend-other.png')});
});
test('home holdings use profit in middle, quantity and valuation right; click and other rows preserved',async({page},info)=>{
 await setup(page);await page.goto('/');const row=page.getByTestId('home-holding').first();await expect(row).toBeVisible();const cells=row.locator(':scope > div > div');await expect(cells.nth(1)).toContainText('50.0%');await expect(cells.nth(2)).toContainText('10 × 100원');await expect(cells.nth(4)).toContainText('500원');await expect(cells.nth(5)).toContainText('1,500원');
 const right=await cells.nth(2).evaluate(n=>getComputedStyle(n).textAlign);expect(right).toBe('right');await expect(page.getByTestId('recent-buy-lot').first()).toContainText('10 × 100원');await row.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('home-holdings.png'),fullPage:true});await row.click();await expect(page).toHaveURL(/stocks\/1/);
});
async function cash(page:any,cost='0'){
 await page.route('**/api/pages/read',(r:any)=>r.fulfill({status:404,json:{error:{code:'LEGACY_FIXTURE'}}}));
 await page.route('**/api/accounts/1/cash-transactions?**',(r:any)=>r.fulfill({json:{data:[],meta:{total:0,count:0,limit:100,offset:0},summary:{}}}));
 const row={id:'92',accountId:'1',transactionType:'BUY',transactionDate:'2026-10-07T03:00:00Z',amount:'110',feeTaxAmount:cost,feeTaxStatus:cost==='0'?'UNKNOWN':'CONFIRMED',balanceAfter:cost==='0'?'1000':'844.2351',signedAmount:'-110',createdAt:'2026-10-07T03:00:00Z'};
 await page.route('**/api/accounts/1/cash-transactions/92',r=>r.fulfill({json:{data:row}}));
 await page.route('**/api/accounts/1/cash-overview**',r=>r.fulfill({json:{data:{account:{id:'1',name:'기본',cashBalance:row.balanceAfter,currentBalance:row.balanceAfter,balanceStatus:'KNOWN'},monthly:{},yearly:{},recentTransactions:[row]}}}));
}
test('fractional estimate is integer draft only, manual cost preview and exact saved settlement',async({page},info)=>{
 await setup(page);await cash(page);let saved:any,writes=0;await page.route('**/api/accounts/1/cash-transactions/92/fee-estimate',r=>r.fulfill({json:{data:{amount:'155.7649',count:3}}}));await page.route('**/api/cash-transactions/92',r=>{saved=r.request().postDataJSON();writes++;return r.fulfill({json:{data:{id:'92'}}});});
 await page.goto('/detail/cash?editCash=92&cashAccount=1');await expect(page.getByLabel('제세금',{exact:true})).toHaveValue('156');await expect(page.getByLabel('세후예수금',{exact:true})).toHaveValue('844');expect(writes).toBe(0);await expect(page.getByLabel('실제 금액으로 확인',{exact:true})).toBeChecked();
 await page.getByLabel('제세금',{exact:true}).fill('155.7649');await expect(page.getByText('저장 적용 제세금 156원 · 원 단위 올림')).toBeVisible();await expect(page.getByLabel('세후예수금',{exact:true})).toHaveValue('844');await page.screenshot({path:info.outputPath('cost-preview.png'),fullPage:true});await page.getByRole('button',{name:'저장',exact:true}).click();await expect.poll(()=>saved).toMatchObject({feeTaxAmount:'156',balanceAfter:'844',feeTaxStatus:'CONFIRMED'});expect(writes).toBe(1);
});
test('legacy fractional fee preview changes no DB until explicit save; integer, zero and empty remain distinguishable',async({page})=>{
 await setup(page);await cash(page,'155.7649');let writes=0;await page.route('**/api/cash-transactions/92',r=>{writes++;return r.fulfill({json:{data:{id:'92'}}});});await page.goto('/detail/cash?editCash=92&cashAccount=1');await expect(page.getByText('저장 적용 제세금 156원 · 원 단위 올림')).toBeVisible();await expect(page.getByLabel('세후예수금',{exact:true})).toHaveValue('844');expect(writes).toBe(0);
 const cost=page.getByLabel('제세금',{exact:true});await cost.fill('155.0000');await page.getByLabel('메모',{exact:true}).focus();await expect(cost).toHaveValue('155');await cost.fill('0');await expect(page.getByLabel('세후예수금',{exact:true})).toHaveValue('1,000');await cost.clear();await page.getByRole('button',{name:'저장',exact:true}).click();expect(writes).toBe(0);await expect(page.getByText('제세금을 확인해 주세요.',{exact:true})).toBeVisible();
});
for(const failure of ['network','5xx','invalid','timeout'] as const)test(`known identity survives ${failure}, bounded retry and foreground recovery without native unbind`,async({page},info)=>{
 await setup(page);await page.addInitScript(()=>{(window as any).unbinds=0;(window as any).RoxStockPush={postMessage:(raw:string)=>{const c=JSON.parse(raw);if(c.action==='unbind')(window as any).unbinds++;setTimeout(()=>(window as any).RoxStockPush.onmessage?.({data:JSON.stringify({requestId:c.requestId})}),0);}};});await page.goto('/auth/login');const email=page.getByLabel('이메일',{exact:true});await email.fill('preserved@example.invalid');const unbinds=await page.evaluate(()=>(window as any).unbinds);let calls=0,fail=true;
 await page.route('**/api/auth/me',async r=>{calls++;if(!fail)return r.fulfill({json:{data:user}});if(failure==='network')return r.abort('internetdisconnected');if(failure==='invalid')return r.fulfill({body:'bad gateway'});if(failure==='timeout'){await new Promise(resolve=>setTimeout(resolve,15500));return r.abort();}return r.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}});});
 await resume(page);await expect(page.getByRole('alert')).toContainText('연결을 확인하지 못했습니다',{timeout:20000});await expect(email).toHaveValue('preserved@example.invalid');expect(await page.evaluate(()=>(window as any).unbinds)).toBe(unbinds);
 fail=false;await page.getByRole('button',{name:'다시 시도',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(email).toHaveValue('preserved@example.invalid');await page.screenshot({path:info.outputPath(`session-${failure}-recovered.png`)});expect(calls).toBeGreaterThanOrEqual(2);
});
test('first launch uncertainty shows no private screen or login; manual retry restores verified identity',async({page})=>{
 await setup(page);let fail=true;await page.route('**/api/auth/me',r=>r.fulfill(fail?{status:502,json:{error:{code:'BAD_GATEWAY'}}}:{json:{data:user}}));await page.goto('/');await expect(page.getByRole('alert')).toContainText('로그인 확인을 기다리고');await expect(page.getByTestId('home-holdings-card')).toHaveCount(0);await expect(page.locator('form')).toHaveCount(0);fail=false;await page.getByRole('button',{name:'다시 시도',exact:true}).click();await expect(page.getByTestId('home-holdings-card')).toBeVisible();
});
test('only confirmed expiry logs out; unrelated 403 and malformed identity retain established user',async({page})=>{
 await setup(page);await page.goto('/auth/login');await page.getByLabel('이메일',{exact:true}).fill('preserved@example.invalid');await page.route('**/api/auth/me',r=>r.fulfill({status:403,json:{error:{code:'ADMIN_REQUIRED'}}}));await resume(page);await expect(page.getByRole('alert')).toContainText('연결을 확인하지 못했습니다');await expect(page.getByLabel('이메일',{exact:true})).toHaveValue('preserved@example.invalid');await page.route('**/api/auth/me',r=>r.fulfill({status:401,json:{error:{code:'AUTH_SESSION_REVOKED'}}}));await page.getByRole('button',{name:'다시 시도',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByLabel('이메일',{exact:true})).toHaveValue('');
});
test('broadcast identity uncertainty blocks previous account; old delayed response cannot restore old user',async({page})=>{
 await setup(page);await page.goto('/');await expect(page.getByTestId('home-holdings-card')).toBeVisible();let release!:()=>void;const held=new Promise<void>(r=>release=r);await page.route('**/api/auth/me',async r=>{await held;return r.fulfill({json:{data:{...user,id:'2'}}});});await page.evaluate(()=>{const c=new BroadcastChannel('roxstock-auth');c.postMessage({source:'other-tab'});c.close();});await expect(page.getByRole('status').filter({hasText:'로그인을 확인'})).toBeVisible();release();await expect(page.getByRole('status').filter({hasText:'로그인을 확인'})).toHaveCount(0);expect(await page.evaluate(()=>localStorage.getItem('roxstock:user:1:selected-account-id'))).not.toBe('2');
});
test('older foreground response cannot replace a newer verified user',async({page})=>{
 await setup(page);await page.goto('/auth/login');await page.getByLabel('이메일',{exact:true}).fill('old-draft@example.invalid');let calls=0,release!:()=>void;const held=new Promise<void>(r=>release=r);
 await page.route('**/api/auth/me',async r=>{if(++calls===1){await held;return r.fulfill({json:{data:user}});}return r.fulfill({json:{data:{...user,id:'2'}}});});
 await resume(page);await expect.poll(()=>calls).toBe(1);await page.evaluate(()=>window.dispatchEvent(new Event('online')));release();await expect(page.getByRole('status').filter({hasText:'로그인을 확인'})).toHaveCount(0);await page.getByLabel('이메일',{exact:true}).fill('new-draft@example.invalid');await expect.poll(()=>calls).toBe(2);await expect(page.getByLabel('이메일',{exact:true})).toHaveValue('new-draft@example.invalid');
});
test('automatic recovery stops after three retries and resumes on an explicit online signal',async({page})=>{
 await page.clock.install();await setup(page);await page.goto('/auth/login');await page.getByLabel('이메일',{exact:true}).fill('retained@example.invalid');let calls=0,fail=true;await page.route('**/api/auth/me',r=>{calls++;return r.fulfill(fail?{status:503,json:{error:{code:'UNAVAILABLE'}}}:{json:{data:user}});});await resume(page);
 await expect.poll(()=>calls).toBe(1);await expect(page.getByRole('alert')).toBeVisible();for(const [delay,count] of [[2000,2],[5000,3],[15000,4]]){await page.clock.fastForward(delay);await expect.poll(()=>calls).toBe(count);await expect(page.getByRole('alert')).toBeVisible();}await page.clock.fastForward(60000);expect(calls).toBe(4);fail=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByLabel('이메일',{exact:true})).toHaveValue('retained@example.invalid');
});

test('same-origin tabs serialize a pending renewal before a new login cookie response',async({page,context})=>{
 await setup(page);await page.goto('/auth/login');const second=await context.newPage();await setup(second);await second.goto('/auth/login');await second.getByLabel('이메일',{exact:true}).fill('new@example.invalid');await second.getByLabel('비밀번호',{exact:true}).fill('fixture-password');let release!:()=>void,calls=0,loginCalls=0;const held=new Promise<void>(r=>release=r);
 await page.route('**/api/auth/me',async r=>{calls++;await held;return r.fulfill({json:{data:user}});});await second.route('**/api/auth/login',r=>{loginCalls++;return r.fulfill({json:{data:{...user,id:'2'}}});});
 await resume(page);await expect.poll(()=>calls).toBe(1);await second.getByRole('button',{name:'로그인',exact:true}).click();expect(loginCalls).toBe(0);release();await expect.poll(()=>loginCalls).toBe(1);await second.close();
});

test('long holding name and large quantity and won amounts never overlap columns',async({page},info)=>{
 const f=await setup(page),dashboard=(await f.read('/accounts/1/dashboard')).body.data;
 const holdings=[{securityId:'1',symbol:'000001',name:'아주 긴 보유종목 이름 주식회사 테스트',quantity:'999999999',averagePurchasePrice:'99999999',purchaseAmount:'99999999999999',currentPrice:'100000000',marketValue:'999999999999999',unrealizedProfitLoss:'99999999999',unrealizedReturnRate:'12345.6'}];
 await page.route('**/api/pages/home**',r=>r.fulfill({json:{data:{accounts:[{id:'1',name:'기본',isActive:true,isDefault:true}],accountId:'1',dashboard:{...dashboard,holdings},recent:{data:[],meta:{count:0,total:0,more:false}},targets:{data:[],meta:{total:0}}}}}));
 await page.goto('/');const row=page.getByTestId('home-holding');await expect(row).toHaveCount(1);const cells=row.locator(':scope > div > div');
 const boxes=await cells.evaluateAll(ns=>ns.map(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,width:n.clientWidth,scroll:n.scrollWidth,style:getComputedStyle(n).whiteSpace})));
 for(const i of [0,3]){expect(boxes[i].right).toBeLessThanOrEqual(boxes[i+1].left);expect(boxes[i+1].right).toBeLessThanOrEqual(boxes[i+2].left);}
 expect(boxes[0].style).toBe('nowrap');for(const i of [1,2,4,5])expect(boxes[i].scroll).toBeLessThanOrEqual(boxes[i].width+1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await row.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('home-large.png'),fullPage:true});
});
