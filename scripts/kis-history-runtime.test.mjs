import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const fixture=new URL('./kis-history-runtime-fixture.mjs',import.meta.url),worker=fileURLToPath(new URL('./kis-history-backfill.mjs',import.meta.url));
function execute(scenario){
 const r=spawnSync(process.execPath,['--no-warnings','--experimental-loader',fixture.href,worker],{encoding:'utf8',env:{...process.env,HISTORY_TEST_CASE:scenario,KIS_HISTORY_PRODUCTION_ACK:'temporary-universe-history',KIS_HISTORY_DIRECTORY:'/var/lib/roxstock/kis-history',DATABASE_URL:'"mysql://fixture/roxstock"',KIS_APP_KEY:'"mock"',KIS_APP_SECRET:'"mock"',DART_API_KEY:'"mock"'}});
 assert.equal(r.error,undefined);const lines=r.stdout.trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));
 const result=lines.find(x=>x.testWrites);assert.ok(result,r.stderr+' '+r.stdout);return {...result,exit:r.status};
}
test('verified history save completes task and checkpoints without reopening stage 2',()=>{
 const r=execute('success');assert.equal(r.exit,0);assert.equal(r.checkpoint.cursor,1);assert.equal(r.checkpoint.done,true);assert.equal(r.checkpoint.totals.success,1);
 assert.equal(r.testWrites.filter(x=>x.filing).length,1);assert.equal(r.testWrites.filter(x=>x.complete).length,1);assert.equal(r.checkpoint.priorDartState.backfillCompletedAt,'preserved');
 assert.ok(r.testWrites.find(x=>x.job)?.meta.priorityExcluded);
});
test('priority and existing financial data never receive a financial write',()=>{
 for(const scenario of ['priority','existing']){const r=execute(scenario);assert.equal(r.exit,0);assert.equal(r.testWrites.filter(x=>x.filing||x.task||x.complete).length,0);}
});
test('confirmed absent report and missing rows are not false successes',()=>{
 for(const [scenario,status]of [['missing','NO_FILING'],['unavailable','DATA_UNAVAILABLE']]){const r=execute(scenario);assert.equal(r.exit,0);assert.equal(r.testWrites.find(x=>x.task).task.status,status);assert.equal(r.testWrites.filter(x=>x.filing||x.complete).length,0);assert.equal(r.checkpoint.totals.success,0);}
});
test('quota stops without advancing task or marking source unavailable',()=>{
 const r=execute('quota');assert.equal(r.exit,1);assert.equal(r.checkpoint.cursor,0);assert.equal(r.testWrites.filter(x=>x.task||x.filing).length,0);assert.equal(r.checkpoint.lastStop.code,'DAILY_CALL_LIMIT');
});
