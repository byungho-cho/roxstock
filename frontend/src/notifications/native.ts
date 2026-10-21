type PushResult={revision?:string;installationId?:string;token?:string;binding?:string;granted?:boolean;configured?:boolean};
declare global {interface Window {RoxStockPush?:{postMessage:(value:string)=>void};}}
let serial=0;const waiting=new Map<string,{resolve:(r:PushResult)=>void;reject:(e:Error)=>void}>();
export const nativePushAvailable=()=>!!window.RoxStockPush;
export function nativePush(action:string,extra:Record<string,string>={}):Promise<PushResult>{
 listenNativePush();
 if(!window.RoxStockPush)return Promise.reject(new Error('앱 알림은 최신 Android 알림 지원 APK에서 사용할 수 있습니다.'));
 return new Promise((resolve,reject)=>{const requestId=String(++serial);const timer=setTimeout(()=>{waiting.delete(requestId);reject(new Error('앱 알림 응답이 없습니다. 다시 시도해 주세요.'));},15000);waiting.set(requestId,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});window.RoxStockPush!.postMessage(JSON.stringify({action,requestId,...extra}));});
}
// Native origin-restricted WebMessage reply; no raw token is stored in web storage.
export function listenNativePush(){const bridge=window.RoxStockPush as (Window['RoxStockPush']&{onmessage?:(e:MessageEvent)=>void});if(!bridge)return;bridge.onmessage=e=>{try{const r=JSON.parse(e.data);const w=waiting.get(r.requestId);if(w){waiting.delete(r.requestId);if(r.error)w.reject(new Error(r.error));else w.resolve(r);}}catch{/* Malformed replies are ignored. */}};}
