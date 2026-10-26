import {test,expect} from './authenticated-test';
import {fixture as newsFixture} from './stock-news-fixture';
import {fixture as base} from './phase28-fixture';
const stamp='2026-10-20T00:02:00Z';
const state={status:'PARTIAL',updatedAt:stamp,lastAttemptAt:'2026-10-20T00:00:00Z',lastFinishedAt:stamp,lastFullSuccessAt:null,lastNewStoredAt:'2026-10-19T07:06:00Z',intervalHours:3,startTime:'06:00',anchorAt:'2026-10-19T21:00:00Z',nextAt:'2026-10-20T03:00:00Z',nextRetryAt:null,providers:[{id:'HANKYUNG_RSS',status:'PARTIAL',error:'FEED_FINANCE_WINDOW_LIMIT',attempts:1,nextRetryAt:null,gaps:[{from:'2026-10-19T00:00:00Z',to:'2026-10-19T02:00:00Z',reason:'RSS_RETENTION_LIMIT',section:'finance'}],diagnostics:{saved:0}},{id:'DART',status:'SUCCESS',error:null,attempts:1,nextRetryAt:null,gaps:[],diagnostics:{saved:0,normalExcluded:3}}]};
test('settings: 28px aligned selectors, persisted 5h minute setting, success toast and failed draft retained; status uses server times',async({page},info)=>{
 await base(page);let current={...state},fail=false,writes=0;
 await page.route('**/api/stock-news/settings',async r=>{if(r.request().method()==='PUT'){writes++;if(fail)return r.fulfill({status:503,json:{error:{message:'설정 저장 실패'}}});current={...current,...r.request().postDataJSON(),nextAt:'2026-10-20T08:17:00Z'};}await r.fulfill({json:{data:current}});});
 await page.goto('/detail/news-collection-settings');const interval=page.getByRole('combobox',{name:'수집 주기'});await expect(interval).toHaveText('3시간');
 for(const label of ['수집 주기','시작 시','시작 분'])expect((await page.getByRole('combobox',{name:label,exact:true}).boundingBox())!.height).toBe(28);
 const right=await page.getByTestId('news-interval-row').evaluate(n=>n.lastElementChild!.getBoundingClientRect().right);expect(await page.getByTestId('news-start-row').evaluate(n=>n.lastElementChild!.getBoundingClientRect().right)).toBe(right);
 await interval.click();await page.getByRole('option',{name:'5시간',exact:true}).click();await page.getByRole('combobox',{name:'시작 분'}).click();await page.getByRole('option',{name:'17',exact:true}).click();
 await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('alert')).toContainText('저장했습니다.');await expect(page.getByTestId('news-next-scheduled')).toContainText('10/20 17:17');expect(writes).toBe(1);
 await page.screenshot({path:info.outputPath('settings-figma-v12.png')});
 fail=true;await interval.click();await page.getByRole('option',{name:'24시간',exact:true}).click();await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('설정 저장 실패',{exact:true})).toBeVisible();await expect(interval).toHaveText('24시간');
 await page.goto('/detail/collection-monitoring/stock-news');await expect(page.getByTestId('news-collection-status')).toContainText('일부 구간 확인 불가');await expect(page.getByTestId('news-collection-status')).toContainText('5시간마다 · 기준 06:17 KST');await expect(page.getByTestId('news-collection-status')).toContainText('기업공시 정상 제외 3종목');await expect(page.getByTestId('news-collection-status')).not.toContainText('다음 재시도');await page.screenshot({path:info.outputPath('status-figma-v12.png')});
});
test('list labels recent confirmation and retains title tooltip; no fabricated success or retry time',async({page},info)=>{
 await newsFixture(page);await page.goto('/detail/stock-news');await expect(page.getByTestId('news-collected-at')).toHaveCount(0);await page.getByRole('button',{name:'소식 수집 상태 설명'}).click();await expect(page.getByRole('tooltip')).toContainText('일부 구간 확인 불가');await expect(page.getByRole('tooltip')).not.toContainText('다음 재시도');await page.screenshot({path:info.outputPath('list-figma-v12.png')});
});
for(const count of [0,1,5,6,7,8,14])test(`dashboard ${count} securities: matching donut, cumulative bar and Other row; natural card size`,async({page},info)=>{
 const f=await base(page,{trend:true});
 const read=async(path:string)=>{const result=await f.read(path);if(path.includes('/dashboard')){const holdings=Array.from({length:count},(_,i)=>({securityId:String(i+1),symbol:String(i+1).padStart(6,'0'),name:i===5?'현대모비스':'매우 긴 검증 종목 이름 '+i,quantity:'10',averagePurchasePrice:'100',purchaseAmount:'1000',currentPrice:'150',marketValue:String((count-i)*100),unrealizedProfitLoss:'500',unrealizedReturnRate:'50'}));result.body.data={...result.body.data,stockValue:String(count*(count+1)*50),holdings,pricingComplete:true};}return result;};
 await page.route('**/api/pages/read',async r=>r.fulfill({json:{data:await Promise.all((r.request().postDataJSON().paths as string[]).map(read))}}));
 await page.route('**/api/accounts/*/dashboard**',async r=>{const u=new URL(r.request().url());await r.fulfill({json:(await read(u.pathname.slice(4)+u.search)).body});});
 await page.goto('/detail/assets');const legends=page.getByTestId('asset-legend-row'),rows=page.getByTestId('asset-weight-row'),expected=count>7?8:count;await expect(legends).toHaveCount(expected);await expect(rows).toHaveCount(expected);
 if(count>7){await expect(legends.last()).toContainText('기타');await expect(rows.last()).toContainText('기타');}else{await expect(page.getByTestId('asset-composition-card')).not.toContainText('기타');}
 if(count>=6)await expect(legends.nth(5)).toContainText('현대모비스');
 expect(await legends.evaluateAll(nodes=>nodes.map(node=>node.children[1]!.textContent!.replace(/\(([\d.]+%)\)$/,'$1')))).toEqual(await rows.allTextContents());
 const colors=await legends.evaluateAll(ns=>ns.map(n=>getComputedStyle(n.firstElementChild!).backgroundColor));expect(new Set(colors).size).toBe(expected);
 for(let i=0;i<expected;i++)expect(await rows.nth(i).getByTestId('asset-weight-fill').evaluate(n=>getComputedStyle(n).backgroundColor)).toBe(colors[i]);
 await page.getByRole('button',{name:'종목별 비중 차트 방식 변경'}).click();await expect(rows).toHaveCount(expected);expect(await legends.evaluateAll(nodes=>nodes.map(node=>node.children[1]!.textContent!.replace(/\(([\d.]+%)\)$/,'$1')))).toEqual(await rows.allTextContents());
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(count===8||count===6)await page.screenshot({path:info.outputPath(`dashboard-${count}.png`),fullPage:true});
});

test('account and market-value rank changes rebuild one consistent composition set',async({page})=>{
 const f=await base(page,{trend:true});let reversed=false;
 const read=async(path:string)=>{const result=await f.read(path);if(path.includes('/dashboard')){const second=path.includes('/accounts/2/'),count=second?6:8;const holdings=Array.from({length:count},(_,i)=>({securityId:String(i+1),symbol:String(i+1).padStart(6,'0'),name:(second?'다른계좌':'기본계좌')+' 종목'+i,quantity:'1',averagePurchasePrice:'1',purchaseAmount:'1',currentPrice:'1',marketValue:String(reversed?i+1:count-i),unrealizedProfitLoss:'0',unrealizedReturnRate:'0'}));result.body.data={...result.body.data,accountId:second?'2':'1',stockValue:String(count*(count+1)/2),holdings,pricingComplete:true};}return result;};
 await page.route('**/api/pages/read',async r=>r.fulfill({json:{data:await Promise.all((r.request().postDataJSON().paths as string[]).map(read))}}));
 await page.route('**/api/accounts/*/dashboard**',async r=>{const u=new URL(r.request().url());await r.fulfill({json:(await read(u.pathname.slice(4)+u.search)).body});});
 await page.goto('/detail/assets');await expect(page.getByTestId('asset-legend-row')).toHaveCount(8);await expect(page.getByTestId('asset-legend-row').first()).toContainText('기본계좌 종목0');
 reversed=true;await page.reload();await expect(page.getByTestId('asset-legend-row').first()).toContainText('기본계좌 종목7');
 await page.evaluate(()=>localStorage.setItem('roxstock:user:fixture-user:selected-account-id','2'));await page.reload();await expect(page.getByTestId('asset-legend-row')).toHaveCount(6);await expect(page.getByTestId('asset-weight-row')).toHaveCount(6);await expect(page.getByTestId('asset-composition-card')).not.toContainText('기본계좌');await expect(page.getByTestId('asset-composition-card')).not.toContainText('기타');
});
