import {test,expect,type Page} from '@playwright/test';
import {writeFileSync} from 'node:fs';import {fixture} from './phase3-fixture';
const at='2026-10-12T00:00:00Z';
const stock=(id:number)=>({id:String(id),symbol:'X23'+String(id).padStart(3,'0'),name:'검증종목'+String(id).padStart(3,'0'),marketType:'OTHER',listingYear:2020,registrationSource:'MANUAL',canCorrectCode:true,isActive:true,collectionExcluded:false,excludedFeatures:[] as string[],automaticExclusion:false,exclusionReason:null as string|null,collectionRevision:0,deleteBlockedReasons:[] as string[]});
async function setup(page:Page,total=105){
 await fixture(page);const securities=Array.from({length:total},(_,i)=>stock(i+1));const reads:{kind:string;cursor:string|null;query:string;result:string|null;runId:string|null}[]=[],writes:any[]=[];let failSave=false;
 await page.route('**/downloads/android/latest.json',r=>r.fulfill({json:{version:'0.1.0',updatedAt:'2026-10-12',url:'/downloads/android/roxstock-0.1.0.apk'}}));
 await page.route('**/downloads/android/*.apk',r=>r.fulfill({body:'phase23 download fixture',contentType:'application/vnd.android.package-archive'}));
 await page.route('**/api/security-management**',async r=>{
  const u=new URL(r.request().url()),id=Number(u.pathname.split('/')[3]),s=securities.find(s=>Number(s.id)===id);
  if(r.request().method()!=='GET'){
   const body=r.request().postDataJSON();writes.push({method:r.request().method(),id,...body});
   if(failSave)return r.fulfill({status:503,json:{error:{message:'설정 저장 실패'}}});
   if(u.pathname.endsWith('collection')){if(body.feature==='ALL')s!.collectionExcluded=body.excluded;else s!.excludedFeatures=body.excluded?[body.feature]:[];s!.collectionRevision++;s!.exclusionReason=body.excluded?'사용자 설정: 해당 기능 수집 제외':null;}
   else if(r.request().method()==='DELETE'){return r.fulfill({json:{data:{deleted:true}}});}
   else{Object.assign(s!,body);s!.collectionRevision++;}
   return r.fulfill({json:{data:s}});
  }
  if(id)return r.fulfill({json:{data:s}});
  const cursor=u.searchParams.get('cursor'),query=u.searchParams.get('query')??'';reads.push({kind:'master',cursor,query,result:null,runId:null});
  const selected=securities.filter(s=>s.name.includes(query)||s.symbol.includes(query)),start=Number(cursor??0),rows=selected.slice(start,start+50);
  return r.fulfill({json:{data:{rows,hasNext:start+50<selected.length,nextCursor:start+50<selected.length?String(start+50):null}}});
 });
 await page.route('**/api/collection/monitoring**',async r=>{
  const u=new URL(r.request().url()),stream=u.pathname.split('/').at(-1)!,s=securities[0]!;
  if(stream==='monitoring')return r.fulfill({json:{data:{generatedAt:at,features:[{id:'realtime-prices',name:'실시간 주가',status:'PARTIAL',resultScope:{runId:'23',label:'최근 실행 대상 결과',startedAt:at},recent:{target:2,success:1,failed:1,skipped:0},realtime:{session:'REGULAR'}}]}}});
  if(!['items','runs'].includes(stream))return r.fulfill({json:{data:{}}});
  const result=u.searchParams.get('result'),limit=Number(u.searchParams.get('limit'));reads.push({kind:stream,cursor:u.searchParams.get('cursor'),query:'',result,runId:u.searchParams.get('runId')});
  const item={id:'23',symbol:s.symbol,security:s,status:result==='SUCCESS'?'SUCCESS':'FAILED',reason:'원천 가격 제공 지연 · '+('오류 안내 '.repeat(50)),occurredAt:at};
  return r.fulfill({json:{data:{rows:stream==='items'?[item]:[{id:'23',status:'PARTIAL',startedAt:at,target:2,success:1,failed:1,skipped:0}],hasNext:false,nextCursor:null}}});
 });
 return {securities,reads,writes,setFail(value:boolean){failSave=value;}};
}
test('success/failure counts open exactly the same run/status, safe failure details and reversible server-confirmed exclusions',async({page},info)=>{
 const f=await setup(page);await page.goto('/detail/collection-monitoring/realtime-prices');
 await page.getByRole('button',{name:'성공 대상 목록'}).click();await expect(page).toHaveURL(/items\?result=SUCCESS&runId=23/);await expect(page.getByTestId('monitor-target-row')).toContainText('검증종목001(X23001)');expect(f.reads.at(-1)).toMatchObject({kind:'items',result:'SUCCESS',runId:'23'});
 await page.goBack();await page.getByRole('button',{name:'실패 대상 목록'}).click();await expect(page).toHaveURL(/result=FAILED&runId=23/);await expect(page.getByTestId('monitor-target-row')).toContainText('원천 가격 제공 지연');await page.getByText('상세내용',{exact:true}).click();await expect(page.getByTestId('monitor-target-row')).toContainText('오류 안내');
 const exclude=page.getByRole('button',{name:'실시간 주가 수집 제외'});await exclude.click();await expect(page.getByRole('dialog')).toContainText('수집에서 제외하시겠습니까?');await page.getByRole('button',{name:'취소',exact:true}).click();expect(f.writes).toHaveLength(0);
 await exclude.click();f.setFail(true);await page.getByRole('button',{name:'제외',exact:true}).click();await expect(page.getByRole('alert')).toContainText('설정 저장 실패');await page.getByRole('button',{name:'취소',exact:true}).click();await expect(exclude).toBeEnabled();
 f.setFail(false);await exclude.click();await page.getByRole('button',{name:'제외',exact:true}).click();await expect(page.getByRole('button',{name:'실시간 주가 재활성화'})).toBeVisible();await expect(page.getByTestId('monitor-target-row')).toHaveCount(1);await page.getByRole('button',{name:'실시간 주가 재활성화'}).click();await expect(exclude).toBeVisible();
 await page.screenshot({path:info.outputPath('monitor-failed-after.png')});writeFileSync(info.outputPath('monitor-api.json'),JSON.stringify({viewport:page.viewportSize(),reads:f.reads,writes:f.writes},null,2));
});
test('Z99 automatic exclusions cannot be reactivated from a retained failed row',async({page})=>{
 const f=await setup(page);Object.assign(f.securities[0]!,{symbol:'Z99001',automaticExclusion:true,exclusionReason:'Z99 코드: 모든 외부 수집에서 자동 제외'});
 await page.goto('/detail/collection-monitoring/realtime-prices/items?result=FAILED&runId=23');await expect(page.getByRole('button',{name:'Z99 코드 · 자동 수집 제외'})).toBeDisabled();await expect(page.getByTestId('monitor-target-row')).toContainText('Z99 코드');expect(f.writes).toHaveLength(0);
});
test('master loads 50+50+5, protects duplicate clicks and uses only the body scroll',async({page},info)=>{
 const f=await setup(page);await page.goto('/detail/security-management');const rows=page.getByTestId('security-master-row');await expect(rows).toHaveCount(50);await expect(page.getByRole('navigation',{name:'하단 메뉴'}).getByRole('button',{name:'설정',exact:true})).toHaveAttribute('aria-current','page');await page.locator('main').getByRole('button',{name:'더보기',exact:true}).evaluate((b:HTMLButtonElement)=>{b.click();b.click();});await expect(rows).toHaveCount(100);await page.locator('main').getByRole('button',{name:'더보기',exact:true}).click();await expect(rows).toHaveCount(105);await expect(page.locator('main').getByRole('button',{name:'더보기',exact:true})).toHaveCount(0);
 expect(f.reads.filter(r=>r.kind==='master').map(r=>r.cursor)).toEqual([null,'50','100']);expect(await page.locator('main').evaluate(n=>[...n.querySelectorAll('*')].filter(e=>['auto','scroll'].includes(getComputedStyle(e).overflowY)).length)).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('master-after.png')});writeFileSync(info.outputPath('master-api.json'),JSON.stringify({viewport:page.viewportSize(),reads:f.reads},null,2));
});
test('search does not autofocus, composition Enter does not search, normal Enter executes and closes focus',async({page})=>{
 const f=await setup(page);await page.goto('/detail/security-management');await expect(page.getByTestId('security-master-row')).toHaveCount(50);const input=page.getByRole('textbox',{name:'종목 관리 검색'});
 expect(await input.evaluate(n=>n===document.activeElement)).toBe(false);await input.fill('검증종목001');const before=f.reads.length;
 await input.evaluate(n=>n.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true})));expect(f.reads.length).toBe(before);await input.press('Enter');await expect(page.getByTestId('security-master-row')).toHaveCount(1);expect(await input.evaluate(n=>n===document.activeElement)).toBe(false);
});
test('verified manual code correction has the exact warning, preserves leading zero and reports save failure',async({page},info)=>{
 const f=await setup(page);await page.goto('/detail/security-management?selected=1');await expect(page.getByLabel('종목코드',{exact:true})).toBeEnabled();await page.getByLabel('종목코드',{exact:true}).fill(' 0163y0 ');await page.getByRole('button',{name:'정보 저장'}).click();const dialog=page.getByRole('dialog');
 for(const line of ['종목코드를 변경하시겠습니까?','변경 이후 수집은 새 코드를 사용합니다.','변경 전 수집 자료는 새 코드 기준으로 변환하거나 재연결하지 않습니다.','Z99로 시작하는 코드는 모든 수집에서 제외됩니다.'])await expect(dialog).toContainText(line);
 await page.getByRole('button',{name:'취소',exact:true}).click();expect(f.writes).toHaveLength(0);await page.getByRole('button',{name:'정보 저장'}).click();f.setFail(true);await dialog.getByRole('button',{name:'저장',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('설정 저장 실패');f.setFail(false);await dialog.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByLabel('종목코드',{exact:true})).toHaveValue('0163Y0');expect(f.writes.at(-1)).toMatchObject({symbol:'0163Y0',confirmCodeChange:true});await expect(dialog).toBeHidden();await page.screenshot({path:info.outputPath('manual-edit-after.png')});
});
test('DART/unknown codes remain immutable, used security deletion is disabled and information stays editable',async({page})=>{
 const f=await setup(page);Object.assign(f.securities[0]!,{registrationSource:'DART',canCorrectCode:false,deleteBlockedReasons:['보유·거래내역']});await page.goto('/detail/security-management?selected=1');await expect(page.getByLabel('종목코드',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'종목 삭제'})).toBeDisabled();await expect(page.getByRole('button',{name:'정보 저장'})).toBeEnabled();await expect(page.getByText(/보유·거래내역에서 사용 중/)).toBeVisible();
});
test('settings stock-management menu follows theme, whole APK link downloads and is shorter than current main',async({page},info)=>{
 await setup(page);await page.goto('http://127.0.0.1:3024/detail/settings?view=settings');const before=page.getByRole('link',{name:'APK 다운로드',exact:true});await expect(before).toBeAttached();const beforeHeight=await before.locator('..').evaluate(n=>n.getBoundingClientRect().height);await before.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('apk-before.png')});
 await page.goto('/detail/settings?view=settings');const menu=page.getByRole('navigation',{name:'설정 메뉴'});await expect(menu.getByRole('button',{name:/종목 관리/})).toBeAttached();const titles=await menu.getByRole('button').allTextContents();expect(titles.findIndex(t=>t.includes('종목 관리'))).toBeGreaterThan(titles.findIndex(t=>t.includes('테마 설정')));
 const link=page.getByRole('link',{name:'APK 다운로드',exact:true});await expect(link).toHaveAttribute('href','/downloads/android/roxstock-0.1.0.apk');await expect(link.getByRole('button')).toHaveCount(0);const afterHeight=await link.evaluate(n=>n.getBoundingClientRect().height);expect(afterHeight).toBeLessThan(beforeHeight);await link.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('apk-after.png')});await link.focus();const download=page.waitForEvent('download');await page.keyboard.press('Enter');expect((await download).suggestedFilename()).toBe('roxstock-0.1.0.apk');
 writeFileSync(info.outputPath('apk-height.json'),JSON.stringify({viewport:page.viewportSize(),beforeHeight,afterHeight,keyboardDownload:true,nativeKeyboardWebView:false},null,2));
});
