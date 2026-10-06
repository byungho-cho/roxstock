import {test,expect,type Page} from '@playwright/test';
import {QueryClient} from '@tanstack/react-query';
import {invalidatePortfolio} from '../../src/data/invalidatePortfolio';
import {fixture} from './stock-input-fixture';

const navigate=async(page:Page,path:string)=>page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);

test('inactive portfolio caches refresh without clearing existing values',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
 let value=100,release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const keys=['analysis-history','analysis-dashboard','investment','investment-profit','dashboard','cashBalance','cashOverview','cashTransactions','cashTrend'];
 try{
  for(const key of keys)await client.fetchQuery({queryKey:[key,'a'],queryFn:async()=>{if(value===200)await gate;return value;}});
  value=200;const pending=invalidatePortfolio(client);
  for(const key of keys)expect(client.getQueryData([key,'a'])).toBe(100);
  release();await pending;
  for(const key of keys)expect(client.getQueryData([key,'a'])).toBe(200);
 }finally{client.clear();}
});

for(const profit of ['12345','-12345'])test(`sell detail uses authoritative API profit ${profit} without lot requests`,async({page})=>{
 await fixture(page);let lots=0;
 await page.route('**/api/accounts/*/buy-lots*',r=>{lots++;return r.fulfill({status:500,json:{error:{message:'unavailable'}}});});
 await page.route('**/api/sell-trades/s1*',r=>r.fulfill({json:{data:{id:'s1',type:'SELL',account:{id:'a'},security:{id:'1',symbol:'005380',name:'현대자동차'},buyTradeId:'lot1',soldAt:'2026-10-06T03:00:00Z',quantity:'2',unitPrice:'20000',buyUnitPrice:'10000',realizedProfitLoss:profit,memo:null}}}));
 await page.goto('/journal/trade/sell/s1');
 const results=page.getByText(profit.startsWith('-')?'-12,345원':'12,345원',{exact:true});
 await expect(results).toHaveCount(2);await expect(page.getByText('20,000원',{exact:true})).toBeVisible();
 expect(await results.first().evaluate(e=>getComputedStyle(e).color)).toBe(await results.last().evaluate(e=>getComputedStyle(e).color));expect(lots).toBe(0);
});

test('detail API failure offers retry',async({page})=>{
 await fixture(page);let failed=true;
 await page.route('**/api/sell-trades/s1*',r=>failed?r.fulfill({status:500,json:{error:{message:'unavailable'}}}):r.fallback());
 await page.goto('/journal/trade/sell/s1');await expect(page.getByRole('alert')).toContainText('거래 조회에 실패');failed=false;await page.getByRole('button',{name:'다시 시도',exact:true}).click();await expect(page.getByText('원본 매도')).toBeVisible();
});

for(const action of ['buy','sell','edit-buy','edit-sell','delete-buy','delete-sell','cash-balance','deposit','withdrawal','dividend','cash-edit-deposit','cash-edit-withdrawal','cash-edit-dividend','cash-delete-deposit','cash-delete-withdrawal','cash-delete-dividend'])test(`cached investment refreshes after ${action}`,async({page})=>{
 const f=await fixture(page);await page.clock.setFixedTime(new Date('2026-10-06T03:00:00Z'));
 const cashType=action.endsWith('dividend')?'DIVIDEND':action.endsWith('withdrawal')?'WITHDRAWAL':'DEPOSIT';
 const cashRows=action.startsWith('cash-edit')||action.startsWith('cash-delete')?[{id:'c1',transactionType:cashType,transactionDate:'2026-10-06T01:00:00Z',createdAt:'2026-10-06T01:00:00Z',updatedAt:'2026-10-06T01:00:00Z',amount:'100',signedAmount:'100',feeTaxAmount:'0',memo:null,dividend:cashType==='DIVIDEND'?{securityId:'1',securityName:'현대자동차',grossAmount:'100',netAmount:'100',taxAmount:'0'}:null}]:[];
 await page.route('**/api/accounts/*/investment-baseline*',r=>r.fulfill({json:{data:null}}));
 await page.route('**/api/accounts/*/asset-history*',r=>r.fulfill({json:{data:[{date:'2026-10-06',totalAssetValue:f.writes.length?'2000':'1000',updatedAt:'2026-10-06T03:00:00Z',isCurrent:true}],summary:{}}}));
 await page.route('**/api/accounts/*/cash-transactions*',r=>r.fulfill({json:{data:cashRows,meta:{total:cashRows.length}}}));
 await page.route('**/api/accounts/*/cash-overview*',r=>r.fulfill({json:{data:{account:{id:'a',currentBalance:'1000'},monthly:{},yearly:{},recentTransactions:cashRows}}}));
 await page.goto('/assets');await expect(page.getByTestId('analysis-performance')).toContainText('1,000원');await navigate(page,'/detail/investment');await expect(page.getByTestId('investment-value')).toHaveText('1,000원');
 if(action.startsWith('delete')){
  await navigate(page,`/journal/trade/${action==='delete-buy'?'buy/lot1':'sell/s1'}`);await page.getByRole('button',{name:'삭제',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true}).click();
 }else if(['buy','sell','edit-buy','edit-sell'].includes(action)){
  const sell=action.endsWith('sell'),edit=action.startsWith('edit');
  await navigate(page,`/trade?type=${sell?'sell':'buy'}&stock=1${sell?'&lot=lot1':''}${edit?`&edit=${sell?'s1':'lot1'}`:''}`);
  await page.getByRole('textbox',{name:sell?'매도수량':'매수수량',exact:true}).fill('2');
  await page.getByRole('button',{name:edit?'변경':sell?'매도':'매수',exact:true}).click();
 }else{
  await navigate(page,'/detail/cash');
  if(action.startsWith('cash-edit')||action.startsWith('cash-delete')){
   await page.getByRole('button',{name:(cashType==='DIVIDEND'?'배당':cashType==='WITHDRAWAL'?'출금':'입금')+' 내역 수정'}).click();
   if(action.startsWith('cash-delete')){await page.getByRole('button',{name:'삭제',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'삭제',exact:true}).click();}
   else{await page.getByRole('textbox',{name:cashType==='DIVIDEND'?'세전 배당':'금액',exact:true}).fill('200');await page.getByRole('button',{name:'변경',exact:true}).click();}
  }else if(action==='cash-balance'){
   await page.getByRole('button',{name:'현재 예수금 편집'}).click();await page.getByRole('textbox',{name:'현재 예수금',exact:true}).fill('2000');await page.getByRole('button',{name:'저장',exact:true}).click();
  }else{
   await page.getByRole('button',{name:'예수금 등록',exact:true}).click();
   if(action==='dividend'){
    await page.getByRole('button',{name:'배당',exact:true}).click();await page.getByRole('combobox',{name:'배당 종목 선택'}).click();await page.getByRole('option',{name:'현대자동차'}).click();await page.getByRole('textbox',{name:'세전 배당',exact:true}).fill('100');
   }else{if(action==='withdrawal')await page.getByRole('button',{name:'출금',exact:true}).click();await page.getByRole('textbox',{name:'금액',exact:true}).fill('100');}
   await page.getByRole('button',{name:'등록',exact:true}).click();
  }
 }
 await expect.poll(()=>f.writes.length).toBe(1);
 if(action.startsWith('delete'))await expect(page).toHaveURL(/journal\?view=profit/);
 else if(['buy','sell','edit-buy','edit-sell'].includes(action))await expect(page).toHaveURL(/stocks\/1/);
 else if(action==='cash-balance')await expect(page.getByRole('dialog')).toHaveCount(0);
 else await expect(page.getByTestId('cash-form')).toHaveCount(0);
 await navigate(page,'/detail/investment');await expect(page.getByTestId('investment-value')).toHaveText('2,000원');
 await navigate(page,'/assets');await expect(page.getByTestId('analysis-performance')).toContainText('2,000원');
});
