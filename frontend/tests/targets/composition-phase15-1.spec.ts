import {test,expect,type Page,type Locator} from '@playwright/test';
const cases=[
 [0,'239, 68, 68','191, 219, 254'],[19.99,'245, 122, 122','138, 183, 251'],[20,'245, 122, 122','138, 183, 251'],
 [20.001,'34, 197, 94','254, 240, 138'],[22,'61, 206, 117','250, 228, 112'],[28,'140, 234, 185','238, 191, 34'],
 [29.999,'167, 243, 208','234, 179, 8'],[30,'248, 148, 148','112, 166, 249'],[40,'251, 175, 175','85, 148, 248'],
 [50,'254, 202, 202','59, 130, 246'],[60,'254, 202, 202','59, 130, 246'],[100,'254, 202, 202','59, 130, 246'],
] as const;
async function fixture(page:Page){
 const state={ratio:22,missing:false,zero:false};
 page.on('pageerror',error=>{throw error;});
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname,ratio=path.includes('/2/')?40:state.ratio,cash=state.zero?0:ratio*10000,stock=state.missing?null:String(state.zero?0:(100-ratio)*10000);
  if(path==='/api/accounts')return route.fulfill({json:{data:[1,2].map(id=>({id:String(id),name:'계좌 '+id,brokerName:'검증',accountNumber:'123-'+id,cashBalance:String((id===2?40:state.ratio)*10000),isActive:true,isDefault:id===1}))}});
  if(path.endsWith('/dashboard'))return route.fulfill({json:{data:{stockValue:stock,cashBalance:String(cash),totalAssetValue:state.missing?null:state.zero?'0':'1000000',purchaseAmount:'300000',unrealizedProfitLoss:'10000',unrealizedReturnRate:'1',stockMonthlyProfit:'10000',cashMonthlyProfit:'-1000',holdings:[],pricingComplete:!state.missing,latestPriceUpdatedAt:'2026-10-09T00:00:00Z'}}});
  if(path.endsWith('/cash-overview'))return route.fulfill({json:{data:{currentYearTax:{year:2026,amount:'0'},account:{id:'1',name:'계좌',currentBalance:String(cash),balanceStatus:'AVAILABLE'},monthly:{deposit:'0',withdrawal:'0',dividend:'0'},yearly:{deposit:'0',withdrawal:'0',dividend:'0'},recentTransactions:[]}}});
  if(path.endsWith('/asset-history'))return route.fulfill({json:{data:[{date:'2026-10-01',totalAssetValue:'1000000',cashBalance:String(cash),stockValue:stock}],summary:{from:'2026-10-01',to:'2026-10-09',openingAssetValue:'1000000',closingAssetValue:'1000000',profitLoss:'10000',returnRate:'1',depositAmount:'0',withdrawalAmount:'0',unrealizedChange:'10000',realizedProfitLoss:'0',dividendIncome:'0',feeTaxAmount:'0'}}});
  if(path.endsWith('/cash-transactions'))return route.fulfill({json:{data:[],meta:{total:0,limit:100,offset:0}}});
  return route.fulfill({status:503,json:{error:{message:'Fixture endpoint unavailable'}}});
 });return state;
}
const quick=(page:Page,name:string)=>page.getByRole('button').filter({has:page.getByText(name,{exact:true})}).first();
async function barCheck(bar:Locator,ratio:number,stock:string,cash:string){
 await bar.scrollIntoViewIfNeeded();const parts=bar.locator(':scope > *');
 await expect(parts.nth(0)).toHaveCSS('background-color',`rgb(${stock})`);await expect(parts.nth(1)).toHaveCSS('background-color',`rgb(${cash})`);
 const widths=await bar.evaluate(el=>({total:el.getBoundingClientRect().width,parts:Array.from(el.children).map(child=>child.getBoundingClientRect().width)}));
 expect(widths.parts[0]/widths.total*100).toBeCloseTo(100-ratio,1);expect(widths.parts[1]/widths.total*100).toBeCloseTo(ratio,1);expect(widths.parts[0]+widths.parts[1]).toBeCloseTo(widths.total,1);
}
for(const [ratio,stockShade,cashShade] of cases) test(`cash ${ratio}%: fixed text colors and real bar lengths on all surfaces`,async({page},info)=>{
 test.setTimeout(60000);const state=await fixture(page);
  state.ratio=ratio;const stable=ratio>20&&ratio<30,stockColor=stable?'52, 211, 153':'248, 113, 113',cashColor=stable?'251, 191, 36':'96, 165, 250';
  for(const path of ['/','/detail/assets','/assets','/detail/cash','/detail/settings?view=account']){
   await page.goto(path);
   if(path==='/'||path==='/detail/assets'){
    for(const [name,value,color] of [['주식평가액',(100-ratio)*10000,stockColor],['예수금',ratio*10000,cashColor]] as const)await expect(quick(page,name).getByText(`${Math.round(value).toLocaleString('ko-KR')}원`,{exact:true})).toHaveCSS('color',`rgb(${color})`);
    await expect(quick(page,'주식평가액').getByText(`${(100-ratio).toFixed(1)}%`,{exact:true})).toHaveCSS('color',`rgb(${stockColor})`);await expect(quick(page,'예수금').getByText(`${ratio.toFixed(1)}%`,{exact:true})).toHaveCSS('color',`rgb(${cashColor})`);
    if(path==='/detail/assets')await barCheck(page.getByTestId('asset-composition-card').getByRole('img',{name:/^주식 /}),ratio,stockShade,cashShade);
   }else if(path==='/assets'){
    const card=page.getByTestId('analysis-composition');
    for(const id of ['composition-amounts','composition-ratios']){await expect(card.getByTestId(id).locator(':scope > *').first()).toHaveCSS('color',`rgb(${stockColor})`);await expect(card.getByTestId(id).locator(':scope > *').last()).toHaveCSS('color',`rgb(${cashColor})`);}
    await barCheck(card.getByRole('img'),ratio,stockShade,cashShade);
    await expect(card.getByText('주식',{exact:true})).toHaveCount(0);await expect(card.getByText('예수금',{exact:true})).toHaveCount(0);
    const boxes=await card.evaluate(el=>['composition-amounts',null,'composition-ratios'].map(id=>(id?el.querySelector(`[data-testid="${id}"]`):el.querySelector('[role="img"]'))!.getBoundingClientRect().toJSON()));
    expect(boxes[0].bottom).toBeLessThanOrEqual(boxes[1].top);expect(boxes[1].bottom).toBeLessThanOrEqual(boxes[2].top);
    if(ratio===22||ratio===60){await card.screenshot({path:`test-results/phase15/analysis-${ratio}-${info.project.name}.png`});await page.screenshot({path:`test-results/phase15/analysis-screen-${ratio}-${info.project.name}.png`});
     if(ratio===22){const scroll=page.viewportSize()!.width>=600?page.locator('[data-scroll-region="analysis-left"]'):page.locator('main');await scroll.evaluate(el=>{el.scrollTop=el.scrollHeight;});await card.scrollIntoViewIfNeeded();await barCheck(card.getByRole('img'),ratio,stockShade,cashShade);await card.screenshot({path:`test-results/phase15/analysis-scrolled-${info.project.name}.png`});}
     const clipped=await card.locator('span').evaluateAll(nodes=>nodes.some(n=>n.scrollWidth>n.clientWidth+1));expect(clipped).toBe(false);}
   }else if(path==='/detail/cash')await expect(page.getByTestId('cash-balance-value')).toHaveCSS('color',`rgb(${cashColor})`);
   else await expect(page.getByTestId('account-card-1').getByTestId('account-cash')).toHaveCSS('color',`rgb(${cashColor})`);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});
test('unknown prices and zero denominator preserve amounts; valid zero stays distinct',async({page},info)=>{
 const state=await fixture(page);state.missing=true;
 for(const path of ['/','/detail/assets','/assets','/detail/cash','/detail/settings?view=account']){
  await page.goto(path);
  const value=path==='/assets'?page.getByTestId('composition-amounts').getByText('220,000원'):path==='/detail/cash'?page.getByTestId('cash-balance-value'):path.includes('settings')?page.getByTestId('account-card-1').getByTestId('account-cash'):quick(page,'예수금').getByText('220,000원',{exact:true});
  await expect(value).toHaveCSS('color','rgb(148, 163, 184)');await expect(value).toHaveText('220,000원');
  if(path==='/assets'){await expect(page.getByTestId('composition-ratios')).toHaveText('——');await expect(page.getByTestId('analysis-composition').getByRole('status')).toContainText('계산 불가');await page.getByTestId('analysis-composition').screenshot({path:`test-results/phase15/unknown-${info.project.name}.png`});}
 }
 state.missing=false;state.zero=true;await page.goto('/assets');await expect(page.getByTestId('composition-amounts')).toHaveText('0원0원');await expect(page.getByTestId('composition-ratios')).toHaveText('——');
 state.zero=false;state.ratio=0;await page.goto('/assets');await expect(page.getByTestId('composition-ratios')).toHaveText('100.0%0.0%');await barCheck(page.getByTestId('analysis-composition').getByRole('img'),0,'239, 68, 68','191, 219, 254');
});
test('account switch preserves selected border and profit sign colors',async({page},info)=>{
 await fixture(page);await page.goto('/detail/settings?view=account');await page.getByTestId('account-card-2').getByRole('button',{name:/계좌 선택/}).click();await expect(page.getByTestId('account-card-2')).toHaveCSS('border-top-color','rgb(250, 204, 21)');
 await page.goto('/assets');await expect(page.getByTestId('composition-ratios')).toHaveText('60.0%40.0%');await barCheck(page.getByTestId('analysis-composition').getByRole('img'),40,'251, 175, 175','85, 148, 248');
 await expect(page.getByTestId('analysis-metric-기간 투자손익').getByText('+10,000원')).toHaveCSS('color','rgb(248, 113, 113)');await page.getByTestId('analysis-composition').screenshot({path:`test-results/phase15/switch-${info.project.name}.png`});
});
