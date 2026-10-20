import type {Page} from './authenticated-test';
export async function fixture(page:Page,{count=4,large=false,delayStock=''}={}) {
 await page.clock.setFixedTime(new Date('2026-10-13T03:00:00Z'));
 let price:number|null=large?999999999:350000,release!:()=>void;
 const gate=new Promise<void>(r=>release=r),reads:string[]=[],writes:string[]=[];
 const securities=Array.from({length:count},(_,i)=>({id:String(i+1),symbol:String(i+1).padStart(6,'0'),name:(i===2?'제외':'순환')+(i+1),marketType:'KOSPI',listType:'HOLDING',hasTradeHistory:true,isActive:true}));
 const lots=(id:string)=>Array.from({length:3},(_,i)=>({id:`${id}-${i}`,boughtAt:(large?'1990-01-01':'2026-10-13')+'T00:00:00Z',buyDate:large?'1990-01-01':'2026-10-13',security:securities.find(s=>s.id===id),quantity:large?'9999999':'10',soldQuantity:'3',remainingQuantity:large?'9999996':'7',unitPrice:large?'888888888':'304000',memo:null,sellTrades:[]}));
 const account={id:'1',name:'검증 계좌',isActive:true,isDefault:true,cashBalance:'1000000'};
 async function read(path:string):Promise<{status:number;body:unknown}> {
  reads.push(path);const u=new URL('http://fixture/api'+path),p=u.pathname;
  let data:unknown=[];
  if(p==='/api/accounts')data=[account];
  else if(p==='/api/securities')data=securities.map(s=>({...s,currentPrice:price===null?null:String(price),previousClosePrice:'300000'}));
  else if(p.endsWith('/holdings'))data=securities.map((s,i)=>({securityId:s.id,symbol:s.symbol,name:s.name,quantity:String(100-i),averagePurchasePrice:'304000',purchaseAmount:String(304000*(100-i)),currentPrice:price===null?null:String(price),marketValue:price===null?null:String(price*(100-i)),unrealizedProfitLoss:price===null?null:String((price-304000)*(100-i)),priceUpdatedAt:'2026-10-13T03:00:00Z'}));
  else if(p.endsWith('/buy-lots')){const id=u.searchParams.get('securityId')??'1';if(id===delayStock)await gate;data=lots(id);}
  else if(p.endsWith('/investment-profit'))data={accountId:'1',securityId:u.searchParams.get('securityId'),events:[],capital:[]};
  else if(p.endsWith('/trades'))return {status:200,body:{data:[],summary:{buyAmount:'0',sellAmount:'0',realizedProfitLoss:'0'}}};
  else if(p.startsWith('/api/buy-trades/')){const id=p.split('/').at(-1)!;data={...lots(id.split('-')[0])[0],id,type:'BUY',account,remainingQuantity:'7',cashTransaction:null,sellTrades:[{id:'linked',quantity:'3'}]};}
  return {status:200,body:{data}};
 }
 await page.route('**/api/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/api/pages/read'){const parts=await Promise.all((route.request().postDataJSON().paths as string[]).map(read));return route.fulfill({json:{data:parts}});}
  if(u.pathname.startsWith('/api/pages/'))return route.fulfill({status:404,json:{error:{message:'Legacy bootstrap fixture'}}});
  if(route.request().method()!=='GET'){writes.push(u.pathname);return route.fulfill({json:{data:{id:'test'}}});}
  const r=await read(u.pathname.slice(4)+u.search);return route.fulfill({status:r.status,json:r.body});
 });
 return {reads,writes,release,setPrice:async(value:number|null)=>{price=value;await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange',{bubbles:true}));Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange',{bubbles:true}));});}};
}
