import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../.github/workflows/pr-auto-merge.yml',import.meta.url),'utf8').split('          script: |\n')[1].split('\n').map(line=>line.replace(/^            /,'')).join('\n');
for(const scenario of ['concurrent','success','unmerged-error'])test(`auto-merge dispatch: ${scenario}`,async()=>{
 let merged=false,dispatches=0;
 const pr=()=>({number:124,draft:false,base:{ref:'main'},head:{repo:{full_name:'byungho-cho/roxstock'},sha:'head'},state:merged?'closed':'open',merged,mergeable_state:'clean',merge_commit_sha:merged?'confirmed-merge':null});
 const github={rest:{pulls:{get:async()=>({data:pr()}),merge:async()=>{if(scenario!=='unmerged-error')merged=true;if(scenario!=='success')throw new Error('Pull Request is not mergeable');}},actions:{createWorkflowDispatch:async args=>{assert.equal(args.inputs.target_sha,'confirmed-merge');dispatches++;}}}};
 const promise=vm.runInNewContext(`(async()=>{${source}})()`,{github,context:{payload:{pull_request:{number:124}},repo:{owner:'byungho-cho',repo:'roxstock'}},process:{env:{GITHUB_REPOSITORY:'byungho-cho/roxstock'}},core:{notice:()=>{}}});
 if(scenario==='unmerged-error'){await assert.rejects(promise,/not mergeable/);assert.equal(dispatches,0);}else{await promise;assert.equal(dispatches,1);}
});
