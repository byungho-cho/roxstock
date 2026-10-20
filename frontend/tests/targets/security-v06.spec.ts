import {test,expect,type Page} from './authenticated-test';
import {writeFileSync} from 'node:fs';
import {fixture} from './phase3-fixture';
const features=['realtime-prices','market-prices','dart-financial-statements','share-counts','consensus','valuation','security-master'];
async function setup(page:Page,kind:'DART'|'MANUAL'|'Z99'|'MIXED'|'OFF'='DART'){
 await fixture(page);
 const s={id:'1',symbol:kind==='Z99'?'Z99001':'005930',name:kind==='Z99'?'스페이스 X':'삼성전자',marketType:'KOSPI',listingYear:2026,isActive:true,registrationSource:['Z99','MANUAL'].includes(kind)?'MANUAL':'DART',canCorrectCode:['Z99','MANUAL'].includes(kind),collectionExcluded:kind==='OFF',excludedFeatures:kind==='MIXED'?['consensus']:[] as string[],automaticExclusion:kind==='Z99',exclusionReason:kind==='Z99'?'Z99 코드: 모든 외부 수집에서 자동 제외':null,collectionRevision:0,deleteBlockedReasons:['보유·거래내역']};
 const writes:any[]=[],reads:string[]=[];let failure:'none'|'before'|'after'|'lost'='none',hold=false,readFailure=false;let release:(()=>void)|undefined;
 await page.route('**/api/security-management**',async r=>{
  const path=new URL(r.request().url()).pathname;
  if(r.request().method()==='GET'){reads.push(path);if(readFailure&&path.endsWith('/1'))return r.fulfill({status:503,json:{error:{message:'조회 실패'}}});return r.fulfill({json:{data:path.endsWith('/1')?{...s}:{rows:[{...s}],hasNext:false,nextCursor:null}}});}
  const body=r.request().postDataJSON();writes.push(body);
  if(hold)await new Promise<void>(resolve=>{release=resolve;});
  if(failure!=='before'){
   if(body.feature==='ALL'){s.collectionExcluded=body.excluded;if(body.allFeatures)s.excludedFeatures=body.excluded?[...features]:[];}
   else if(body.restoreGlobal){if(s.collectionExcluded)s.excludedFeatures=[...features];s.collectionExcluded=false;s.excludedFeatures=s.excludedFeatures.filter(f=>f!==body.feature);}
   else if(body.excluded)s.excludedFeatures=[...new Set([...s.excludedFeatures,body.feature])];
   else s.excludedFeatures=s.excludedFeatures.filter(f=>f!==body.feature);
   s.collectionRevision++;
  }
  if(failure==='lost')return r.abort('failed');
  if(failure!=='none')return r.fulfill({status:503,json:{error:{message:'설정 저장 실패'}}});
  return r.fulfill({json:{data:{...s}}});
 });
 return {s,writes,reads,failRead(value:boolean){readFailure=value;},fail(mode:typeof failure){failure=mode;},hold(){hold=true;},release(){hold=false;release?.();}};
}
const card=(page:Page)=>page.getByTestId('collection-settings-card');
const master=(page:Page)=>card(page).getByRole('switch',{name:/^전체 수집/,includeHidden:true});
async function open(page:Page){await page.goto('/detail/security-management?selected=1');await expect(card(page)).toBeVisible();}
test('Figma geometry and one-body scrolling preserve every control and footer',async({page},info)=>{
 await setup(page);await open(page);await expect(page.getByRole('heading',{name:'종목 정보 수정'})).toBeVisible();await expect(page.getByLabel('종목코드',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'종목 삭제'})).toBeDisabled();expect((await page.getByRole('button',{name:'종목 삭제'}).boundingBox())!.height).toBe(36);expect((await page.getByRole('button',{name:'정보 저장'}).boundingBox())!.height).toBe(36);expect((await page.getByRole('heading',{name:'종목 정보 수정'}).boundingBox())!.x).toBe(36);expect(await page.getByRole('button',{name:'정보 저장'}).evaluate(n=>[getComputedStyle(n).backgroundColor,getComputedStyle(n).color])).toEqual(['rgb(59, 130, 246)','rgb(248, 250, 252)']);
 expect(await page.getByLabel('종목명',{exact:true}).evaluate(n=>n.closest('.MuiFormControl-root')!.getBoundingClientRect().height)).toBe(36);
 const rows=card(page).getByTestId('collection-setting-row');await expect(rows).toHaveCount(8);await expect(card(page).getByRole('switch')).toHaveCount(9);
 const metrics=await rows.evaluateAll(nodes=>nodes.map(n=>{const row=n.getBoundingClientRect(),button=n.querySelector('button')!.getBoundingClientRect(),track=n.querySelector('[data-testid="collection-switch-track"]')!.getBoundingClientRect(),thumb=n.querySelector('[data-testid="collection-switch-thumb"]')!.getBoundingClientRect();return {rowHeight:row.height,rowTop:row.top,buttonWidth:button.width,buttonHeight:button.height,right:track.right,trackWidth:track.width,trackHeight:track.height,thumbWidth:thumb.width,thumbHeight:thumb.height};}));
 for(const [i,m] of metrics.entries()){expect(m.rowHeight).toBe(24);expect(m.buttonHeight).toBe(24);expect(m.buttonWidth).toBe(44);expect(m.trackWidth).toBe(36);expect(m.trackHeight).toBe(20);expect(m.thumbWidth).toBe(16);expect(m.thumbHeight).toBe(16);expect(m.right).toBe(metrics[0].right);if(i)expect(m.rowTop-metrics[i-1].rowTop).toBe(28);}
 const infoBox=page.getByText('종목 정보',{exact:true});const settingsBox=card(page);expect((await settingsBox.boundingBox())!.x>(await infoBox.boundingBox())!.x).toBe(info.project.name==='tablet');
 expect(await page.locator('main').evaluate(n=>[...n.querySelectorAll('*')].filter(e=>['auto','scroll'].includes(getComputedStyle(e).overflowY)).length)).toBe(0);
 await page.screenshot({path:info.outputPath('editor-top.png')});await card(page).getByTestId('collection-setting-guide').scrollIntoViewIfNeeded();await expect(card(page).getByTestId('collection-setting-guide')).toBeInViewport();await expect(card(page).getByRole('switch',{name:'종목 마스터 활성'})).toBeInViewport();
 const header=page.locator('header');const footer=page.getByRole('navigation',{name:'하단 메뉴'});expect((await footer.boundingBox())!.height).toBe(44);if(await header.count())expect((await header.boundingBox())!.height).toBe(44);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:info.outputPath('editor-settings.png')});
 writeFileSync(info.outputPath('geometry.json'),JSON.stringify({viewport:page.viewportSize(),metrics,bodyScrollTop:await page.locator('main').evaluate(n=>n.scrollTop)},null,2));
});
test('whole ON to OFF and OFF to ON require confirmation, cancel is unchanged, cache survives reload',async({page})=>{
 const f=await setup(page);await open(page);await master(page).click();await expect(page.getByRole('dialog')).toContainText('전체 수집을 비활성화하시겠습니까?');await page.getByRole('button',{name:'취소',exact:true}).click();expect(f.writes).toHaveLength(0);await expect(master(page)).toHaveAttribute('aria-checked','true');
 await master(page).click();await page.getByRole('button',{name:'확인',exact:true}).click();await expect(master(page)).toHaveAttribute('aria-checked','false');expect(f.writes.at(-1)).toMatchObject({feature:'ALL',excluded:true,allFeatures:true,confirmed:true});
 await master(page).click();await expect(page.getByRole('dialog')).toContainText('전체 수집을 활성화하시겠습니까?');await page.getByRole('button',{name:'확인',exact:true}).click();await expect(master(page)).toHaveAttribute('aria-checked','true');await page.reload();await expect(master(page)).toHaveAttribute('aria-checked','true');expect(f.reads.filter(p=>p.endsWith('/1')).length).toBeGreaterThan(2);
});
test('mixed state activates all functions atomically and supports keyboard',async({page},info)=>{
 const f=await setup(page,'MIXED');await open(page);const mixed=card(page).getByRole('checkbox',{name:'전체 수집 혼합 상태 · 전체 활성화'});await expect(mixed).toHaveAttribute('aria-checked','mixed');await page.screenshot({path:info.outputPath('mixed-state.png')});await mixed.focus();await page.keyboard.press('Space');await expect(page.getByRole('dialog')).toContainText('전체 수집을 활성화하시겠습니까?');await expect(page.getByRole('dialog')).toContainText('모든 개별 항목을 활성화');await page.getByRole('button',{name:'확인',exact:true}).click();await expect(master(page)).toHaveAttribute('aria-checked','true');expect(f.writes).toHaveLength(1);expect(f.s.excludedFeatures).toEqual([]);await page.screenshot({path:info.outputPath('mixed-activated.png')});
});
test('individual OFF confirms, cancellation and direct reactivation retain existing policies',async({page})=>{
 const f=await setup(page);await open(page);await card(page).getByRole('switch',{name:'컨센서스 활성',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('수집에서 제외하시겠습니까?');await page.getByRole('button',{name:'취소',exact:true}).click();expect(f.writes).toHaveLength(0);
 await card(page).getByRole('switch',{name:'컨센서스 활성',exact:true}).click();await page.getByRole('button',{name:'확인',exact:true}).click();await expect(card(page).getByRole('switch',{name:'컨센서스 비활성',exact:true})).toHaveAttribute('aria-checked','false');await card(page).getByRole('switch',{name:'컨센서스 비활성',exact:true}).click();await expect(card(page).getByRole('switch',{name:'컨센서스 활성',exact:true})).toHaveAttribute('aria-checked','true');expect(f.writes.map(w=>w.excluded)).toEqual([true,false]);
});
test('Z99 keeps all switches disabled OFF and reason below the final separator',async({page},info)=>{
 const f=await setup(page,'Z99');await open(page);for(const sw of await card(page).getByRole('switch').all()){await expect(sw).toBeDisabled();await expect(sw).toHaveAttribute('aria-checked','false');}
 await expect(page.getByLabel('종목코드',{exact:true})).toBeEnabled();await card(page).getByTestId('collection-setting-guide').scrollIntoViewIfNeeded();await expect(card(page).getByTestId('collection-setting-guide')).toContainText('Z99 코드 · 전체 수집 자동 제외');expect(f.writes).toHaveLength(0);await page.screenshot({path:info.outputPath('automatic-exclusion.png')});
});
test('failed save reloads the actual server state, including uncertain successful commit',async({page})=>{
 const f=await setup(page);await open(page);f.fail('before');await master(page).click();await page.getByRole('button',{name:'확인',exact:true}).click();await expect(page.getByRole('dialog').getByRole('alert')).toContainText('서버 상태를 다시 조회');await expect(master(page)).toHaveAttribute('aria-checked','true');await page.getByRole('button',{name:'취소',exact:true}).click();
 f.fail('after');await master(page).click();await page.getByRole('button',{name:'확인',exact:true}).click();await expect(master(page)).toHaveAttribute('aria-checked','false');await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'취소',exact:true}).click();await expect(master(page)).toHaveAttribute('aria-checked','false');
});
test('pending whole save blocks duplicate submissions and individual changes',async({page})=>{
 const f=await setup(page);await open(page);f.hold();await master(page).click();const confirm=page.getByRole('button',{name:'확인',exact:true});await confirm.evaluate((b:HTMLButtonElement)=>{b.click();b.click();});await expect(master(page)).toBeDisabled();await expect(card(page).getByRole('switch',{name:'컨센서스 활성',exact:true,includeHidden:true})).toBeDisabled();await expect.poll(()=>f.writes.length).toBe(1);f.release();await expect(master(page)).toBeEnabled();await expect(master(page)).toHaveAttribute('aria-checked','false');
});


test('individual activation behind whole OFF changes only the selected function',async({page})=>{
 const f=await setup(page,'OFF');await open(page);await card(page).getByRole('switch',{name:'컨센서스 비활성',exact:true}).click();
 await expect(card(page).getByRole('switch',{name:'컨센서스 활성',exact:true})).toHaveAttribute('aria-checked','true');
 await expect(card(page).getByRole('switch',{name:'주식수 비활성',exact:true})).toHaveAttribute('aria-checked','false');
 expect(f.writes).toEqual([{feature:'consensus',excluded:false,restoreGlobal:true,confirmed:true}]);expect(f.s.excludedFeatures).toEqual(features.filter(v=>v!=='consensus'));
});

test('lost save response followed by failed GET locks settings until retry reconciles actual state',async({page})=>{
 const f=await setup(page);await open(page);f.fail('lost');f.failRead(true);await master(page).click();await page.getByRole('button',{name:'확인',exact:true}).click();
 await expect(page.getByRole('dialog').getByRole('alert')).toContainText('저장 결과를 확인할 수 없습니다');await expect(master(page)).toBeDisabled();await expect(page.getByRole('button',{name:'확인',exact:true})).toBeDisabled();
 f.failRead(false);await page.getByRole('dialog').getByRole('button',{name:'서버 상태 다시 조회'}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(master(page)).toBeEnabled();await expect(master(page)).toHaveAttribute('aria-checked','false');expect(f.writes).toHaveLength(1);
});

test('long security name wraps and all information guidance follows equal-width action buttons',async({page},info)=>{
 const f=await setup(page,'MANUAL');f.s.name='매우긴종목명과추가설명을포함한사용자직접등록종목'.repeat(3);await open(page);
 const name=page.getByLabel('종목명',{exact:true});await expect(name).toHaveValue(f.s.name);expect((await name.boundingBox())!.height).toBeGreaterThan(36);
 const guide=page.getByTestId('security-info-guide'),save=page.getByRole('button',{name:'정보 저장'}),remove=page.getByRole('button',{name:'종목 삭제'});
 expect((await guide.boundingBox())!.y).toBeGreaterThan((await save.boundingBox())!.y+36);expect((await save.boundingBox())!.width).toBe((await remove.boundingBox())!.width);expect((await save.boundingBox())!.x-((await remove.boundingBox())!.x+(await remove.boundingBox())!.width)).toBe(8);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await name.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('long-name.png')});
});
