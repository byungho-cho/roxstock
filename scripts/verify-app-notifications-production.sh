#!/usr/bin/env bash
# Read-only deployment checks except for the existing minimal admin-read audit records.
set -Eeuo pipefail
SHA="${1:?immutable SHA required}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2
for component in backend frontend; do
  image="$(docker inspect --format '{{.Config.Image}}' "roxstock-$component")"
  [[ "$image" == "newrox/roxstock-$component:sha-${SHA:0:7}" || "$image" == "newrox/roxstock-$component:sha-$SHA" ]] || exit 1
done
docker exec -i roxstock-backend node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import Fastify from 'fastify';
import {prisma} from './shared/dist/lib/prisma.js';
import {notificationRoutes} from './backend/dist/notifications/routes.js';
import {adminUserRoutes} from './backend/dist/routes/admin-users.js';
const app=Fastify();
try{
 const admin=await prisma.authUser.findFirst({where:{role:'ADMIN',verifiedAt:{not:null}},select:{id:true}});assert.ok(admin);
 app.decorateRequest('auth',null);app.addHook('onRequest',async req=>{req.auth={userId:admin.id,role:req.headers['x-smoke-role']==='USER'?'USER':'ADMIN',sessionId:'deployment-read-check',mustChangePassword:false};});
 await app.register(notificationRoutes,{prefix:'/api'});await app.register(adminUserRoutes,{prefix:'/api'});
 const settings=await app.inject('/api/notifications/settings');assert.equal(settings.statusCode,200);
 assert.equal(typeof settings.json().data.targetEnabled,'boolean');assert.equal(typeof settings.json().data.newsEnabled,'boolean');
 const list=await app.inject('/api/admin/users');assert.equal(list.statusCode,200);const items=list.json().data.items;assert.ok(items.length<=30);
 for(const item of items){assert.deepEqual(Object.keys(item).sort(),['createdAt','email','id','status']);assert.ok(!Number.isNaN(Date.parse(item.createdAt)));}
 if(items.length){const detail=await app.inject('/api/admin/users/'+items[0].id);assert.equal(detail.statusCode,200);const data=detail.json().data;assert.equal(data.createdAt,items[0].createdAt);assert.ok(data.accounts.length<=100);for(const a of data.accounts){assert.deepEqual(Object.keys(a).sort(),['accountNumber','brokerName','id','isDefault']);assert.ok(a.accountNumber==='미등록'||/^\*+(?:.{4})?$/.test(a.accountNumber));}}
 assert.equal((await app.inject({url:'/api/admin/users',headers:{'x-smoke-role':'USER'}})).statusCode,403);
 assert.equal((await app.inject({url:'/api/admin/users/'+admin.id,headers:{'x-smoke-role':'USER'}})).statusCode,403);
 for(const path of ['/api/notifications/settings','/api/admin/users','/api/collection/monitoring']){const r=await fetch('https://newrox.cafe24.com'+path,{signal:AbortSignal.timeout(10000)});assert.equal(r.status,401);}
 const version=await fetch('https://newrox.cafe24.com/api/version',{signal:AbortSignal.timeout(10000)});assert.equal((await version.json()).data.version,'1.2.3');
 const apk=await fetch('https://newrox.cafe24.com/downloads/android/notifications-latest.json',{signal:AbortSignal.timeout(10000)});assert.equal(apk.status,200);const manifest=await apk.json();assert.equal(manifest.version,'0.1.7');
 let serverCredentialPresent=false;if(process.env.FCM_SERVICE_ACCOUNT_FILE)try{await access(process.env.FCM_SERVICE_ACCOUNT_FILE);serverCredentialPresent=true;}catch{}
 console.log('APP_NOTIFICATION_DEPLOYMENT_VERIFIED',JSON.stringify({version:'1.2.3',adminProjectionChecked:true,anonymousDenied:true,ordinaryUserApiDenied:true,apiHandlerOnly:true,authenticatedBrowserChecked:false,apkVersion:manifest.version,clientFirebaseConfigured:manifest.firebaseConfigured===true,serverCredentialPresent,enabledPreferences:await prisma.appNotificationPreference.count({where:{OR:[{targetEnabled:true},{newsEnabled:true}]}}),realDeviceVerified:false}));
}catch{console.error('APP_NOTIFICATION_DEPLOYMENT_VERIFICATION_FAILED');process.exitCode=1;}finally{await app.close();await prisma.$disconnect();}
JS
