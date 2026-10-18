import {test,expect} from '@playwright/test';
import {setup} from './financial-ui-fixture';
test('foreign originals retain exact decimals; money charts use separate currency axes',async({page},info)=>{
 await setup(page);
 const rows=['USD','CNY','JPY'].map((currency,i)=>({currency,amountMultiplier:'1',conversionRequired:true,key:(2023+i)+':ANNUAL',year:2023+i,quarter:null,label:String(2023+i),values:{revenue:'123456789.125',operatingProfit:'1000.125',netIncome:'10.125',totalAssets:'100.125',totalLiabilities:'10.125',totalEquity:'90'},growth:{},basis:'OFS',source:'OFS',collectedAt:'2026-10-19T00:00:00Z',isDerived:false,isEstimated:false,collectionState:'FINANCIAL_ONLY',revenue:'123456789.125',operatingProfit:'1000.125',netIncome:'10.125',roe:'10',per:null,pbr:null,metricStatus:'PARTIAL',metricReasons:{per:'CURRENCY_CONVERSION_REQUIRED',pbr:'CURRENCY_CONVERSION_REQUIRED'}}));
 await page.route('**/api/financial-statements/1?*',route=>route.fulfill({json:{data:{security:{id:'1',name:'외화 종목',symbol:'900001'},rows,chartRows:rows,collectedAt:null,notices:['각 기간의 원문 통화 및 단위 ×1']}}}));
 await page.route('**/api/value-analysis/1?*',route=>route.fulfill({json:{data:{security:{id:'1',name:'외화 종목',symbol:'900001',currentPrice:'5000'},year:2026,rows,valuation:null,fairPrices:[],notices:[],mode:'annual'}}}));
 await page.goto('/detail/financials?selected=1');
 await expect(page.getByText('외화 · USD',{exact:true}).first()).toBeVisible();
 await expect(page.getByRole('cell',{name:'123,456,789.125 USD',exact:true})).toBeVisible();
 await expect(page.getByText('단위: 백만원',{exact:true})).toHaveCount(0);
 await page.screenshot({path:info.outputPath('foreign-statements.png'),fullPage:true});
 await page.goto('/detail/value?view=chart&selected=1');
 const chart=page.getByTestId('value-chart-수익성');
 await expect(chart).toHaveCount(3);
 await expect(page.getByRole('img',{name:'수익성 USD ×10⁶'})).toBeVisible();
 await expect(page.getByRole('img',{name:'수익성 CNY ×10⁶'})).toBeVisible();
 await page.screenshot({path:info.outputPath('foreign-charts.png'),fullPage:true});
});
