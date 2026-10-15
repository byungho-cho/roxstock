import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectServices} from '../deployment-scope.mjs';
test('collector-only and API-only source changes remain independent',()=>{
 assert.deepEqual(selectServices(['collector/src/worker.ts','backend/src/release.json']),{backend:false,collector:true,frontend:false});
 assert.deepEqual(selectServices(['backend/src/server.ts']),{backend:true,collector:false,frontend:false});
});
test('shared/database affect both services and version metadata does not force frontend',()=>{
 for(const p of ['shared/src/lib/prisma.ts','database/prisma/schema.prisma'])assert.deepEqual(selectServices([p]),{backend:true,collector:true,frontend:false});
 assert.deepEqual(selectServices(['backend/src/release.json','collector/README.md']),{backend:false,collector:false,frontend:false});
});
test('collector-only lock resolution does not rebuild API/frontend',()=>{
 const before={packages:{backend:{dependencies:{fastify:'1'}},collector:{dependencies:{feed:'1'}},frontend:{dependencies:{vue:'1'}},'node_modules/fastify':{version:'1'},'node_modules/feed':{version:'1'},'node_modules/vue':{version:'1'}}};
 const after=structuredClone(before);after.packages['node_modules/feed'].version='2';
 assert.deepEqual(selectServices(['package-lock.json'],{before,after}),{backend:false,collector:true,frontend:false});
});
test('resolved peer changes include every affected workspace',()=>{
 const before={packages:{backend:{dependencies:{adapter:'1'}},collector:{dependencies:{feed:'1'}},frontend:{},'node_modules/adapter':{version:'1',peerDependencies:{engine:'*'}},'node_modules/engine':{version:'1'},'node_modules/feed':{version:'1'}}};
 const after=structuredClone(before);after.packages['node_modules/engine'].version='2';
 assert.deepEqual(selectServices(['package-lock.json'],{before,after}),{backend:true,collector:false,frontend:false});
});
