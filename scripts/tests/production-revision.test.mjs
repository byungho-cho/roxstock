import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const yaml=readFileSync('.github/workflows/production-deploy.yml','utf8');
const source=yaml.split('          script: |\n')[1].split('      - uses: actions/checkout')[0].split('\n').map(l=>l.replace(/^            /,'')).join('\n');
async function revision({jobs,current=true}={}){
 const output={},sha='f'.repeat(40),runs=[{id:3,head_branch:'main',head_sha:'c'.repeat(40)},{id:2,head_branch:'main',head_sha:'b'.repeat(40)},{id:1,head_branch:'main',head_sha:'a'.repeat(40)}];
 const listWorkflowRuns=()=>{},listJobsForWorkflowRun=()=>{};
 const github={rest:{repos:{getBranch:async()=>({data:{commit:{sha:current?sha:'e'.repeat(40)}}})},actions:{listWorkflowRuns,listJobsForWorkflowRun}},paginate:async(method,args)=>method===listWorkflowRuns?runs:jobs[args.run_id]};
 await vm.runInNewContext(`(async()=>{${source}})()`,{github,context:{repo:{}},process:{env:{REQUESTED_SHA:sha}},core:{setOutput:(k,v)=>output[k]=v,notice:()=>{}}});return output;
}
test('superseded or no-op success cannot conceal undeployed changes',async()=>{
 const output=await revision({jobs:{3:[{name:'revision',conclusion:'success'},{name:'backend / Backend Deploy',conclusion:'skipped'}],2:[{name:'backend / Backend Deploy',conclusion:'success'}],1:[]}});
 assert.equal(output.base,'b'.repeat(40));assert.equal(output.current,'true');
});
test('frontend-only actual deployments are valid baselines; empty history uses the source recovery tag',async()=>{
 assert.equal((await revision({jobs:{3:[{name:'frontend / deploy',conclusion:'success'}],2:[],1:[]}})).base,'c'.repeat(40));
 const output=await revision({jobs:{3:[],2:[],1:[]},current:false});assert.equal(output.current,'false');assert.equal(output.base,'c351ae61a5315cb80c3f9019a83dfa7c0d403c99');
});
