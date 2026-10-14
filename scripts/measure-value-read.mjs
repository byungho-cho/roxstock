// Read-only production API probe. No collection, cache clearing, or writes.
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.env.ROX_MEASURE_BASE??'https://newrox.cafe24.com';
const year=Number(new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).slice(0,4));
const report={utc:new Date().toISOString(),sourceSha:process.env.GITHUB_SHA??null,base,concurrency:1,repeats:3,deploymentVersion:null,samples:[],summary:[],limitations:['sourceSha identifies the tested source, not a verified deployed revision','No forced cold-cache eviction','DB/selection/calculation/sort/serialization/transfer subcosts and handset rendering are not independently instrumented']};
try{const r=await fetch(base+'/api/version',{signal:AbortSignal.timeout(8000)});report.deploymentVersion=(await r.json()).data?.version??null;}catch{}
for(const [condition,params] of [['entry-and-reentry',{year}],['search',{year,query:'삼성'}],['year-change',{year:year-1}]]){
 for(let index=0;index<3;index++){
  const start=performance.now();
  try{
   const r=await fetch(base+'/api/value-analysis?'+new URLSearchParams({...params,sorts:'w:desc'}),{signal:AbortSignal.timeout(15000)});
   const headersMs=performance.now()-start,text=await r.text(),totalMs=performance.now()-start;
   let body;try{body=JSON.parse(text);}catch{}
   report.samples.push({condition,index,status:r.status,headersMs,totalMs,bytes:Buffer.byteLength(text),serverTiming:r.headers.get('server-timing'),cache:body?.data?.cache??null,total:body?.data?.total??null,valid:!!body?.data?.rows});
  }catch(e){report.samples.push({condition,index,totalMs:performance.now()-start,error:String(e),valid:false});}
 }
 const values=report.samples.filter(s=>s.condition===condition&&s.valid).map(s=>s.totalMs).sort((a,b)=>a-b);
 if(values.length){const mean=values.reduce((a,b)=>a+b,0)/values.length;report.summary.push({condition,n:values.length,medianMs:values[Math.floor(values.length/2)],minMs:values[0],maxMs:values.at(-1),stddevMs:Math.sqrt(values.reduce((a,b)=>a+(b-mean)**2,0)/values.length)});}
}
mkdirSync('test-results/phase31',{recursive:true});writeFileSync('test-results/phase31/value-api.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
