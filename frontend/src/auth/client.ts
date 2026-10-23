export type UserSettings={theme?:'dark'|'light'|'system';favorites?:string[];selectedAccountId?:string;legacyImported?:boolean};
export type AuthUser={id:string;email:string;role:string;mustChangePassword:boolean;settings?:UserSettings;legacyOwner?:boolean};
let identity:string|undefined;
export function setAuthIdentity(id?:string){identity=id;}
export const identityHeaders=():Record<string,string>=>identity?{'X-Auth-User':identity}:{};
export const authBroadcastSource=globalThis.crypto.randomUUID();
export const csrfToken=()=>typeof document==='undefined'?'':document.cookie.split('; ').find(v=>v.startsWith('rox_csrf='))?.slice(9)??'';
export class AuthRequestError extends Error {
  constructor(public status:number,public code:string,message:string){super(message);}
}
const sessionFailures=new Set(['LOGIN_REQUIRED','AUTH_COOKIE_MISSING','AUTH_COOKIE_INVALID','AUTH_SESSION_UNKNOWN','AUTH_SESSION_EXPIRED','AUTH_SESSION_REVOKED','AUTH_USER_DISABLED','AUTH_TOKEN_MISMATCH','AUTH_TOKEN_RETIRED','AUTH_TEMPORARY_EXPIRED']);
export const confirmedSessionFailure=(error:unknown)=>error instanceof AuthRequestError&&error.status===401&&sessionFailures.has(error.code);
let cookieQueue:Promise<unknown>=Promise.resolve();
export async function authRequest<T>(path:string,body?:unknown):Promise<T>{
  const execute=()=>executeAuthRequest<T>(path,body);
  if(!['me','refresh','login','logout','change-password'].includes(path))return execute();
  // Same-origin Web Locks serialize cookie responses across tabs. Older single-view
  // WebViews retain the same ordering within their document through the promise queue.
  if(typeof navigator!=='undefined'&&navigator.locks)return navigator.locks.request('roxstock-auth-cookie',execute);
  const result=cookieQueue.then(execute,execute);cookieQueue=result.then(()=>{},()=>{});return result;
}
async function executeAuthRequest<T>(path:string,body?:unknown):Promise<T>{
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
  try{
    const result=await fetch('/api/auth/'+path,{signal:abort.signal,cache:'no-store',method:body===undefined?'GET':'POST',credentials:'same-origin',headers:{...(['settings','change-password'].includes(path)?identityHeaders():{}),...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrfToken()})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const payload=await result.json().catch(()=>{throw new AuthRequestError(result.status,'AUTH_RESPONSE_INVALID','로그인 응답을 확인하지 못했습니다. 다시 시도해 주세요.');});
    if(!result.ok)throw new AuthRequestError(result.status,payload.error?.code??'AUTH_HTTP_ERROR',payload.error?.message??'요청에 실패했습니다.');
    if(!payload||!('data' in payload))throw new AuthRequestError(result.status,'AUTH_RESPONSE_INVALID','로그인 응답을 확인하지 못했습니다.');
    if(['login','logout','reset','change-password'].includes(path)&&typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('roxstock-auth');channel.postMessage({source:authBroadcastSource});channel.close();}
    return payload.data as T;
  }catch(error){
    if(error instanceof AuthRequestError)throw error;
    // No URL, user identifier, credentials or original error text in diagnostics.
    const code=abort.signal.aborted?'AUTH_TIMEOUT':'AUTH_NETWORK_UNAVAILABLE';
    console.info('roxstock-auth',code);
    throw new AuthRequestError(0,code,'연결 상태를 확인한 뒤 다시 시도해 주세요.');
  }finally{clearTimeout(timer);}
}
