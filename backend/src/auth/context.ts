import {AsyncLocalStorage} from 'node:async_hooks';
export type AuthIdentity={userId:bigint;role:string;sessionId:string;mustChangePassword:boolean};
export const authContext=new AsyncLocalStorage<AuthIdentity>();
