// DOM/API benchmark only: this does not measure browser paint, layout, or physical devices.
// Pass built API bundles and install happy-dom in a temporary tools directory.
import { readFileSync, readdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
const { Window } = await import(process.env.ROX_HAPPY_DOM_MODULE ?? 'happy-dom');
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
const stamp='2026-10-07T03:00:00Z';
const accounts=[{id:'1',name:'벤치마크 계좌',isDefault:true,isActive:true,cashBalance:'1000'}];
const dashboard={account:{id:'1'},cashBalance:'1000',purchaseAmount:'2000',stockValue:'3000',totalAssetValue:'4000',pricingComplete:true,latestPriceUpdatedAt:stamp,holdings:[]};
const delays={'accounts':40,'dashboard':180,'asset-history':600,'target-arrivals':120,'buy-lots':100};
export async function measure(bundleDirectory,width=370) {
 const window=new Window({url:'http://localhost/',width,height:465,settings:{enableJavaScriptEvaluation:true,suppressInsecureJavaScriptEnvironmentWarning:true}});
 const errors=[];window.addEventListener('error',e=>errors.push(e.message));
 const requests=[];
 window.fetch=async raw=>{
  const path=new URL(String(raw),'http://localhost').pathname, key=path.split('/').at(-1);
  requests.push({path,started:performance.now()});await sleep(delays[key]??0);
  const data=key==='accounts'?{data:accounts}:key==='dashboard'?{data:dashboard}:key==='asset-history'?{data:[{date:'2026-10-06',totalAssetValue:'3900'},{date:'2026-10-07',totalAssetValue:'4000'}]}:key==='target-arrivals'?{data:[],meta:{accountId:'1',total:0,enabled:true,unavailableCount:0,priceAsOf:stamp}}:{data:[]};
  return {ok:true,status:200,json:async()=>data};
 };
 window.document.body.innerHTML='<div id="root"></div>';
 window.scrollTo=()=>{};
 const js=readdirSync(bundleDirectory+'/assets').find(name=>name.endsWith('.js'));
 const start=performance.now();window.eval(readFileSync(bundleDirectory+'/assets/'+js,'utf8').replaceAll('import.meta', '({url:'+JSON.stringify('http://localhost/assets/'+js)+'})'));
 let first=null,full=null;
 for(let i=0;i<500;i++){
  await sleep(10);
  const text=window.document.body.textContent;
  if(first===null&&(text.includes('4,000')||[...window.document.querySelectorAll('[data-testid="target-arrival-card"] [role="status"], [data-testid="recent-buys-card"] [role="status"]')].some(node=>node.textContent==='내용이 없습니다.')))first=performance.now()-start;
  if(text.includes('4,000')&&window.document.querySelector('[data-testid="recent-buys-card"]')&&!window.document.querySelector('.MuiSkeleton-root')){full=performance.now()-start;break;}
 }
 const coldRequests=requests.length;
 window.history.pushState({},'', '/more');window.dispatchEvent(new window.PopStateEvent('popstate'));await sleep(100);
 const warmStart=performance.now();window.history.pushState({},'', '/');window.dispatchEvent(new window.PopStateEvent('popstate'));
 let warm=null;for(let i=0;i<100;i++){await sleep(5);if(window.document.body.textContent.includes('4,000')){warm=Math.round(performance.now()-warmStart);break;}}
 const output={warmFirstCardDOMMs:warm,warmRequests:requests.length-coldRequests,width,firstValidCardDOMMs:first===null?null:Math.round(first),allCardsDOMMs:full===null?null:Math.round(full),requests:coldRequests,paths:requests.map(r=>r.path),errors};
 await window.happyDOM.abort();await window.happyDOM.close();return output;
}
if(process.argv[2]){
 for(const dir of process.argv.slice(2)){
  const samples=[];for(let i=0;i<3;i++)samples.push(await measure(dir));
  console.log(JSON.stringify({bundle:dir,samples}));
 }
}
