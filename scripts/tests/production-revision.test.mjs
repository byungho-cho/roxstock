import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {selectDeployedServices} from '../deployment-scope.mjs';
const yaml=readFileSync('.github/workflows/production-deploy.yml','utf8');
const source=yaml.split('          script: |\n')[1].split('      - uses: actions/checkout')[0].split('\n').map(l=>l.replace(/^            /,'')).join('\n');
test('superseded dispatch cannot select any production service',async()=>{
 const output={},sha='f'.repeat(40);
 await vm.runInNewContext(`(async()=>{${source}})()`,{github:{rest:{repos:{getBranch:async()=>({data:{commit:{sha:'e'.repeat(40)}}})}}},context:{repo:{}},process:{env:{REQUESTED_SHA:sha}},core:{setOutput:(k,v)=>output[k]=v,notice:()=>{}}});
 assert.equal(output.current,'false');assert.equal(output.sha,sha);
});
const image=(name,sha,repository=name,status='healthy')=>`/roxstock-${name}|newrox/roxstock-${repository}:sha-${sha}|${status}`;
const a='a'.repeat(40),b='b'.repeat(40),head='c'.repeat(40);
const deployed=(api=a,workers=a,front=a)=>[image('backend',api),image('collector',workers,'collector'),image('realtime-collector',workers,'collector'),image('dart-collector',workers,'collector'),image('frontend',front)].join('\n');
test('actual images preserve already deployed API after a partial pipeline failure',()=>{
 const selected=selectDeployedServices(deployed(b,a,a),head,{resolve:s=>s,compare:base=>({backend:base!==b,collector:true,frontend:false})});
 assert.deepEqual(selected,{backend:false,collector:true,frontend:false});
});
test('mixed collector images, legacy combined images and unhealthy targets are detected independently',()=>{
 const compare=()=>({backend:false,collector:false,frontend:false}),resolve=s=>s;
 const mixed=deployed().replace(image('dart-collector',a,'collector'),image('dart-collector',b,'collector'));
 assert.deepEqual(selectDeployedServices(mixed,head,{resolve,compare}),{backend:false,collector:true,frontend:false});
 assert.equal(selectDeployedServices(deployed().replace(image('collector',a,'collector'),image('collector',a,'backend')),head,{resolve,compare}).collector,true);
 assert.deepEqual(selectDeployedServices(deployed().replace(image('backend',a),image('backend',a,'backend','unhealthy')),head,{resolve,compare}),{backend:true,collector:false,frontend:false});
 assert.throws(()=>selectDeployedServices('',head,{resolve,compare}),/Missing production container/);
});
