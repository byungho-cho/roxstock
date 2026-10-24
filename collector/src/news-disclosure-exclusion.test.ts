import assert from 'node:assert/strict';
import test from 'node:test';
import type {PrismaClient} from '@roxstock/shared/prisma';
import type {NewsTarget} from '@roxstock/shared/news/policy';
import {defaultNewsSources} from './news-providers.js';

test('unmapped corporations are normal disclosure exclusions without source or database requests',async()=>{
 const db=new Proxy({},{get(){throw Error('unexpected database request');}}) as PrismaClient;
 const source=defaultNewsSources(db).find(s=>s.id==='DART')!;
 const targets:NewsTarget[]=[{id:1n,symbol:'123456',name:'미연결 기업',securityType:'STOCK',corpCode:null},
  {id:2n,symbol:'234567',name:'ETF',securityType:'ETF',corpCode:null}];
 const result=await source.collect(targets,new Date('2026-10-23T00:00:00Z'),new Date('2026-10-24T00:00:00Z'));
 assert.equal(result.requests,0);
 assert.equal(result.normalExcluded,2);
 assert.equal(result.diagnostics?.mappingMissing,1);
 assert.deepEqual(result.warnings,['NORMAL_EXCLUDED:2']);
 assert.deepEqual(result.candidates,[]);
 // The collector excludes only NORMAL_EXCLUDED warnings from failure classification.
 assert.equal(result.warnings.filter(w=>!w.startsWith('NORMAL_EXCLUDED:')).length,0);
 assert.equal(result.normalExcluded,targets.length);
});
