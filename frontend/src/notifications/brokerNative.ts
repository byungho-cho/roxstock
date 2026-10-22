type Result={protocolVersion?:number;total?:number;entries?:{id:string;raw:string;receivedAt:number;status:string}[];permission?:boolean;error?:string;requestId:string};
declare global{interface Window{RoxStockNative?:{postMessage:(s:string)=>void;onmessage?:(e:MessageEvent)=>void}}}
let serial=0;const pending=new Map<string,{resolve:(r:Result)=>void;reject:(e:Error)=>void}>();
export const brokerAvailable=()=>!!window.RoxStockNative;
export function brokerNative(action:string,extra:Record<string,string>={}):Promise<Result>{
 const bridge=window.RoxStockNative;if(!bridge)return Promise.reject(new Error('거래 알림은 알림 지원 Android 앱에서만 사용할 수 있습니다.'));
 bridge.onmessage=e=>{try{const r=JSON.parse(e.data),p=pending.get(r.requestId);if(p){pending.delete(r.requestId);r.error?p.reject(new Error(r.error)):p.resolve(r);}}catch{/* Ignore malformed bridge responses. */}};
 return new Promise((resolve,reject)=>{const requestId=String(++serial),timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('거래 알림 응답을 확인하지 못했습니다.'));},10000);pending.set(requestId,{resolve:r=>{clearTimeout(timer);resolve(r);},reject:e=>{clearTimeout(timer);reject(e);}});bridge.postMessage(JSON.stringify({action,requestId,...extra}));});
}
