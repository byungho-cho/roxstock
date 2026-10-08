import {test,expect} from '@playwright/test';
import {setup} from './financial-ui-fixture';
test('server collection states color periods; estimate labels stay explicit and latest failures win over saved values',async({page},info)=>{
 await setup(page);let state='COMPLETE';
 await page.route('**/api/value-analysis/1?**',async route=>{
  const u=new URL(route.request().url()),start=Number(u.searchParams.get('startYear')??2024);
  const rows=Array.from({length:3},(_,i)=>({key:`${start+i}:ANNUAL`,year:start+i,quarter:null,label:start+i===2026?'2026E':String(start+i),isEstimated:start+i===2026,collectionState:start+i===2024?state:start+i===2025?'FINANCIAL_ONLY':'ESTIMATE_READY',revenue:'100',operatingProfit:'10',netIncome:'5',per:'10',pbr:'1',roe:'10',source:'DART:CFS',metricReasons:{},isDerived:false}));
  await route.fulfill({json:{data:{security:{id:'1',name:'종목1',symbol:'000001',currentPrice:'100'},year:2026,rows,valuation:null,fairPrices:[],notices:[],mode:'annual',startYear:start,count:3}}});
 });
 await page.goto('/detail/value?view=chart&selected=1&centerYear=2025');
 const header=page.getByTestId('financial-period-header');
 await expect(header.getByRole('button',{name:'이전 연도 2024'})).toHaveCSS('color','rgb(52, 211, 153)');
 await expect(header.getByRole('button',{name:'재무지표 중앙연도'})).toHaveCSS('color','rgb(251, 191, 36)');
 await expect(header.getByRole('button',{name:'다음 연도 2026'})).toHaveText('2026E');
 await expect(header.getByRole('button',{name:'다음 연도 2026'})).toHaveCSS('color','rgb(96, 165, 250)');
 await expect(header.getByRole('button',{name:'다음 연도 2026'})).toHaveCSS('font-weight','700');
 await page.screenshot({path:info.outputPath('manual-period-states.png')});
 state='FINAL_FAILED';await page.reload();await expect(header.getByRole('button',{name:'이전 연도 2024'})).toHaveCSS('color','rgb(248, 113, 113)');
 await expect(page.getByTestId('value-chart-가치지표')).toContainText('10.0');
 state='NOT_COLLECTED';await page.reload();await expect(header.getByRole('button',{name:'이전 연도 2024'})).toHaveCSS('color','rgb(148, 163, 184)');
});
