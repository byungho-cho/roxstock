import { expect, test, type Page } from '@playwright/test';
async function fixture(page: Page) {
  let account={id:'1',name:'기본 계좌',brokerName:'증권사',accountNumber:'1234',isActive:true,isDefault:true,cashBalance:'203200000',updatedAt:'2026-10-02T00:00:00Z'};
  let conditions=[{days:7,rate:'5'},{days:30,rate:'10'},{days:90,rate:'15'}];let version=1;
  const writes:{path:string;body:any}[]=[];
  let fail=false;
  await page.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    if(req.method()!=='GET') {
      const body=req.postDataJSON();writes.push({path,body});
      if(fail || path.endsWith('/reset'))return route.fulfill({status:500,json:{error:{code:'TEST_FAILURE',message:'테스트 저장 실패'}}});
      if(path.endsWith('/target-arrival-conditions')){conditions=body.conditions;version++;return route.fulfill({json:{data:{accountId:'1',scope:'ACCOUNT',conditions,version}}});}
      if(path.endsWith('/cash-balance'))account.cashBalance=body.amount;
      else if(path==='/api/accounts/1')account={...account,...body};
      return route.fulfill({json:{data:account}});
    }
    if(path==='/api/accounts')return route.fulfill({json:{data:[account]}});
    if(path.endsWith('/target-arrival-conditions'))return route.fulfill({json:{data:{accountId:'1',scope:'ACCOUNT',conditions,version}}});
    if(path==='/api/collection/status')return route.fulfill({json:{data:{latestRun:{id:'1',status:'SUCCESS',startedAt:'2026-10-02T00:00:00Z',finishedAt:'2026-10-02T00:00:01Z',failureCount:0,successCount:3,failureReason:null},latestPriceAt:'2026-10-02T00:00:01Z',manualRunAvailable:false,settingsAvailable:false}}});
    return route.fulfill({status:503,json:{error:{message:'조회 실패'}}});
  });
  return {writes,fail:()=>{fail=true;},succeed:()=>{fail=false;}};
}
const menuLabels=['계좌 관리','목표가 도래 조건','시세 수집','테마 설정'];
test('settings layout: fixed menu, padding, shared forms and detail scrolling',async({page},info)=>{
  await fixture(page);await page.goto('/detail/settings?view=settings');
  const menu=page.getByTestId('settings-menu');await expect(menu.getByRole('button')).toHaveCount(4);
  for(const label of menuLabels)await expect(menu.getByRole('button',{name:new RegExp('^'+label)})).toBeVisible();
  const tablet=info.project.name.startsWith('tablet');
  const main=await page.locator('main').evaluate(n=>{const s=getComputedStyle(n);return [s.paddingTop,s.paddingLeft,s.paddingRight];});expect(main).toEqual(['0px','8px','8px']);
  expect((await page.locator('header').boundingBox())!.height).toBe(44);
  if(tablet){const detail=page.getByTestId('settings-detail');const m=await menu.boundingBox(),d=await detail.boundingBox();expect(d!.x-m!.x-m!.width).toBe(16);expect(d!.y).toBe(44);expect(await detail.evaluate(n=>{const s=getComputedStyle(n);return [s.paddingTop,s.paddingLeft,s.paddingRight];})).toEqual(['0px','0px','0px']);await expect(menu.getByRole('button').first()).toHaveAttribute('aria-current','page');await detail.evaluate(n=>n.scrollTop=100);expect((await menu.boundingBox())!.y).toBe(44);expect(await page.locator('main').evaluate(n=>n.scrollTop)).toBe(0);}
  await page.screenshot({path:`test-results/targets/settings-layout-${info.project.name}.png`});
  await menu.getByRole('button',{name:/^계좌 관리/}).click();await page.getByRole('button',{name:'계좌 정보 수정',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'계좌명',exact:true})).toBeVisible();if(tablet)await expect(menu.getByRole('button').first()).toHaveAttribute('aria-current','page');else await expect(menu).toBeHidden();
  const clear=page.getByRole('button',{name:'계좌명 지우기'});await expect(clear.locator('img')).toHaveJSProperty('naturalWidth',16);
  await expect(page.getByRole('switch',{name:'기본 계좌로 사용'})).toHaveAttribute('aria-checked','true');
  expect(await page.locator('img[src="/settings-v03/switch-on.svg"]').evaluate((n:HTMLImageElement)=>[n.naturalWidth,n.naturalHeight,n.getBoundingClientRect().width,n.getBoundingClientRect().height])).toEqual([42,24,42,24]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('account edits: empty disabled, Enter focus, failure preserves and success updates',async({page})=>{
  const f=await fixture(page);await page.goto('/detail/settings?view=edit');const name=page.getByRole('textbox',{name:'계좌명',exact:true});await expect(name).toHaveValue('기본 계좌');
  await name.fill('');await expect(page.getByRole('button',{name:'변경',exact:true})).toBeDisabled();await name.fill('변경 계좌');await name.press('Enter');await expect(page.getByRole('textbox',{name:'증권사',exact:true})).toBeFocused();
  f.fail();await page.getByRole('button',{name:'변경',exact:true}).click();await expect(page.getByRole('alert')).toContainText('테스트 저장 실패');await expect(name).toHaveValue('변경 계좌');expect(f.writes).toHaveLength(1);
  f.succeed();await page.getByRole('button',{name:'변경',exact:true}).click();await expect(page).toHaveURL(/view=account$/);await expect(page.getByText('변경 계좌',{exact:true})).toBeVisible();expect(f.writes[1].body.name).toBe('변경 계좌');
});
test('cash correction: empty cannot become zero; failure preserves and valid amount saves',async({page})=>{
  const f=await fixture(page);await page.goto('/detail/settings?view=cash');const field=page.getByRole('textbox',{name:'변경 예수금',exact:true});await expect(field).toHaveValue('203,200,000');await field.fill('');await field.press('Enter');await expect(page.getByRole('button',{name:'변경',exact:true})).toBeDisabled();expect(f.writes).toHaveLength(0);
  await field.fill('205000000');f.fail();await field.press('Enter');await expect(page.getByRole('alert')).toContainText('테스트 저장 실패');await expect(field).toHaveValue('205,000,000');f.succeed();await page.getByRole('button',{name:'변경',exact:true}).click();await expect(page).toHaveURL(/view=account$/);expect(f.writes[1].body.amount).toBe('205000000');
});
test('target conditions: centered delete, cancel keeps list, draft only then save; inline validation',async({page},info)=>{
  const f=await fixture(page);await page.goto('/detail/settings?view=target-arrival');await expect(page.getByRole('button',{name:'삭제',exact:true})).toHaveCount(3);await page.getByRole('button',{name:'삭제',exact:true}).first().click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();const r=await dialog.boundingBox(),v=page.viewportSize()!;expect(r!.x+r!.width/2).toBeCloseTo(v.width/2,0);expect(r!.y+r!.height/2).toBeCloseTo(v.height/2,0);
  await page.screenshot({path:`test-results/targets/settings-delete-${info.project.name}.png`});await dialog.getByRole('button',{name:'취소'}).click();await expect(page.getByRole('button',{name:'삭제',exact:true})).toHaveCount(3);
  await page.getByRole('button',{name:'삭제',exact:true}).first().click();await dialog.getByRole('button',{name:'삭제',exact:true}).click();await expect(page.getByRole('button',{name:'삭제',exact:true})).toHaveCount(2);expect(f.writes).toHaveLength(0);
  f.fail();await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByRole('alert')).toContainText('테스트 저장 실패');f.succeed();await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByText('저장했습니다. 홈 목록을 갱신했습니다.')).toBeVisible();expect(f.writes[1].body.conditions).toEqual([{days:30,rate:'10'},{days:90,rate:'15'}]);
  await page.getByRole('button',{name:'조건 추가',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);const days=page.getByRole('textbox',{name:'보유기간 상한',exact:true}),rate=page.getByRole('textbox',{name:'목표수익률',exact:true});await expect(days).toBeFocused();await days.fill('30');await days.press('Enter');await expect(rate).toBeFocused();await rate.fill('12');await expect(page.getByRole('button',{name:'등록',exact:true})).toBeDisabled();await days.fill('120');await rate.press('Enter');await expect(page.getByRole('button',{name:'삭제',exact:true})).toHaveCount(3);expect(f.writes).toHaveLength(2);
});
test('collection unsupported controls, theme persistence and reset failure stay in detail',async({page},info)=>{
  const f=await fixture(page);await page.goto('/detail/settings?view=collection');await expect(page.getByRole('button',{name:'지금 수집 · 서버 미지원'})).toBeDisabled();await page.goto('/detail/settings?view=theme');const theme=page.getByRole('button',{name:/^라이트/});await theme.click();await expect(theme).toHaveAttribute('aria-pressed','true');await page.reload();await expect(page.getByRole('button',{name:/^라이트/})).toHaveAttribute('aria-pressed','true');
  await page.goto('/detail/settings?view=reset');const input=page.getByRole('textbox',{name:'계좌명 입력'});await input.fill('틀린 이름');await expect(page.getByRole('button',{name:'계좌 데이터 초기화',exact:true})).toBeDisabled();await input.fill('기본 계좌');await input.press('Enter');await expect(page.getByRole('alert')).toContainText('테스트 저장 실패');expect(f.writes).toHaveLength(1);if(info.project.name.startsWith('tablet'))await expect(page.getByTestId('settings-menu').getByRole('button').first()).toHaveAttribute('aria-current','page');
});
