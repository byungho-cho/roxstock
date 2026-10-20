import {test as base} from '@playwright/test';
export * from '@playwright/test';
/** Existing screen unit fixtures isolate rendering from authentication/network.
 * auth-v12.spec.ts deliberately imports the real Playwright fixture instead.
 * Server authentication is covered separately against the production buildApp and a real DB.
 */
export const test=base.extend({page:async({page},use)=>{
 await page.addInitScript(()=>{
  const original=window.fetch.bind(window);
  window.fetch=(input,init)=>{
   const value=typeof input==='string'?input:input instanceof URL?input.href:input.url;
   const path=new URL(value,location.origin).pathname;
   const settings=()=>JSON.parse(sessionStorage.getItem('fixture-auth-settings')??'{}');
   if(path==='/api/auth/me')return Promise.resolve(new Response(JSON.stringify({data:{id:'fixture-user',email:'fixture@example.invalid',role:'ADMIN',mustChangePassword:false,settings:settings()}}),{status:200,headers:{'content-type':'application/json'}}));
   if(path==='/api/auth/settings'){
    const next={...settings(),...JSON.parse(String(init?.body??'{}'))};sessionStorage.setItem('fixture-auth-settings',JSON.stringify(next));
    return Promise.resolve(new Response(JSON.stringify({data:next}),{status:200,headers:{'content-type':'application/json'}}));
   }
   if(new URL(value,location.origin).pathname==='/api/auth/refresh')return Promise.resolve(new Response(JSON.stringify({data:{refreshed:true}}),{status:200,headers:{'content-type':'application/json'}}));
   return original(input,init);
  };
 });
 await use(page);
}});
