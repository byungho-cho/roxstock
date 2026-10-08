import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const workflow=readFileSync(new URL('../../.github/workflows/pr-auto-merge.yml',import.meta.url),'utf8');
const source=workflow.split('          script: |\n')[1].split('\n').map(line=>line.replace(/^            /,'')).join('\n');
async function run({scenario='success',paths=['frontend/src/App.tsx'],runs=[],alreadyMerged=false,current=true,draft=false,unstable=false,closed=false}={}) {
 let merged=alreadyMerged,dispatches=0,merges=0;
 const pr=()=>({number:124,draft,base:{ref:'main'},head:{repo:{full_name:'byungho-cho/roxstock'},sha:'head'},state:merged||closed?'closed':'open',merged,mergeable_state:unstable?'unstable':'clean',merge_commit_sha:merged?'confirmed-merge':null});
 const listFiles=()=>{},listWorkflowRuns=()=>{};
 const github={paginate:async(method,args)=>{
  assert.equal(args.per_page,100);
  if(method===listFiles)return paths.map(path=>typeof path==='string'?{filename:path}:path);
  assert.equal(method,listWorkflowRuns);assert.equal(args.head_sha,'confirmed-merge');return runs;
 },rest:{repos:{getBranch:async()=>({data:{commit:{sha:current?'confirmed-merge':'newer'}}})},pulls:{listFiles,get:async()=>({data:pr()}),merge:async()=>{merges++;if(scenario!=='unmerged-error')merged=true;if(scenario!=='success')throw new Error('Pull Request is not mergeable');}},actions:{listWorkflowRuns,createWorkflowDispatch:async args=>{assert.equal(args.inputs.target_sha,'confirmed-merge');dispatches++;}}}};
 const promise=vm.runInNewContext(`(async()=>{${source}})()`,{github,context:{payload:{pull_request:{number:124}},repo:{owner:'byungho-cho',repo:'roxstock'}},process:{env:{GITHUB_REPOSITORY:'byungho-cho/roxstock'}},core:{notice:()=>{}}});
 if(scenario==='unmerged-error'){await assert.rejects(promise,/not mergeable/);assert.equal(dispatches,0);}else await promise;
 return {dispatches,merges};
}
for(const scenario of ['concurrent','success','unmerged-error'])test(`auto-merge: ${scenario}`,async()=>{
 const result=await run({scenario});assert.equal(result.dispatches,scenario==='unmerged-error'?0:1);
});
test('documentation/captures only merges without deploying',async()=>{
 assert.deepEqual(await run({paths:['docs/개발현황.md','README.md','docs/qa/screen.png','frontend/README.md','backend/README.md','infra/README.md']}),{dispatches:0,merges:1});
});
test('scope detects application changes after the first page of docs',async()=>{
 assert.equal((await run({paths:[...Array.from({length:150},(_,i)=>`docs/${i}.md`),'backend/src/app.ts']})).dispatches,1);
});
for(const path of ['database/prisma/schema.prisma','infra/caddy/Caddyfile','package-lock.json','compose.yml','.dockerignore','scripts/deploy-production-component.sh','.github/workflows/production-deploy.yml'])test(`deploy scope: ${path}`,async()=>assert.equal((await run({paths:[path]})).dispatches,1));
for(const path of ['scripts/tests/pr-auto-merge.test.mjs','.github/workflows/pr-auto-merge.yml','.github/workflows/pr-gate.yml'])test(`check/orchestration only skips: ${path}`,async()=>assert.equal((await run({paths:[path]})).dispatches,0));
for(const status of ['queued','pending','in_progress','waiting','requested'])test(`deduplicate ${status}`,async()=>assert.equal((await run({alreadyMerged:true,runs:[{status,conclusion:null}]})).dispatches,0));
test('deduplicate successful deployment',async()=>assert.equal((await run({alreadyMerged:true,runs:[{status:'completed',conclusion:'success'}]})).dispatches,0));
for(const conclusion of ['failure','cancelled'])test(`retry ${conclusion}`,async()=>assert.equal((await run({alreadyMerged:true,runs:[{status:'completed',conclusion}]})).dispatches,1));
test('human merged closed PR uses the same single entry',async()=>assert.deepEqual(await run({alreadyMerged:true}),{dispatches:1,merges:0}));
test('unmerged closed PR never dispatches',async()=>assert.deepEqual(await run({closed:true}),{dispatches:0,merges:0}));
test('superseded SHA skips deployment',async()=>assert.equal((await run({alreadyMerged:true,current:false})).dispatches,0));
test('draft remains untouched',async()=>assert.deepEqual(await run({draft:true}),{dispatches:0,merges:0}));
test('unstable optional check still uses protected normal merge',async()=>assert.deepEqual(await run({unstable:true}),{dispatches:1,merges:1}));
test('production has no push trigger; dispatch serialized across all PR events',()=>{
 const production=readFileSync(new URL('../../.github/workflows/production-deploy.yml',import.meta.url),'utf8');
 assert.doesNotMatch(production,/^  push:/m);assert.match(production,/^  workflow_dispatch:/m);
 assert.match(workflow,/group: pr-auto-merge-production/);assert.match(workflow,/ready_for_review, closed/);
});

test('renamed source removed into docs still deploys',async()=>assert.equal((await run({paths:[{filename:'docs/retired.md',previous_filename:'backend/src/retired.ts'}]})).dispatches,1));
