import type { Page } from '@playwright/test';
export async function fixture(page:Page, options: { names?: string[]; history?: [string, string | null][] } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-07T03:00:00Z'));
  const pnl=[100,10,0,-100,-10,null];
  let missing=false, hold=false, fail=false;
  const pending:Array<()=>void>=[];
  const history=options.history ?? [['2024-01-01','100000'],['2024-06-01','110000'],['2025-01-01','120000'],['2025-12-31','120000'],['2026-01-01','130000'],['2026-04-01','140000'],['2026-09-07','150000'],['2026-09-20','155000'],['2026-10-02','160000'],['2026-10-07','165000']];
  const securities=pnl.map((profit,i)=>({id:String(i+1),symbol:String(i+1).padStart(6,'0'),name:options.names?.[i] ?? `종목${i+1}`,marketType:'KOSPI',listType:'HOLDING',currentPrice:profit===null?null:String(100+profit),previousClosePrice:'100',priceUpdatedAt:'2026-10-07T03:00:00Z'}));
  const holdings=pnl.map((profit,i)=>({securityId:String(i+1),symbol:securities[i].symbol,name:securities[i].name,quantity:'1',averagePurchasePrice:'100',purchaseAmount:'100',currentPrice:profit===null?null:String(100+profit),marketValue:profit===null?null:String(100+profit),unrealizedProfitLoss:profit===null?null:String(profit),unrealizedReturnRate:profit===null?null:String(profit),priceUpdatedAt:'2026-10-07T03:00:00Z'}));
  const lots=Array.from({length:11},(_,i)=>({id:String(i+1),buyDate:i<3?'2026-10-01':i<9?'2026-09-03':i===9?'2026-08-01':'2026-07-31',boughtAt:`${i<3?'2026-10-01':i<9?'2026-09-03':i===9?'2026-08-01':'2026-07-31'}T03:00:00Z`,holdingDays:6,currentPrice:'150',unitPrice:'100',quantity:'10',soldQuantity:'8',remainingQuantity:'2',remainingPurchaseAmount:'200',returnRate:'50',profitLoss:'100',valuationStatus:'AVAILABLE',priceUpdatedAt:'2026-10-07T03:00:00Z',security:{id:'1',symbol:'000001',name:'종목1',marketType:'KOSPI'},sellTrades:[]}));
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),p=url.pathname;
    if(p==='/api/accounts')return route.fulfill({json:{data:[{id:'1',name:'기본',isActive:true,isDefault:true},{id:'2',name:'다른',isActive:true}]}});
    if(hold && /asset-history|dashboard|buy-lots/.test(p))await new Promise<void>(resolve=>pending.push(resolve));
    if(fail && /asset-history|dashboard/.test(p))return route.fulfill({status:500,json:{error:{message:'테스트 조회 실패'}}});
    const second=p.includes('/2/');
    if(p.endsWith('/securities'))return route.fulfill({json:{data:securities}});
    if(p.endsWith('/holdings'))return route.fulfill({json:{data:second?[]:holdings}});
    if(p.endsWith('/trades'))return route.fulfill({json:{data:[],daily:[],summary:{realizedProfitLoss:'200',buyAmount:'0',sellAmount:'0'}}});
    if(p.endsWith('/buy-lots'))return route.fulfill({json:{data:second?[]:lots.map((lot,i)=>({...lot,currentPrice:missing&&i===0?null:lot.currentPrice}))}});
    if(p.endsWith('/asset-history')){
      const rows=history.filter(([date])=>date>=(url.searchParams.get('from')??'')&&date<=url.searchParams.get('to')! || !url.searchParams.has('to'));
      return route.fulfill({json:{data:rows.map(([date,totalAssetValue])=>({date,totalAssetValue,stockValue:'100000',cashBalance:'20000',investmentAmount:'100000',updatedAt:`${date}T14:00:00Z`})),summary:{from:rows[0]?.[0],to:rows.at(-1)?.[0],openingAssetValue:'100000',closingAssetValue:'165000',profitLoss:'65000',returnRate:'65',depositAmount:'0',withdrawalAmount:'0',unrealizedChange:'100',realizedProfitLoss:'200',dividendIncome:'300',feeTaxAmount:'10'},compoundPlan:null}});
    }
    if(p.endsWith('/investment-baseline'))return route.fulfill({json:{data:null}});
    if(p.endsWith('/cash-transactions'))return route.fulfill({json:{data:[],meta:{total:0}}});
    if(p.endsWith('/dashboard'))return route.fulfill({json:{data:{account:{id:second?'2':'1',name:'기본'},totalAssetValue:'165000',stockValue:'100000',cashBalance:'65000',purchaseAmount:'100000',unrealizedProfitLoss:'1000',unrealizedReturnRate:'1',pricingComplete:true,latestPriceUpdatedAt:'2026-10-07T03:00:00Z',holdings:second?[]:holdings}}});
    if(p.endsWith('/target-arrivals'))return route.fulfill({json:{data:[],meta:{total:0,unavailableCount:0,calculatedAt:'2026-10-07T03:00:00Z',priceAsOf:null}}});
    return route.fulfill({json:{data:[]}});
  });
  return {missing:()=>{missing=true;},hold:()=>{hold=true;},release:()=>{hold=false;pending.splice(0).forEach(resolve=>resolve());},fail:()=>{fail=true;},success:()=>{fail=false;}};
}
