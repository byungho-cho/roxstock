// Temporary, resumable production history campaign. Never starts phase 2.
// Run only through the reviewed host wrapper; state/cache/preimages are private.
import {readFile,writeFile,rename,appendFile,mkdir,access} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PrismaClient} from '../shared/dist/generated/prisma/index.js';
import {dartTaskScope} from '../shared/dist/collection/dart-backfill.js';
import {withCollection} from '../shared/dist/collection/collection-policy.js';
import {collectionClient} from '../shared/dist/lib/collection-client.js';
import {withFinancialLease} from '../shared/dist/collection/financial-lease.js';
import {PrismaDartRepository} from '../collector/dist/dart-repository.js';
import {OpenDartProvider,normalizeDartFinancialRows} from '../collector/dist/dart-provider.js';
import {validateDartFiling,requireDartReportPeriod} from '../collector/dist/dart-filing-validation.js';
import {getCfsThenOfs} from '../collector/dist/dart-collector.js';
import {KisInvestorProvider} from '../investor-crawler/src/kis-provider.mjs';
import {anchorCheck,historyStatuses,safeCode,stopCode} from './kis-history-policy.mjs';
import {parse} from 'dotenv';

// docker --env-file retains dotenv quotes whereas Compose removes them.
for(const key of ['DATABASE_URL','DART_API_KEY','KIS_APP_KEY','KIS_APP_SECRET'])if(process.env[key])process.env[key]=parse('VALUE='+process.env[key]).VALUE;
let databaseName;try{databaseName=new URL(process.env.DATABASE_URL??'file:///').pathname;}catch{throw Error('DATABASE_CONFIGURATION_INVALID');}

const directory=process.env.KIS_HISTORY_DIRECTORY;
if(process.env.KIS_HISTORY_PRODUCTION_ACK!=='temporary-universe-history'||directory!=='/var/lib/roxstock/kis-history'||databaseName!=='/roxstock')throw Error('PRODUCTION_HISTORY_GUARD');
if(!process.env.DART_API_KEY||!process.env.KIS_APP_KEY||!process.env.KIS_APP_SECRET)throw Error('CREDENTIAL_CONFIGURATION_MISSING');
const db=collectionClient(new PrismaClient()),repo=new PrismaDartRepository(db),owner=randomUUID();
const stateFile=directory+'/state.json';
const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?String(x):x);
const save=async(file,value)=>{await writeFile(file+'.tmp',json(value),{mode:0o600});await rename(file+'.tmp',file);};
const load=async(file)=>{try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
const stopped=async()=>{try{await access(directory+'/STOP');return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
let signalStop=false;process.on('SIGTERM',()=>{signalStop=true;});process.on('SIGINT',()=>{signalStop=true;});
const allowed=async()=>{if(signalStop||await stopped())throw Object.assign(Error('HISTORY_STOPPED'),{code:'HISTORY_STOPPED'});};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let state,run,locked=false;const counts={success:0,failed:0,skipped:0},start=Date.now();
const emit=async(task,security,outcome,code,extra={})=>{
  await appendFile(directory+'/results.jsonl',json({at:new Date(),taskId:task.id,securityId:security.id,symbol:security.symbol,year:task.fiscalYear,period:task.periodType,outcome,code,...extra})+'\n',{mode:0o600});
  counts[outcome==='SUCCESS'?'success':outcome==='FAILED'?'failed':'skipped']++;
  await repo.addRunItem(run.id,security,task,outcome,code);
};
try {
  await mkdir(directory+'/cache',{recursive:true,mode:0o700});
  await allowed();
  locked=await repo.acquireLock(owner,90);if(!locked){console.log(json({status:'FINANCIAL_LEASE_BUSY'}));process.exitCode=0;}
  else await withFinancialLease(owner,async()=>{
    state=await load(stateFile);
    if(!state){
      const priorities=await repo.prioritySecurityIds();
      const tasks=await db.dartBackfillTask.findMany({where:{...dartTaskScope(),status:{in:historyStatuses},securityId:{notIn:priorities}},select:{id:true,securityId:true},orderBy:[{securityId:'asc'},{fiscalYear:'desc'},{id:'asc'}]});
      state={version:1,startedAt:new Date().toISOString(),priorDartState:await repo.getState(),cursor:0,taskIds:tasks.map(t=>String(t.id)),total:tasks.length,priorityExcluded:true,phase2Paused:true,done:false,totals:{success:0,failed:0,skipped:0},retries:{}};
      await save(stateFile,state);
    }
    if(state.version!==1)throw Error('CHECKPOINT_VERSION');
    if(state.done){console.log(json({status:'CAMPAIGN_COMPLETE',...state.totals,total:state.total}));return;}
    await repo.setState({phase:'BACKFILL'});
    run=await repo.createRun('dart-financial-statements','KIS_DART',{phase:'BACKFILL',temporary:true,priorityExcluded:true,cursor:state.cursor,total:state.total});
    const kis=new KisInvestorProvider();
    const dart=new OpenDartProvider({apiKey:process.env.DART_API_KEY,dailyCallLimit:10000,minDelayMs:2100,
      reserveCall:async limit=>{await allowed();return repo.reserveApiCall(limit,new Date(),owner);},isCallAllowed:()=>!signalStop,
      onApiStatus:async code=>repo.recordApiResult(code==='013'?'NO_DATA':'ERROR')});
    let completed=0;
    while(state.cursor<state.taskIds.length&&Date.now()-start<240000&&completed<60){
      await allowed();const before={...counts};
      const task=await db.dartBackfillTask.findUnique({where:{id:BigInt(state.taskIds[state.cursor])}});
      const security=task&&await db.security.findUnique({where:{id:task.securityId},include:{dartCorpMapping:true}});
      const priorities=new Set((await repo.prioritySecurityIds()).map(String));
      if(!task||!security||priorities.has(String(task.securityId))||!historyStatuses.includes(task.status)){
        state.cursor++;await save(stateFile,state);continue;
      }
      try {
        await withCollection(db,security.id,'dart-financial-statements',async()=>{
          const corpCode=security.dartCorpMapping?.corpCode;
          if(!corpCode){await emit(task,security,'SKIPPED','CORPORATE_IDENTITY_UNAVAILABLE');return;}
          const key=directory+'/cache/'+security.id+'-'+security.collectionRevision+'.json';
          let cached=await load(key);
          if(!cached||Date.now()-Date.parse(cached.at)>86400000){
            const token=await kis.authenticate(),tables=[];
            for(const mode of ['0','1'])for(const [endpoint,tr]of [['financial-ratio','FHKST66430300'],['balance-sheet','FHKST66430100'],['income-statement','FHKST66430200']]){
              await allowed();await sleep(2100);await allowed();
              const params=new URLSearchParams({FID_DIV_CLS_CODE:mode,fid_div_cls_code:mode,fid_cond_mrkt_div_code:'J',fid_input_iscd:security.symbol});
              const body=await kis.json('/uapi/domestic-stock/v1/finance/'+endpoint+'?'+params,{headers:{authorization:'Bearer '+token,appkey:kis.appKey,appsecret:kis.appSecret,tr_id:tr,custtype:'P'}});
              if(!Array.isArray(body.output))throw Object.assign(Error('schema'),{code:'KIS_RESPONSE_SCHEMA'});
              tables.push({mode,endpoint,rows:body.output});
            }
            cached={symbol:security.symbol,revision:security.collectionRevision,at:new Date().toISOString(),tables};await save(key,cached);
          }
          if(cached.symbol!==security.symbol||cached.revision!==security.collectionRevision)throw Error('CACHE_IDENTITY');
          const reports=await repo.cachedReports(corpCode,task.fiscalYear,()=>dart.listPeriodicReports(corpCode,task.fiscalYear));
          const report=reports.find(r=>r.reportCode===task.reportCode&&!r.withdrawn);
          const preserve=async()=>{await appendFile(directory+'/preimages.jsonl',json({at:new Date(),task})+'\n',{mode:0o600});};
          if(!report){
            let decision=await repo.missingReportDecision(security.id,task.fiscalYear,task.periodType,reports,new Date());
            const mode=task.periodType==='ANNUAL'?'0':'1';
            const kisHasYear=cached.tables.some(t=>t.mode===mode&&t.endpoint!=='financial-ratio'&&t.rows.some(r=>String(r.stac_yymm).startsWith(String(task.fiscalYear))));
            if(decision.status!=='NOT_DUE'&&!kisHasYear)decision={status:'DATA_UNAVAILABLE',needsSupplement:false,errorCode:'API_ROWS_UNAVAILABLE',errorMessage:'한투 과거 재무자료 및 DART 대상 공시 미제공 · 해당 조회 범위에서 확인',nextAttemptAt:null,diagnostics:{historyCampaign:state.startedAt,availability:'PROVIDERS_NO_HISTORICAL_SOURCE',kisCheckedAt:cached.at,taskFiscalYear:task.fiscalYear,reportCode:task.reportCode,notALegalNonFilingDetermination:true}};
            await preserve();await repo.updateTask(task.id,{...decision,processedAt:decision.status==='NO_FILING'?new Date():null});
            await emit(task,security,decision.status==='FAILED'?'FAILED':'NO_DATA',decision.errorCode??'NO_PERIODIC_FILING');return;
          }
          requireDartReportPeriod(report,corpCode,task.fiscalYear);
          const existing=await db.dartFinancialFiling.findFirst({where:{securityId:security.id,fiscalYear:task.fiscalYear,periodType:task.periodType,isWithdrawn:false}});
          const metric=await db.periodValuation.findUnique({where:{securityId_fiscalYear_periodType:{securityId:security.id,fiscalYear:task.fiscalYear,periodType:task.periodType}}});
          if(existing||metric){await emit(task,security,'SKIPPED','EXISTING_FINANCIAL_DATA_PRESERVED');return;}
          if(task.selectedReceiptNo&&task.selectedReceiptNo!==report.receiptNo){await emit(task,security,'FAILED','RECEIPT_SELECTION_CHANGED_REVIEW_REQUIRED');return;}
          const fetched=await getCfsThenOfs(dart,corpCode,task.fiscalYear,task.reportCode,report);
          if(!fetched.rows.length){
            await preserve();await repo.updateTask(task.id,{status:'DATA_UNAVAILABLE',needsSupplement:false,errorCode:'API_ROWS_UNAVAILABLE',errorMessage:'한투 과거 자료 조회 및 DART 대조 후 저장 가능한 기간·연결/별도 근거 미제공',processedAt:new Date(),nextAttemptAt:null,diagnostics:{availability:'API_DATA_UNAVAILABLE',historyCampaign:state.startedAt,kisCheckedAt:cached.at,selectedReceiptNo:report.receiptNo}});
            await emit(task,security,'NO_DATA','HISTORICAL_SOURCE_UNAVAILABLE');return;
          }
          const source=fetched.source??validateDartFiling({corpCode,taskFiscalYear:task.fiscalYear,report,rows:fetched.rows,fsDivision:fetched.division});
          const values=normalizeDartFinancialRows(fetched.rows);
          const check=source.sourceValidation.currency==='KRW'?anchorCheck(values,cached.tables,source.periodEndDate.toISOString(),task.periodType):{verified:false,reason:'CURRENCY_NOT_KRW'};
          // Precise official filing values take precedence over rounded KIS amounts.
          // No KIS field is written unless its source identity can be verified independently.
          if(['totalAssets','totalLiabilities','totalEquity','operatingProfitYtd','netIncomeYtd'].some(k=>values[k]==null)){
            throw Object.assign(Error('Incomplete core accounts'),{code:'HISTORICAL_CORE_ACCOUNTS_INCOMPLETE'});
          }
          source.sourceValidation.historyCampaign={temporary:true,kisCheckedAt:cached.at,kisVerification:check,source:'DART_VALIDATED_PRECISE_VALUES'};
          await preserve();
          await repo.saveFiling({securityId:security.id,fiscalYear:task.fiscalYear,periodType:task.periodType,reportCode:task.reportCode,fsDivision:fetched.division,...source,collectedAt:new Date(),values});
          const success=await repo.completeTaskFromStorage(security.id,task.fiscalYear,task.reportCode,source.receiptNo,source.sourceValidation.selectedReceiptNo);
          if(!success)throw Object.assign(Error('Completion proof mismatch'),{code:'POST_SAVE_PROOF_MISMATCH'});
          await emit(task,security,'SUCCESS',check.verified?'KIS_DART_RECONCILED':'DART_VERIFIED_FALLBACK',{kisVerification:check.reason});
        },security);
        delete state.retries[task.id];
      }catch(error){
        const code=safeCode(error);
        if(stopCode(code))throw error;
        if(code==='COLLECTION_EXCLUDED'){await emit(task,security,'SKIPPED',code);}
        else{
          const attempts=(state.retries[task.id]??0)+1;state.retries[task.id]=attempts;
          if(attempts<3&&['KIS_CONNECTION_FAILED','KIS_REQUEST_FAILED','KIS_INVALID_JSON','NETWORK_ERROR','HTTP_ERROR','INVALID_JSON','INTERNAL_OR_DB_ERROR'].includes(code)){await save(stateFile,state);throw error;}
          await withCollection(db,security.id,'dart-financial-statements',async()=>{
            await appendFile(directory+'/preimages.jsonl',json({at:new Date(),task})+'\n',{mode:0o600});
            await repo.updateTask(task.id,{status:'FAILED',errorCode:'REVIEW_REQUIRED',errorMessage:'과거 자료 보완 실패 · '+code,processedAt:null,nextAttemptAt:null,diagnostics:{historyCampaign:state.startedAt,validationResult:code}});
          },security);
          await emit(task,security,'FAILED',code);
        }
      }
      state.cursor++;completed++;for(const key of Object.keys(counts))state.totals[key]=(state.totals[key]??0)+counts[key]-before[key];
      await save(stateFile,state);
    }
    state.done=state.cursor>=state.taskIds.length;state.updatedAt=new Date().toISOString();delete state.batchCounts;await save(stateFile,state);
    await repo.finishRun(run.id,counts.failed?'PARTIAL':'SUCCESS',counts,undefined,{phase:'BACKFILL',temporary:true,priorityExcluded:true,cursor:state.cursor,total:state.total,done:state.done});run=null;
    console.log(json({status:state.done?'CAMPAIGN_COMPLETE':'BATCH_COMPLETE',cursor:state.cursor,total:state.total,...counts}));
  });
}catch(error){
  const code=safeCode(error);if(run)await repo.finishRun(run.id,'FAILED',counts,code);
  if(state){delete state.batchCounts;state.lastStop={at:new Date().toISOString(),code};await save(stateFile,state);}
  console.error(json({status:'BATCH_STOPPED',code}));process.exitCode=1;
}finally{if(locked)await repo.releaseLock(owner);await db.$disconnect();}
