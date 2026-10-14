import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildApp} from '../app.js';
import release from '../release.json' with {type:'json'};
test('release endpoint is independent of DB and cannot be cached',async()=>{
 const app=buildApp();
 try{
  const response=await app.inject({method:'GET',url:'/api/version'});
  assert.equal(response.statusCode,200);
  assert.deepEqual(response.json(),{data:release});
  assert.equal(response.headers['cache-control'],'no-store');
 }finally{await app.close();}
});
