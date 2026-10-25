// Used exclusively by the child-process runtime test. No real DB, filesystem or HTTP.
const caseName=process.env.HISTORY_TEST_CASE;
if(!caseName)throw Error('TEST_FIXTURE_ONLY');
const stub=`
const scenario=${JSON.stringify(caseName)};
globalThis.setTimeout=(fn)=>setImmediate(fn);
const writes=[];const task={id:1n,securityId:2n,fiscalYear:2025,periodType:'Q2',reportCode:'11012',status:'NO_FILING'};
const security={id:2n,symbol:'123456',collectionRevision:0,dartCorpMapping:{corpCode:'00123456'}};
const values={totalAssets:'100000000',totalLiabilities:'200000000',totalEquity:'300000000',operatingProfitYtd:'400000000',netIncomeYtd:'500000000',accountSources:{}};
const report={receiptNo:'20250801000001',reportCode:'11012',periodType:'Q2'};
const memory=new Map();const missing=()=>Object.assign(Error('missing'),{code:'ENOENT'});
export const readFile=async p=>{if(!memory.has(p))throw missing();return memory.get(p)};
export const writeFile=async(p,v)=>memory.set(p,v);export const rename=async(a,b)=>{memory.set(b,memory.get(a));memory.delete(a)};
export const appendFile=async(p,v)=>memory.set(p,(memory.get(p)??'')+v);export const mkdir=async()=>{};export const access=async()=>{throw missing()};
export class PrismaClient{constructor(){return {dartBackfillTask:{findMany:async()=>[task],findUnique:async()=>task},security:{findUnique:async()=>security},dartFinancialFiling:{findFirst:async()=>scenario==='existing'?{}:null},periodValuation:{findUnique:async()=>null},$disconnect:async()=>console.log(JSON.stringify({testWrites:writes,checkpoint:JSON.parse(memory.get('/var/lib/roxstock/kis-history/state.json')??'null')}))}}}
export const collectionClient=x=>x;export const dartTaskScope=()=>({});export const withCollection=async(db,id,feature,work)=>work();export const withFinancialLease=async(o,work)=>work();export const safeDartContext=()=>({});
export class PrismaDartRepository{
async acquireLock(){return true}async releaseLock(){}async prioritySecurityIds(){return scenario==='priority'?[2n]:[]}
async getState(){return {phase:'CURRENT',backfillCompletedAt:'preserved'}}async setState(v){writes.push({state:v})}
async createRun(job,provider,meta){writes.push({job,provider,meta});return{id:1n}}async finishRun(id,status,counts){writes.push({finish:status,counts})}
async addRunItem(id,s,t,status,message){writes.push({item:status,message})}
async cachedReports(c,y,load){return load()}async missingReportDecision(){return{status:'NO_FILING',errorCode:'NO_FILING_CONFIRMED'}}
async updateTask(id,v){writes.push({task:v})}async saveFiling(v){writes.push({filing:v.values})}async completeTaskFromStorage(){writes.push({complete:true});return true}
async reserveApiCall(){return true}async recordApiResult(){}
}
export class KisInvestorProvider{appKey='mock';appSecret='mock';async authenticate(){return'mock'}async json(){return{output:[{stac_yymm:'202506',total_aset:'1',total_lblt:'2',total_cptl:'3',bsop_prti:'4',thtr_ntin:'5'}]}}}
export class OpenDartProvider{async listPeriodicReports(){if(scenario==='quota'||scenario==='pause')throw Object.assign(Error('paused'),{code:scenario==='quota'?'DAILY_CALL_LIMIT':'HISTORY_STOPPED'});return scenario==='missing'?[]:[report]}}
export const normalizeDartFinancialRows=()=>({...values});export const requireDartReportPeriod=()=>{};
export const validateDartFiling=()=>({receiptNo:report.receiptNo,periodEndDate:new Date('2025-06-30'),sourceValidation:{currency:'KRW',selectedReceiptNo:report.receiptNo}});
export const getCfsThenOfs=async()=>({rows:scenario==='unavailable'?[]:[{}],division:'CFS'});
`;
export async function resolve(specifier,context,next){
  if(specifier==='node:fs/promises'||/\/(?:shared\/dist|collector\/dist|investor-crawler\/src)\//.test(specifier))return{url:'mock:history',shortCircuit:true};
  return next(specifier,context);
}
export async function load(url,context,next){if(url==='mock:history')return{format:'module',source:stub,shortCircuit:true};return next(url,context);}
