import type {Page} from '@playwright/test';
export async function fixture(page:Page, options:{trend?:boolean;analysis?:boolean}={}){
 await page.clock.setFixedTime(new Date('2026-10-13T03:00:00Z'));
 const history={mode:'ready' as 'ready'|'empty'|'error'|'hold'};let releaseHistory=()=>{};
 const reads:string[]=[];let release=()=>{},held=false;const gate=new Promise<void>(r=>release=r);
 const accounts=[1,2].map(id=>({id:String(id),name:'계좌'+id,isDefault:id===1,isActive:true,cashBalance:'1000'}));
 const securities=[1,2,3].map(id=>({id:String(id),symbol:String(id).padStart(6,'0'),name:'종목'+id,marketType:'KOSPI',listType:'HOLDING',isActive:true,hasTradeHistory:true,currentPrice:'150',previousClosePrice:'140'}));
 const dashboard={accountId:'1',totalAssetValue:'2500',cashBalance:'1000',stockValue:'1500',stockPurchaseAmount:'1000',unrealizedProfitLoss:'500',unrealizedReturnRate:'50',pricingComplete:true,previousDayChange:'50',previousDayChangeRate:'2',calculatedAt:'2026-10-13T03:00:00Z'};
 const holdings=securities.map(s=>({securityId:s.id,symbol:s.symbol,name:s.name,quantity:'10',averagePurchasePrice:'100',purchaseAmount:'1000',currentPrice:'150',marketValue:options.trend?'500':'1500',unrealizedProfitLoss:'500',unrealizedReturnRate:'50'}));
 const recent=Array.from({length:7},(_,i)=>({id:'lot'+i,security:securities[0],quantity:'10',unitPrice:'100',remainingQuantity:'10',currentPrice:'150',profitLoss:'500',returnRate:'50',boughtAt:'2026-10-12T00:00:00Z',buyDate:'2026-10-12',holdingDays:1}));
 async function read(path:string):Promise<{status:number;body:any}>{
  reads.push(path);const u=new URL('http://fixture/api'+path),p=u.pathname,id=p.split('/')[3]??'1',securityId=u.searchParams.get('securityId')??'1';let data:any=[];
  if(p==='/api/accounts')data=accounts;
  else if(p==='/api/securities')data=securities;
  else if(p.endsWith('/holdings'))data=holdings;
  else if(p.endsWith('/asset-history')&&options.trend){
   if(history.mode==='hold')await new Promise<void>(r=>releaseHistory=r);
   if(history.mode==='error')return {status:503,body:{error:{message:'history failed'}}};
   data=history.mode==='empty'?[]:[{date:'2026-09-01',totalAssetValue:'9999'},{date:'2026-09-13',totalAssetValue:id==='1'?'2000':'6000'},{date:'2026-10-01',totalAssetValue:id==='1'?'2200':'6500'},{date:'2026-10-13',totalAssetValue:id==='1'?'2500':'7000'}];
   if(options.analysis&&!u.searchParams.has('view'))return {status:200,body:{data,summary:{from:u.searchParams.get('from')??'2020-01-01',to:'2026-10-13',openingAssetValue:'2000',closingAssetValue:id==='1'?'2500':'7000',profitLoss:'500',returnRate:'25'}}};
  }else if(p.endsWith('/dashboard'))data={...dashboard,holdings,purchaseAmount:'1000',accountId:id};
  else if(p.endsWith('/investment-profit')){
   const events=(['BUY','SELL','DIVIDEND'] as const).map(kind=>({date:'2026-01-02',securityId,name:'종목'+securityId,kind,buy:kind==='BUY'?'1000':'0',sell:kind==='SELL'?'400':'0',cost:kind==='SELL'?'200':'0',trading:kind==='SELL'?(id==='1'?'200':'-200'):'0',dividend:kind==='DIVIDEND'?'30':'0'}));data={accountId:id,securityId,events:securityId==='3'?[]:events,capital:[]};
  }else if(p.endsWith('/trades')){
   if(held&&securityId==='2')await gate;
   const data=Array.from({length:160},(_,i)=>({id:String(i+1),type:i%2?'SELL':'BUY',buyTradeId:String(i%2?i:i+1),security:securities.find(s=>s.id===securityId),tradedAt:(i<80?'2026-10-01':'2024-10-01')+'T00:00:00Z',quantity:'1',unitPrice:i%2?'120':'100',amount:i%2?'120':'100',realizedProfitLoss:i%2?'20':null}));return {status:200,body:{data:securityId==='3'?[]:data,summary:{buyAmount:'8000',sellAmount:'9600',realizedProfitLoss:'1600'},meta:{accountId:id,count:securityId==='3'?0:160}}};
  }else if(p.endsWith('/recent-buys'))return {status:200,body:{data:recent,meta:{accountId:id,count:7,total:7,more:false}}};
  else if(p.endsWith('/target-arrivals'))return {status:200,body:{data:[],meta:{total:0,collectedAt:'2026-10-13T03:00:00Z'}}};
  else if(p.endsWith('/compound-plans')){
   const rows=[2024,2025,2026,2027].map(year=>({year,asset:'999999999999',contributed:'90',realizedAsset:year===2024?'123':null,evaluationAmount:year===2024?'123':year===2026?'1234567890123':null,investmentAmount:year===2024?'0':year===2026?'999999999999':null,valuationDate:year===2024?'2024-12-31':year===2026?'2026-10-12':null}));data={accountId:id,currentYear:2026,currentAssets:'150',pricingComplete:true,asOf:'2026-10-13T03:00:00Z',plans:[{id:'1',planName:'검증 계획',startYear:2024,endYear:2027,duration:4,initialAssetValue:'100',annualContributionAmount:'0',status:'ACTIVE',goals:[{id:'1',goalName:'검증 목표',annualTargetRate:'10',displayColor:'#5EA1F0',isDefault:true,isVisible:true,rows,yearTarget:'133',finalTarget:'146',progress:'100'}]}]};
  }else if(p==='/api/collection/monitoring')data={features:[]};
  return {status:200,body:{data}};
 }
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/pages/read')return route.fulfill({json:{data:await Promise.all((route.request().postDataJSON().paths as string[]).map(read))}});
  if(u.pathname==='/api/pages/home')return route.fulfill({json:{data:{accounts,accountId:u.searchParams.get('accountId')??'1',dashboard:{...dashboard,holdings,purchaseAmount:'1000'},recent:{data:recent.slice(0,5),meta:{count:5,total:7,more:true}},targets:{data:[],meta:{total:0}}}}});
  if(u.pathname.startsWith('/api/pages/'))return route.fulfill({status:404,json:{error:{message:'legacy'}}});
  const result=await read(u.pathname.slice(4)+u.search);await route.fulfill({status:result.status,json:result.body});
 });
 return {read,reads,history,releaseHistory:()=>releaseHistory(),hold:()=>{held=true;},release:()=>{held=false;release();}};
}
