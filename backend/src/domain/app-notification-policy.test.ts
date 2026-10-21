import test from 'node:test';
import assert from 'node:assert/strict';
import {notificationDestination,targetTransition,rearmAfterMs} from '../notifications/policy.js';
import {maskAccount} from '../routes/admin-users.js';
test('target baseline, continued match, short bounce, 24h rearm and missing observation gap',()=>{
 const at=new Date('2026-10-21T00:00:00Z');let s=targetTransition(null,true,true,at);assert.equal(s.fire,false);
 s=targetTransition(s,true,false,new Date(+at+60000));assert.equal(s.fire,false);
 s=targetTransition(s,false,false,new Date(+at+120000));s=targetTransition(s,true,false,new Date(+at+180000));assert.equal(s.fire,false);
 s=targetTransition(s,false,false,new Date(+at+240000));const start=+at+240000;
 for(let t=start+60000;t<=start+rearmAfterMs;t+=60000)s=targetTransition(s,false,false,new Date(t));
 s=targetTransition(s,true,false,new Date(start+rearmAfterMs+60000));assert.equal(s.fire,true);assert.equal(s.generation,1);
 assert.equal(targetTransition(s,true,false,new Date(start+rearmAfterMs+120000)).fire,false);
 const gap=targetTransition({...s,matched:false,falseSince:at},true,false,new Date(start+rearmAfterMs+600000));assert.equal(gap.fire,false);
 assert.equal(targetTransition(null,true,false,at).fire,true);
 const unknown={matched:false,falseSince:null,lastObservedAt:at,lastEventAt:null,generation:0};const firstKnown=targetTransition(unknown,true,false,new Date(+at+60000));assert.equal(firstKnown.fire,false);const dipped=targetTransition(firstKnown,false,false,new Date(+at+120000));assert.equal(targetTransition(dipped,true,false,new Date(+at+180000)).fire,false);
 const initialUnmatched=targetTransition(null,false,true,at);assert.equal(targetTransition(initialUnmatched,true,false,new Date(+at+60000)).fire,true);
});
test('notification routes are server-defined and account projections never expose short originals',()=>{
 assert.equal(notificationDestination('TARGET'),'/');assert.equal(notificationDestination('NEWS'),'/detail/stock-news');assert.equal(notificationDestination('https://evil.invalid'),null);
 assert.equal(maskAccount('1234'),'****');assert.equal(maskAccount('1234567890'),'******7890');assert.equal(maskAccount(null),'미등록');
});
