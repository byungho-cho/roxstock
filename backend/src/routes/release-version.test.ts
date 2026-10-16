import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../app.js';
import release from '../release.json' with {type:'json'};
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('release endpoint is independent of DB and cannot be cached',async()=>{
 const app=buildApp();
 try{
  const response=await app.inject({method:'GET',url:'/api/version'});
  assert.equal(response.statusCode,200);
  assert.deepEqual(response.json(),{data:release});
  assert.equal(response.headers['cache-control'],'no-store');
 }finally{await app.close();}
});

test('public release metadata changes without restarting the API and invalid metadata falls back',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'roxstock-release-'));
 const previous=process.env.ROXSTOCK_RELEASE_FILE;
 const file=join(directory,'release.json');process.env.ROXSTOCK_RELEASE_FILE=file;
 const app=buildApp();
 try{
  await writeFile(file,'{"version":"1.0.999"}');
  assert.equal((await app.inject('/api/version')).json().data.version,'1.0.999');
  await writeFile(file,'{"version":"1.0.1000"}');
  assert.equal((await app.inject('/api/version')).json().data.version,'1.0.1000');
  await writeFile(file,'{"version":"1.1.0"}');
  assert.equal((await app.inject('/api/version')).json().data.version,'1.1.0');
  await writeFile(file,'{"version":"invalid"}');
  assert.equal((await app.inject('/api/version')).json().data.version,release.version);
 }finally{
  if(previous===undefined)delete process.env.ROXSTOCK_RELEASE_FILE;else process.env.ROXSTOCK_RELEASE_FILE=previous;
  await app.close();await rm(directory,{recursive:true,force:true});
 }
});
