import {test,expect} from './authenticated-test';
for(const screen of ['value','financials'] as const){
 test(`${screen}: dismiss error toast and retry`,async({page})=>{
  await page.route('**/api/pages/read',r=>r.fulfill({status:404,body:''}));
  let fail=true,calls=0;
  const endpoint=screen==='value'?'value-analysis':'financial-statements';
  await page.route(`**/api/${endpoint}?*`,async r=>{calls++;await r.fulfill(fail?{status:500,json:{error:{code:'TEST_ERROR',message:'조회 실패'}}}:{json:{data:{rows:[],total:0,year:2026,market:'KOSPI',query:'',navigation:[]}}});});
  await page.goto(`/detail/${screen}?centerYear=2025`);
  const toast=page.locator('.MuiSnackbar-root [role="alert"]');
  await expect(toast).toBeVisible({timeout:20000});
  expect(await toast.evaluate(el=>{const b=el.getBoundingClientRect(),nav=document.querySelector('[aria-label="하단 메뉴"]')?.getBoundingClientRect();return b.left>=16&&Math.abs(b.left-(innerWidth-b.right))<1&&b.top>=44&&b.bottom<=(nav?.top??innerHeight)-10;})).toBe(true);
  await toast.getByRole('button',{name:'오류 알림 닫기'}).click();await expect(toast).toHaveCount(0);
  await page.waitForTimeout(300);await expect(toast).toHaveCount(0);
  fail=false;const before=calls;await page.getByRole('button',{name:'다시 시도',exact:true}).first().click();
  await expect.poll(()=>calls).toBeGreaterThan(before);await expect(page.getByRole('button',{name:'다시 시도',exact:true})).toHaveCount(0);await expect(toast).toHaveCount(0);
  fail=true;await page.reload();await expect(toast).toBeVisible();fail=false;await toast.getByRole("button",{name:"재시도",exact:true}).click();await expect(toast).toHaveCount(0);await expect(page.getByRole("button",{name:"다시 시도",exact:true})).toHaveCount(0);
 });
}

