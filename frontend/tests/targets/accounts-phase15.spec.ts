import {test,expect,type Page} from '@playwright/test';

async function fixture(page:Page){
 let accounts=[{id:'1',name:'사용 계좌',isDefault:true,cashBalance:'20'},{id:'2',name:'다른 계좌 긴 이름을 표시하는 계좌',isDefault:false,cashBalance:'30'}].map(a=>({...a,brokerName:'증권사',accountNumber:'123-'+a.id,isActive:true,updatedAt:'2026-10-09T00:00:00Z'}));
 const state={hasData:false,fail:false,deleteFail:false,ratio:20,pricingComplete:true};const writes:string[]=[];
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(req.method()==='DELETE'){writes.push(path);if(state.deleteFail)return route.fulfill({status:409,json:{error:{code:'ACCOUNT_HAS_DATA',message:'연결 데이터가 추가되었습니다.'}}});accounts=accounts.filter(a=>!path.endsWith('/'+a.id));return route.fulfill({json:{data:{accountId:path.split('/').at(-1),nextAccountId:accounts[0]?.id??null}}});}
  if(path==='/api/accounts')return route.fulfill({json:{data:accounts}});
  if(path.endsWith('/data-state'))return route.fulfill(state.fail?{status:503,json:{error:{message:'상태 조회 실패'}}}:{json:{data:{hasData:state.hasData,counts:{}}}});
  if(path.endsWith('/dashboard')){const second=path.includes('/2/');return route.fulfill({json:{data:{stockValue:String(100-(second?30:state.ratio)),cashBalance:String(second?30:state.ratio),totalAssetValue:'100',purchaseAmount:'50',holdings:[],pricingComplete:state.pricingComplete}}});}
  return route.fulfill({status:503,json:{error:{message:'Fixture endpoint unavailable'}}});
 });return {state,writes};
}

test('per-account colors, stable selection border and explicit edit target',async({page},info)=>{
 await fixture(page);await page.goto('/detail/settings?view=account');
 const first=page.getByTestId('account-card-1'),second=page.getByTestId('account-card-2');
 await expect(first.getByTestId('account-cash')).toHaveCSS('color','rgb(96, 165, 250)');
 await expect(second.getByTestId('account-cash')).toHaveCSS('color','rgb(96, 165, 250)');
 await expect(first).toHaveCSS('border-top-color','rgb(250, 204, 21)');
 const width=(await second.boundingBox())!.width;
 await second.getByRole('button',{name:'선택',exact:true}).click();
 await expect(second).toHaveCSS('border-top-color','rgb(250, 204, 21)');
 await expect(second.getByRole('button',{name:'사용중'})).toHaveCSS('background-color','rgb(59, 130, 246)');
 await expect(first.getByRole('button',{name:'선택',exact:true})).toHaveCSS('background-color','rgb(30, 41, 59)');
 expect((await second.boundingBox())!.width).toBe(width);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({animations:'disabled',path:`test-results/phase15/accounts-${info.project.name}.png`});
 await first.getByRole('button',{name:/계좌 정보 수정/}).click();
 await expect(page).toHaveURL(/accountId=1/);await expect(page.getByRole('textbox',{name:'계좌명',exact:true})).toHaveValue('사용 계좌');
 await page.getByRole('textbox',{name:'계좌번호',exact:true}).fill(' - ');
 await expect(page.getByRole('button',{name:'변경',exact:true})).toBeDisabled();
});

test('empty delete popup cancellation, conflict and state refresh',async({page},info)=>{
 const f=await fixture(page);await page.goto('/detail/settings?view=edit&accountId=2');
 await page.getByRole('button',{name:'계좌 삭제',exact:true}).click();const dialog=page.getByRole('dialog');
 await expect(dialog.getByText('삭제하시겠습니까?')).toBeVisible();await expect(page.locator('.MuiDialog-container')).toHaveCSS('opacity','1');
 const box=(await dialog.boundingBox())!,viewport=page.viewportSize()!;
 expect(box.x+box.width/2).toBeCloseTo(viewport.width/2,0);expect(box.y+box.height/2).toBeCloseTo(viewport.height/2,0);
 await page.screenshot({animations:'disabled',path:`test-results/phase15/delete-${info.project.name}.png`});
 await dialog.getByRole('button',{name:'취소'}).click();expect(f.writes).toHaveLength(0);
 await page.getByRole('button',{name:'계좌 삭제',exact:true}).click();f.state.deleteFail=true;f.state.hasData=true;
 await dialog.getByRole('button',{name:'삭제',exact:true}).click();
 await expect(page.getByRole('button',{name:'데이터 초기화',exact:true})).toBeEnabled();expect(f.writes).toEqual(['/api/accounts/2']);
 await page.screenshot({animations:'disabled',path:`test-results/phase15/reset-state-${info.project.name}.png`});
 await page.getByRole('button',{name:'데이터 초기화',exact:true}).click();await expect(page).toHaveURL(/view=reset&accountId=2/);
 await page.getByRole('textbox',{name:'계좌명 입력'}).fill('使用 계좌');await expect(page.getByRole('button',{name:'계좌 데이터 초기화',exact:true})).toBeDisabled();
});

test('status failure never permits deletion and add has no destructive buttons',async({page})=>{
 const f=await fixture(page);f.state.fail=true;await page.goto('/detail/settings?view=edit&accountId=1');
 await expect(page.getByRole('button',{name:'상태 확인 중'})).toBeDisabled();await expect(page.getByRole('button',{name:'계좌 삭제',exact:true})).toHaveCount(0);
 await page.goto('/detail/settings?view=add');await expect(page.getByRole('button',{name:'계좌 삭제',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'데이터 초기화',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'추가',exact:true})).toBeDisabled();
});

test('delete nonselected then selected last account, clearing selection and offering add',async({page})=>{
 const f=await fixture(page);await page.goto('/detail/settings?view=account');
 await page.getByTestId('account-card-1').getByRole('button',{name:'사용중'}).click();
 await page.getByTestId('account-card-2').getByRole('button',{name:/계좌 정보 수정/}).click();
 await page.getByRole('button',{name:'계좌 삭제',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true}).click();
 await expect(page.getByTestId('account-card-2')).toHaveCount(0);await expect(page.getByTestId('account-card-1').getByRole('button',{name:'사용중'})).toBeVisible();
 await page.getByTestId('account-card-1').getByRole('button',{name:/계좌 정보 수정/}).click();await page.getByRole('button',{name:'계좌 삭제',exact:true}).click();
 await page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true}).dblclick();
 await expect(page.getByText('등록된 계좌가 없습니다. 계좌를 추가해 주세요.')).toBeVisible();
 expect(f.writes).toEqual(['/api/accounts/2','/api/accounts/1']);await expect(page.getByRole('button',{name:'계좌 추가',exact:true})).toBeVisible();
});

test('home and assets use identical unrounded color bands and missing-price neutral',async({page})=>{
 const f=await fixture(page);
 for(const [ratio,stock,cash] of [[19.99,'248, 113, 113','96, 165, 250'],[20,'248, 113, 113','96, 165, 250'],[29.99,'52, 211, 153','251, 191, 36'],[30,'248, 113, 113','96, 165, 250']] as const){
  f.state.ratio=ratio;
  for(const path of ['/','/detail/assets']){
   await page.goto(path);
   const stockCard=page.getByRole('button').filter({has:page.getByText('주식평가액',{exact:true})}).first();
   const cashCard=page.getByRole('button').filter({has:page.getByText('예수금',{exact:true})}).first();
   await expect(stockCard.getByText(`${Math.round(100-ratio)}원`,{exact:true})).toHaveCSS('color',`rgb(${stock})`);
   await expect(cashCard.getByText(`${Math.round(ratio)}원`,{exact:true})).toHaveCSS('color',`rgb(${cash})`);
   if(path.includes('assets')){
    const bar=page.getByTestId('asset-composition-card').getByRole('img',{name:/^주식 /});
    await expect(bar).toBeVisible(); // final 3안 bar shades are verified in phase15-1 tests
   }
  }
 }
 f.state.pricingComplete=false;await page.goto('/detail/assets');
 await expect(page.getByTestId('asset-composition-card').getByRole('status')).toContainText('계산할 수 없습니다');
});
