import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,copyFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {runProductionComponent} from '../run-production-component.mjs';

test('deployment uploads an immutable script and closes stdin for every SSH/SCP child',()=>{
 const calls=[],sha='d'.repeat(40),env={DEPLOY_HOST:'example.test',DEPLOY_USER:'deploy',DEPLOY_PORT:'22'};
 runProductionComponent(sha,'backend','/private/key',env,(command,args,options)=>calls.push({command,args,options}));
 assert.deepEqual(calls.map(x=>x.command),['ssh','scp','ssh']);
 for(const call of calls)assert.equal(call.options.stdio[0],'ignore');
 assert.equal(calls[1].args.at(-2),'scripts/deploy-production-component.sh');
 assert.match(calls[2].args.at(-1),/exec bash '.*\.sh' '[a-f0-9]{40}' 'backend' <\/dev\/null$/);
 assert.doesNotMatch(calls[2].args.at(-1),/bash -s/);
 assert.throws(()=>runProductionComponent('main','backend','key',env),/Immutable/);
 assert.throws(()=>runProductionComponent(sha,'backend','key',{...env,DEPLOY_HOST:'host;echo secret'}),/Invalid/);
});

test('file execution retains post-deployment steps when a child consumes stdin',{skip:process.platform==='win32'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'roxstock-stdin-'));
 try{
  const child=join(dir,'child.sh'),parent=join(dir,'parent.sh');
  writeFileSync(child,'cat >/dev/null\n');const script=`bash '${child}'\nprintf 'METADATA_PUBLISHED\\n'\n`;writeFileSync(parent,script);
  const streamed=spawnSync('bash',['-s'],{input:script,encoding:'utf8'});
  assert.equal(streamed.status,0);assert.doesNotMatch(streamed.stdout,/METADATA_PUBLISHED/);
  const stored=spawnSync('bash',[parent],{stdio:['ignore','pipe','pipe'],encoding:'utf8'});
  assert.equal(stored.status,0,stored.stderr);assert.match(stored.stdout,/METADATA_PUBLISHED/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('deployment replaces only its own containers, migrates once and rolls back only a failed target',{skip:process.platform==='win32'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'roxstock-service-deploy-'));
 const old='sha-'+'a'.repeat(40),next='sha-'+'b'.repeat(40),bad='sha-'+'c'.repeat(40);
 try{
  for(const p of ['scripts','backend','infra/docker','state','bin'])mkdirSync(join(dir,p),{recursive:true});
  copyFileSync('scripts/deploy-service.sh',join(dir,'scripts/deploy-service.sh'));
  for(const file of ['recover-profit-migration.sh','recover-analysis-cache-migration.sh'])writeFileSync(join(dir,'scripts',file),'echo UNCHANGED\n');
  writeFileSync(join(dir,'backend/.env.production'),'DATABASE_URL=mysql://fixture\n');chmodSync(join(dir,'backend/.env.production'),0o600);
  writeFileSync(join(dir,'infra/docker/compose.prod-backend.yml'),'services: {}\n');
  const initial=Object.fromEntries(['backend','collector','realtime-collector','dart-collector'].map(s=>['roxstock-'+s,{image:'newrox/roxstock-backend:'+old,id:s+'-old',started:'old'}]));
  const stateFile=join(dir,'docker-state.json');writeFileSync(stateFile,JSON.stringify({containers:initial,ops:[]}));
  writeFileSync(join(dir,'bin/docker'),`#!/usr/bin/env node
const fs=require('fs'),p=process.env.FIXTURE_STATE,s=JSON.parse(fs.readFileSync(p)),a=process.argv.slice(2);s.ops.push(a);
const save=()=>fs.writeFileSync(p,JSON.stringify(s));
if(a[0]==='inspect'){
 const c=s.containers[a.at(-1)];
 if(!a.includes('--format'))console.log('[]');else {const f=a[a.indexOf('--format')+1];
 const status=c.image.endsWith(process.env.BAD_TAG)?'unhealthy':'healthy';
 if(f.includes('.Config.Image'))console.log(c.image+(f.includes('.State.Health.Status')?' '+status:''));
 else if(f.includes('.StartedAt'))console.log(c.id+' '+c.started);
 else console.log(status);}
}else if(a[0]==='compose'&&a.includes('up')){
 const i=a.indexOf('never');for(const n of a.slice(i+1)){const c=s.containers['roxstock-'+n];c.image=n==='backend'?process.env.BACKEND_IMAGE:process.env.COLLECTOR_IMAGE;c.id=n+'-'+s.ops.length;c.started='new-'+s.ops.length;}
}else if(a[0]==='compose'&&a.includes('config'))console.log('services: {}');save();
`);chmodSync(join(dir,'bin/docker'),0o755);
  const run=(role,tag)=>spawnSync('bash',[join(dir,'scripts/deploy-service.sh'),role,tag],{encoding:'utf8',env:{...process.env,PATH:join(dir,'bin')+':'+process.env.PATH,ROXSTOCK_STATE_DIR:join(dir,'state'),ROXSTOCK_DEPLOY_LOCKED:'true',FIXTURE_STATE:stateFile,BAD_TAG:bad}});
  let r=run('backend',next);assert.equal(r.status,0,r.stdout+r.stderr);
  let state=JSON.parse(readFileSync(stateFile));assert.equal(state.containers['roxstock-collector'].id,'collector-old');
  const apiId=state.containers['roxstock-backend'].id;
  r=run('collector',next);assert.equal(r.status,0,r.stdout+r.stderr);
  state=JSON.parse(readFileSync(stateFile));assert.equal(state.containers['roxstock-backend'].id,apiId);
  for(const n of ['collector','realtime-collector','dart-collector'])assert.equal(state.containers['roxstock-'+n].image,'newrox/roxstock-collector:'+next);
  const migrations=()=>JSON.parse(readFileSync(stateFile)).ops.filter(a=>a.includes('deploy')&&a.includes('migrate')).length;
  assert.equal(migrations(),1);
  r=run('backend',next);assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(migrations(),1);
  const collectorId=state.containers['roxstock-collector'].id;
  r=run('backend',bad);assert.equal(r.status,1,r.stdout+r.stderr);
  state=JSON.parse(readFileSync(stateFile));assert.equal(state.containers['roxstock-backend'].image,'newrox/roxstock-backend:'+next);
  assert.equal(state.containers['roxstock-collector'].id,collectorId);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
