export type UserSettings={theme?:'dark'|'light'|'system';favorites?:string[];selectedAccountId?:string;legacyImported?:boolean};
export type AuthUser={id:string;email:string;role:string;mustChangePassword:boolean;settings?:UserSettings;legacyOwner?:boolean};
let identity:string|undefined;
export function setAuthIdentity(id?:string){identity=id;}
export const identityHeaders=():Record<string,string>=>identity?{'X-Auth-User':identity}:{};
export const authBroadcastSource=globalThis.crypto.randomUUID();
export const csrfToken=()=>typeof document==='undefined'?'':document.cookie.split('; ').find(v=>v.startsWith('rox_csrf='))?.slice(9)??'';
export async function authRequest<T>(path:string,body?:unknown):Promise<T>{
  const result=await fetch('/api/auth/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers:{...(['settings','invitations','change-password'].includes(path)?identityHeaders():{}),...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrfToken()})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const payload=await result.json();
  if(!result.ok)throw Object.assign(new Error(payload.error?.message??'요청에 실패했습니다.'),{code:payload.error?.code,status:result.status});
  if(['login','logout','reset','change-password'].includes(path)&&typeof BroadcastChannel!=='undefined'){const channel=new BroadcastChannel('roxstock-auth');channel.postMessage({source:authBroadcastSource});channel.close();}
  return payload.data as T;
}
