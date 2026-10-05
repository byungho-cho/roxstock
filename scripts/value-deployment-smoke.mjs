import assert from 'node:assert/strict';
const sha=process.env.DEPLOY_SHA,repository=process.env.GITHUB_REPOSITORY,token=process.env.GH_TOKEN;
const github=async path=>{const r=await fetch('https://api.github.com/repos/'+repository+path,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(30000)});assert.equal(r.status,200,'GitHub deployment status');return r.json();};
const commit=await github('/commits/'+sha),changed=commit.files.map(file=>file.filename);
const expected=[];
if(changed.some(path=>/^frontend\//.test(path)||['package.json','package-lock.json','.dockerignore','backend/package.json'].includes(path)))expected.push('.github/workflows/frontend-image.yml');
if(changed.some(path=>/^(backend\/|database\/prisma\/)/.test(path)||['package.json','package-lock.json','.dockerignore','scripts/deploy-backend.sh','infra/docker/compose.prod-backend.yml','.github/workflows/backend-deploy.yml'].includes(path)))expected.push('.github/workflows/backend-deploy.yml');
const deadline=Date.now()+12*60*1000;
let completed=false;
while(Date.now()<deadline){
 const {workflow_runs:runs}=await github('/actions/runs?head_sha='+sha+'&event=push&per_page=50');
 const relevant=expected.map(path=>runs.find(run=>run.path===path));
 if(relevant.every(run=>run?.status==='completed')){
  for(const run of relevant){assert.equal(run.conclusion,'success',run.name+' must deploy successfully');const {jobs}=await github('/actions/runs/'+run.id+'/jobs');assert.ok(jobs.some(job=>/deploy/i.test(job.name)&&job.conclusion==='success'),run.name+' deployment job');console.log(run.name+' deployed: '+run.html_url);}
  completed=true;break;
 }
 await new Promise(resolve=>setTimeout(resolve,10000));
}
assert.ok(completed,'Frontend/backend automatic deployment must complete within 12 minutes.');
const base='https://newrox.cafe24.com',year=Number(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).slice(0,4));
const json=async path=>{const response=await fetch(base+path,{signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,path+' HTTP status');return (await response.json()).data;};
const list=await json('/api/value-analysis?year='+year);
assert.equal(list.total,list.rows.length);assert.equal(list.year,year);
for(let i=1;i<list.rows.length;i++){const before=list.rows[i-1],row=list.rows[i];if(before.w===null)assert.equal(row.w,null);else if(row.w!==null){assert.ok(Number(before.w)>=Number(row.w));if(before.w===row.w)assert.ok(before.symbol.localeCompare(row.symbol)<=0);}}
assert.ok(list.total>0,'Security master should not be empty.');
const stock=list.rows.find(row=>row.w!==null)??list.rows[0];
const search=await json('/api/value-analysis?year='+year+'&query='+encodeURIComponent(stock.symbol));assert.ok(search.rows.some(row=>row.id===stock.id));
for(const [mode,count]of [['annual',3],['annual',10],['quarter',3],['quarter',10]]){
 const detail=await json('/api/value-analysis/'+stock.id+'?year='+year+'&mode='+mode+'&startYear='+(year-2)+'&startQuarter=4&count='+count);
 assert.equal(detail.security.id,stock.id);assert.equal(detail.rows.length,count);assert.equal(detail.mode,mode);
 if(detail.w!==null){const price=Number(detail.security.currentPrice),fair=Number(detail.fairPrices.find(row=>row.persistence==='0.8').price);assert.ok(Math.abs(Number(detail.w)-fair/price)<1e-9,'W = fair 0.8 / current');}
 assert.ok(detail.rows.every(row=>row.currentRatio===null));
}
const html=await (await fetch(base+'/detail/value',{signal:AbortSignal.timeout(30000)})).text();
const bundles=[...html.matchAll(/src="([^"]+\.js)"/g)].map(match=>match[1]);assert.ok(bundles.length);
const code=(await Promise.all(bundles.map(async path=>(await fetch(new URL(path,base))).text()))).join('\n');
assert.ok(code.includes('C1700')&&code.includes('T1700'),'Deployed frontend contains the value-analysis page.');
console.log('Production value API: '+list.total+' active master securities; search, W ordering/formula, 3/10 annual/quarter periods and deployed page bundle verified. HTTP smoke only; no captures or regression QA.');
