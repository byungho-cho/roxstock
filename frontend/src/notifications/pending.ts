const key='roxstock:pending-push-event';
export function rememberPush(search:string){const id=new URLSearchParams(search).get('pushEvent');if(id&&/^[a-f0-9-]{36}$/.test(id))sessionStorage.setItem(key,id);}
export function pendingPush(){const id=sessionStorage.getItem(key);return id&&/^[a-f0-9-]{36}$/.test(id)?id:null;}
export function clearPendingPush(){sessionStorage.removeItem(key);}
