import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const walk=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()&&!['generated','dist'].includes(e.name)?walk(join(p,e.name)):e.isFile()&&e.name.endsWith('.ts')?[join(p,e.name)]:[]);
test('production imports flow only from services into shared',()=>{
 for(const dir of ['backend','collector','shared'])for(const file of walk(dir+'/src').filter(p=>!p.endsWith('.test.ts')&&!p.includes('tests'))){
  const source=readFileSync(file,'utf8');
  for(const m of source.matchAll(/(?:from\s*|import\s*\()(['"])([^'"]+)\1/g)){
   assert.doesNotMatch(m[2],/(?:^|\/)(backend|collector)\/src\//,file);
   if(dir==='backend')assert.doesNotMatch(m[2],/collector\//,file);
  }
 }
});
test('service replacement always uses explicit no-deps targets',()=>{
 const source=readFileSync('scripts/deploy-service.sh','utf8');
 assert.match(source,/services=\(backend\)/);
 assert.match(source,/services=\(collector realtime-collector dart-collector\)/);
 for(const line of source.split('\n').filter(l=>l.includes('up -d')))assert.match(line,/--no-deps/);
 assert.doesNotMatch(source,/compose.*down/);
});
