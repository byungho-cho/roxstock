import {expect,test,type Page} from '@playwright/test';
import {cashDifference} from '../../src/pages/cash/cashData';
const types=['BUY','SELL','DEPOSIT','WITHDRAWAL','DIVIDEND'];
async function setup(page:Page){
 await page.clock.setFixedTime(new Date('2026-10-08T03:00:00Z'));
 const writes:{method:string,path:string,body:any}[]=[];let tax=230;let fail='',empty=false,latestId='99',latestType=0,balanceMissing=false,noLedger=false;
 const rows=types.map((transactionType,i)=>({id:String(i+1),transactionType,createdAt:'2026-10-01T03:00:00Z',transactionDate:'2026-10-01T03:00:00Z',amount:'1000',feeTaxAmount:transactionType==='BUY'?'-230':'230',balanceAfter:'10000',signedAmount:'1000',memo:'과거 내역',dividend:transactionType==='DIVIDEND'?{id:'1',securityId:'2',securityName:'삼성전자',grossAmount:'1230',netAmount:'1000'}:null}));
 await page.route('**/api/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.pathname;
  if(request.method()!=='GET'){const body=request.postDataJSON();writes.push({method:request.method(),path,body});tax+=10;return route.fulfill({json:{data:{id:'1',cashBalanceAdjusted:false}}});}
  if(fail&&path.endsWith(fail))return route.fulfill({status:500,json:{error:{message:'조회 실패'}}});
  if(path==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'계좌 1',isActive:true,isDefault:true,cashBalance:'10000'},{id:'2',name:'계좌 2',isActive:true,cashBalance:'20000'}]}});
  if(path.endsWith('/cash-overview'))return route.fulfill({json:{data:{currentYearTax:{year:2026,amount:path.includes('/2/')?'990':String(tax)},account:{id:'1',name:'계좌',currentBalance:noLedger||balanceMissing?null:'10000',balanceStatus:noLedger?'NO_TRANSACTIONS':balanceMissing?'BALANCE_MISSING':'AVAILABLE',updatedAt:'2026-10-08T03:00:00Z'},monthly:{deposit:'1',withdrawal:'1',dividend:'1'},yearly:{deposit:'2',withdrawal:'2',dividend:'2'},recentTransactions:noLedger?[]:[{...rows[latestType],id:latestId,balanceAfter:balanceMissing?null:'10000',transactionDate:'2026-09-01T03:00:00Z'}]}}});
  if(path.endsWith('/cash-transactions'))return route.fulfill({json:{data:rows,meta:{total:5,limit:100,offset:0}}});
  if(path.endsWith('/asset-history'))return route.fulfill({json:{data:empty?[]:[{date:'2026-10-01',cashBalance:'10000'},{date:'2026-10-02',cashBalance:null},{date:'2026-10-03',cashBalance:'12000'}],summary:{profitLoss:null,returnRate:null}}});
  if(path.endsWith('/buy-lots'))return route.fulfill({json:{data:[{id:'1',security:{id:'2',name:'삼성전자',symbol:'005930'},remainingQuantity:'1'}]}});
  return route.fulfill({json:{data:[]}});
 });return{writes,latest:()=>{latestId='5';},fail:(v:string)=>{fail=v;},empty:()=>{empty=true;},topType:(index:number)=>{latestType=index;},missing:()=>{balanceMissing=true;},noLedger:()=>{noLedger=true;}};
}
async function ready(page:Page){await page.goto('/detail/cash');await expect(page.getByTestId('cash-history-row')).toHaveCount(5);}
const close=async(page:Page)=>{await page.getByRole('button',{name:'취소',exact:true}).click();};
test('all past types editable; latest from entire account controls deletion; columns and tax card align',async({page},info)=>{
 await setup(page);await ready(page);
 await expect(page.getByTestId('cash-year-tax')).toHaveText('올해 제세금 230원');
 for(const [i,label] of ['매수','매도','입금','출금','배당'].entries()){
  await page.getByTestId('cash-history-row').nth(i).click();await expect(page.getByRole('button',{name:'삭제',exact:true})).toBeDisabled();await expect(page.getByTestId('cash-form')).toBeVisible();await close(page);
 }
 await page.locator('[data-scroll-region="cash-body"]').evaluate(el=>el.scrollTop=0);
 const heading=await page.getByTestId('cash-amount-heading').boundingBox(),amount=await page.getByTestId('cash-row-amount').first().boundingBox();expect(heading!.x+heading!.width).toBeCloseTo(amount!.x+amount!.width,1);
 await page.screenshot({path:`test-results/cash-v05/${info.project.name}-cash.png`});
 await page.getByRole('button',{name:'매수 내역 수정',exact:true}).click();if(page.viewportSize()!.width>=600) await expect(page.locator('.MuiDialog-container:visible')).toHaveCSS('opacity','1');
 await expect(page.getByRole('button',{name:'저장',exact:true})).toHaveCSS('height','48px');
 await page.screenshot({path:`test-results/cash-v05/${info.project.name}-edit.png`});
 expect(await page.getByTestId('cash-form').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});
test('before tax clears dependents; last input governs mutual calculation and persists explicit balance only',async({page})=>{
 expect(cashDifference('100.1','90.01')).toBe('10.09');expect(cashDifference('100.1','-0.2','add')).toBe('99.9');expect(cashDifference('100.1','0.2','add')).toBe('100.3');
 const state=await setup(page);await ready(page);await page.getByRole('button',{name:'매수 내역 수정',exact:true}).click();
 const gross=page.getByLabel('세전예수금',{exact:true}),after=page.getByLabel('세후예수금',{exact:true}),tax=page.getByLabel('제세금',{exact:true});
 await expect(gross).toHaveValue('9,770');await expect(tax).toHaveValue('-230');
 await gross.fill('15000');await expect(after).toHaveValue('');await expect(tax).toHaveValue('');
 await after.fill('14000');await expect(tax).toHaveValue('1,000');await tax.fill('2000');await expect(after).toHaveValue('13,000');
 await tax.fill('-100');await expect(after).toHaveValue('15,100');await tax.fill('2000');
 await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByTestId('cash-history-row')).toHaveCount(5);
 expect(state.writes[0].body).toMatchObject({amount:'1000',feeTaxAmount:'2000',balanceAfter:'13000'});
 await expect(page.getByTestId('cash-year-tax')).toHaveText('올해 제세금 240원');
 await page.evaluate(()=>{localStorage.setItem('roxstock-selected-account-id','2');window.dispatchEvent(new Event('roxstock-selected-account'));});
 await expect(page.getByTestId('cash-year-tax')).toHaveText('올해 제세금 990원');
});
test('saved chart uses axes, gap and touch tooltip; empty and failure remain distinct',async({page})=>{
 const state=await setup(page);await ready(page);
 const chart=page.getByTestId('cash-trend-chart');await chart.scrollIntoViewIfNeeded();await expect(chart).toBeVisible();
 const rect=(await chart.locator('svg').boundingBox())!;await page.touchscreen.tap(rect.x+rect.width/2,rect.y+rect.height/2);
 await expect(page.getByTestId('asset-trend-tooltip')).toBeVisible();await expect(chart.locator('svg path[stroke="'+ '#60A5FA' +'"]').first()).toHaveAttribute('d',/M.*M/);
 state.fail('/asset-history');await page.getByRole('button',{name:'이전 기간',exact:true}).click();await expect(page.getByTestId('cash-trend')).toContainText('추이 조회 실패');
 state.fail('');state.empty();await page.getByText('추이 조회 실패 · 다시 시도',{exact:true}).click();await expect(page.getByTestId('cash-trend')).toContainText('내용이 없습니다.');
});

test('latest entry can be deleted and year tax refreshes; read failures never show zero',async({page})=>{
 const state=await setup(page);state.latest();await ready(page);
 await page.getByRole('button',{name:'배당 내역 수정',exact:true}).click();await expect(page.getByRole('button',{name:'삭제',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'삭제',exact:true}).click();await page.locator('[role="dialog"]').last().getByRole('button',{name:'삭제',exact:true}).click();
 await expect(page.getByTestId('cash-year-tax')).toHaveText('올해 제세금 240원');expect(state.writes.at(-1)?.method).toBe('DELETE');
 await page.getByRole('button',{name:'이전 기간',exact:true}).click();await expect(page.getByTestId('cash-year-tax')).toHaveText('올해 제세금 240원');
 state.fail('/cash-overview');await page.reload();await expect(page.getByTestId('cash-year-tax')).toHaveText('올해 제세금 조회 실패');
});


test('whole card and pencil edit the displayed latest record outside list period; cancel never writes',async({page})=>{
 const state=await setup(page);state.topType(2);await ready(page);
 await expect(page.getByTestId('cash-balance-value')).toHaveText('10,000원');
 await page.getByTestId('cash-balance').click();await expect(page.getByLabel('세후예수금',{exact:true})).toHaveValue('10,000');await expect(page.getByRole('button',{name:'삭제',exact:true})).toBeEnabled();
 await page.getByLabel('세후예수금',{exact:true}).fill('12345');await close(page);expect(state.writes).toHaveLength(0);
 await page.getByRole('button',{name:'현재 예수금 편집',exact:true}).click();await expect(page.getByLabel('세후예수금',{exact:true})).toHaveValue('10,000');
 await page.getByLabel('세후예수금',{exact:true}).fill('12345');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByTestId('cash-form')).not.toBeVisible();
 expect(state.writes[0]).toMatchObject({path:'/api/cash-transactions/99',body:{accountId:'1',expectedLatestId:'99',balanceAfter:'12345',amount:'1000'}});expect(state.writes.some(w=>w.path.endsWith('/cash-balance'))).toBe(false);
});
test('no ledger and failed latest lookup never substitute a historical edit target or zero',async({page})=>{
 const state=await setup(page);state.noLedger();await ready(page);await expect(page.getByTestId('cash-balance-value')).toHaveText('—');
 await page.getByTestId('cash-balance').click();await expect(page.getByTestId('cash-form')).not.toBeVisible();await expect(page.getByRole('alert')).toContainText('예수금 내역이 없습니다. 입금을 등록해 주세요.');expect(state.writes).toHaveLength(0);
 state.fail('/cash-overview');await page.reload();await expect(page.getByText('예수금 조회 실패 · 다시 시도',{exact:true})).toBeVisible();await expect(page.getByTestId('cash-form')).not.toBeVisible();
});
test('missing net amount remains explicit and its latest record is editable without fallback',async({page})=>{
 const state=await setup(page);state.topType(2);state.missing();await ready(page);await expect(page.getByTestId('cash-balance-value')).toHaveText('—');
 await page.getByRole('button',{name:'현재 예수금 편집',exact:true}).click();await expect(page.getByLabel('세후예수금',{exact:true})).toHaveValue('');await page.getByRole('button',{name:'저장',exact:true}).click();expect(state.writes).toHaveLength(0);
 await page.getByLabel('세후예수금',{exact:true}).fill('0');await page.getByRole('button',{name:'저장',exact:true}).click();await expect(page.getByTestId('cash-form')).not.toBeVisible();expect(state.writes[0].body.balanceAfter).toBe('0');
});
