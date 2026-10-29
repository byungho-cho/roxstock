// Explicit allowlist only. No fetching, queues, schedules or error-history resets.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const args=process.argv.slice(2),arg=k=>{const i=args.indexOf(k);if(i<0||!args[i+1]||args[i+1].startsWith('--'))throw Error('REQUIRED '+k);return args[i+1];};
const runtime=process.env.ROXSTOCK_RUNTIME_ROOT??fileURLToPath(new URL('..',import.meta.url));
const domain=process.env.ROXSTOCK_REVIEW_DOMAIN??resolve(runtime,'shared/dist/domain');
const load=p=>import(pathToFileURL(p).href),{PrismaClient}=await load(resolve(runtime,'shared/dist/generated/prisma/index.js'));
const {closingParentRoe,closingParentRoePolicy,closingRoeReview}=await load(resolve(domain,'closing-parent-roe.js'));
const {externalParentAccount,externalParentPolicy}=await load(resolve(domain,'external-parent-annual.js'));
const {annualWAssessment}=await load(resolve(domain,'security-w-readiness.js'));
const {selectValueListAnalysis}=await load(resolve(domain,'value-list-analysis.js'));
const {exclusionReason,withCollection}=await load(resolve(runtime,'shared/dist/collection/collection-policy.js'));
const {withFinancialLease,assertFinancialLease}=await load(resolve(runtime,'shared/dist/collection/financial-lease.js'));
const {PrismaCollectorRepository}=await load(resolve(runtime,'collector/dist/repository.js'));
const symbols=JSON.parse(readFileSync(arg('--symbols-file'),'utf8')),dir=arg('--evidence-dir'),out=arg('--output-dir'),apply=args.includes('--apply');
if(!Array.isArray(symbols)||!symbols.length||symbols.some(s=>!/^\d[A-Z0-9]{5}$/.test(s))||new Set(symbols).size!==symbols.length)throw Error('INVALID_ALLOWLIST');
if(apply&&process.env.NODE_ENV==='production'&&!args.includes('--production'))throw Error('PRODUCTION_FLAG_REQUIRED');
mkdirSync(out,{recursive:true,mode:0o700});
const obj=x=>x&&typeof x==='object'?x:{},json=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?String(v):v),hash=x=>createHash('sha256').update(json(x)).digest('hex'),save=(n,x)=>writeFileSync(resolve(out,n+'.json'),json(x),{mode:0o600});
const db=new PrismaClient(),locks=new PrismaCollectorRepository(db),owner='external-parent-'+randomUUID();let locked=false,timer,lost=false;
const assess=(s,r)=>annualWAssessment({year:2026,price:s.marketPrice?.currentPrice.toString()??null,periods:[r],filings:s.dartFinancialFilings,manual:s.financialStatements,metrics:s.valuationMetrics},2025,'final');
async function propose(symbol){
 const s=await db.security.findUniqueOrThrow({where:{symbol},include:{marketPrice:true,periodValuations:{where:{fiscalYear:2025,periodType:'ANNUAL'}},dartFinancialFilings:{where:{fiscalYear:2025,periodType:'ANNUAL',isWithdrawn:false},orderBy:[{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}],take:1},financialStatements:{where:{fiscalYear:2025,periodType:'ANNUAL'}},valuationMetrics:{where:{metricDate:new Date('2025-12-31')}}}});
 const r=s.periodValuations[0],f=s.dartFinancialFilings[0];if(!s.isActive||!r||!f||exclusionReason(s,'valuation')||exclusionReason(s,'dart-financial-statements'))throw Error('EXCLUDED_OR_SOURCE_MISSING');
 const file=resolve(dir,symbol+'.json');if(!existsSync(file))throw Error('NO_EVIDENCE');const fetched=JSON.parse(readFileSync(file,'utf8')),a=fetched.annual;if(!a)throw Error(fetched.status??'NO_FINAL_ANNUAL');
 const sup=obj(r.supplemental),p=obj(r.provenance),oldAccounts=obj(sup.accounts),sources={...obj(oldAccounts.sources)},direct=obj(f.accountSources),manual=obj(sup.manualFields);
 if(oldAccounts.receiptNo&&(oldAccounts.receiptNo!==f.receiptNo||oldAccounts.fsDivision!==f.fsDivision||oldAccounts.currency&&oldAccounts.currency!=='KRW'))throw Error('STORED_CONTEXT_CONFLICT');
 if(fetched.symbol!==symbol||fetched.securityId!==String(s.id)||f.collectionSymbol&&f.collectionSymbol!==symbol||r.collectionSymbol&&r.collectionSymbol!==symbol)throw Error('IDENTITY_CONFLICT');
 const added=[];for(const key of ['parentNetIncome','parentEquity']){
  if(manual[key]||obj(direct[key]).ytdAmount!=null||obj(direct[key]).amount!=null||obj(sources[key]).ytdAmount!=null||obj(sources[key]).amount!=null)continue;
  const value=a.financials?.[key];if(value==null)continue;
  const incoming={amount:value,ytdAmount:key==='parentNetIncome'?value:null,source:'NAVER_FNGUIDE_ANNUAL',sourceUrl:a.sourceUrl,accountName:key==='parentNetIncome'?'당기순이익(지배)':'자본총계(지배)',periodEnd:f.periodEndDate.toISOString().slice(0,10),currency:'KRW',amountMultiplier:'1',externalAnnual:{policy:externalParentPolicy,symbol,securityId:String(s.id),receiptNo:f.receiptNo,annual:a}};
  if(!externalParentAccount(f,key,incoming))throw Error('EXTERNAL_BASIS_OR_FOUR_TOTALS_CONFLICT');sources[key]=incoming;added.push(key);
 }
 if(!added.length)return {summary:{symbol,status:'ALREADY_FILLED_OR_NO_PARENT_FIELD',added:[]}};
 const supplemental={...sup,accounts:{...oldAccounts,receiptNo:f.receiptNo,fsDivision:f.fsDivision,currency:'KRW',amountMultiplier:'1',collectedAt:fetched.at,sources}};
 let next={...r,supplemental},roeChanged=false,caution=false;const candidate=closingParentRoe(f,supplemental),oldRoe=obj(obj(p.perMetric).roe??p);
 if(candidate&&!manual.roe&&!/MANUAL/i.test(oldRoe.source??'')){
  const review=closingRoeReview(r.values.roe,candidate.value,f.receiptNo),entry={...oldRoe,source:'DART_NAVER_RECONCILED',validation:externalParentPolicy,kind:'FINAL_ANNUAL',fiscalYear:2025,periodType:'ANNUAL',flow:'ANNUAL',receiptNo:f.receiptNo,fsDivision:'CFS',currency:'KRW',periodEnd:f.periodEndDate.toISOString().slice(0,10),roeBasis:'OWNERS_OF_PARENT',roeDenominator:'CLOSING_PARENT_EQUITY',roePolicy:closingParentRoePolicy,roeNumerator:candidate.profit,roeClosingEquity:candidate.equity,roeInputEvidence:candidate.inputEvidence,calculatedAt:new Date().toISOString()};delete entry.roeReview;if(review){entry.roeReview=review;supplemental.roePolicyReview=review;caution=true;}
  next={...next,values:{...r.values,roe:candidate.value},provenance:{...p,roeBasis:'OWNERS_OF_PARENT',roeDenominator:'CLOSING_PARENT_EQUITY',roePolicy:closingParentRoePolicy,perMetric:{...obj(p.perMetric),roe:entry}},reasons:{...obj(r.reasons)}};delete next.reasons.roe;roeChanged=true;
  if(assess(s,next).metrics.roe===null){next={...r,supplemental};if(sup.roePolicyReview)supplemental.roePolicyReview=sup.roePolicyReview;else delete supplemental.roePolicyReview;roeChanged=false;caution=false;}
 }
 const before=assess(s,r),after=assess(s,next),proof=selectValueListAnalysis({year:2026,price:s.marketPrice?.currentPrice.toString()??null,periods:[next],filings:s.dartFinancialFilings,manual:s.financialStatements,metrics:s.valuationMetrics});
 if(after.wReady&&(!proof.rimBasis||proof.rimReason))throw Error('W_PROOF_CONFLICT');
 const summary={symbol,name:s.name,receiptNo:f.receiptNo,status:!before.wReady&&after.wReady?'W_RESOLVED':'FIELDS_FILLED_W_PENDING',added,roeChanged,caution,oldRoe:r.values.roe??null,newRoe:next.values.roe??null,missingW:after.missingW,remainingReason:after.wReady?null:proof.rimReason,w:after.w};
 return {s,r,f,next,summary,rowHash:hash(r),filingHash:hash(f)};
}
try{
 const plans=[],held=[];for(const symbol of symbols){try{const p=await propose(symbol);if(p.r)plans.push(p);else held.push(p.summary);}catch(e){held.push({symbol,status:e.code??e.message});}}
 const summarize=rows=>({stocks:rows.length,fields:rows.reduce((n,r)=>n+r.added.length,0),wResolved:rows.filter(r=>r.status==='W_RESOLVED').length,roeChanged:rows.filter(r=>r.roeChanged).length,caution:rows.filter(r=>r.caution).length});
 save('plan',{at:new Date(),apply,summary:summarize(plans.map(p=>p.summary)),rows:plans.map(p=>p.summary),held});console.log(json({mode:apply?'apply':'plan',...summarize(plans.map(p=>p.summary)),held:held.length}));
 if(apply){for(let i=0;i<36;i++){locked=await locks.acquireLock('dart-financial-statements',owner,180);if(locked)break;await new Promise(r=>setTimeout(r,5000));}if(!locked)throw Error('LEASE_BUSY');timer=setInterval(()=>void locks.renewLock('dart-financial-statements',owner,180).then(ok=>{if(!ok)lost=true}).catch(()=>{lost=true}),20000);
 const applied=[],failed=[];await withFinancialLease(owner,async()=>{for(const plan of plans){if(lost)throw Error('LEASE_LOST');const symbol=plan.summary.symbol;try{
 const fresh=await propose(symbol);if(!fresh.r){applied.push({...fresh.summary,idempotent:true});continue;}if(fresh.rowHash!==plan.rowHash||fresh.filingHash!==plan.filingHash)throw Error('CONCURRENT_SOURCE_CHANGE');
 save('before-'+symbol,{row:plan.r,filingId:String(plan.f.id),filingHash:plan.filingHash});
 await withCollection(db,plan.s.id,'valuation',()=>db.$transaction(async tx=>{await assertFinancialLease(tx);const current=await tx.periodValuation.findUniqueOrThrow({where:{securityId_fiscalYear_periodType:{securityId:plan.r.securityId,fiscalYear:2025,periodType:'ANNUAL'}}}),f=await tx.dartFinancialFiling.findUniqueOrThrow({where:{id:plan.f.id}});if(hash(current)!==plan.rowHash||hash(f)!==plan.filingHash)throw Error('CONCURRENT_SOURCE_CHANGE');
 const data={supplemental:plan.next.supplemental,...(plan.summary.roeChanged?{values:plan.next.values,provenance:plan.next.provenance,reasons:plan.next.reasons}:{})};const result=await tx.periodValuation.updateMany({where:{securityId:plan.r.securityId,fiscalYear:2025,periodType:'ANNUAL',updatedAt:plan.r.updatedAt},data});if(result.count!==1)throw Error('CONCURRENT_UPDATE');}),plan.s);
 const actual=await db.periodValuation.findUniqueOrThrow({where:{securityId_fiscalYear_periodType:{securityId:plan.r.securityId,fiscalYear:2025,periodType:'ANNUAL'}}});for(const [key,value]of Object.entries(plan.r.values))if(key!=='roe'&&json(actual.values[key])!==json(value))throw Error('UNRELATED_VALUE_CHANGED');for(const [key,value]of Object.entries(obj(obj(plan.r.supplemental).accounts).sources??{}))if(!plan.summary.added.includes(key)&&json(actual.supplemental.accounts.sources[key])!==json(value))throw Error('EXISTING_ACCOUNT_CHANGED');if(hash(await db.dartFinancialFiling.findUniqueOrThrow({where:{id:plan.f.id}}))!==plan.filingHash)throw Error('DART_ORIGINAL_CHANGED');save('after-'+symbol,{row:actual,assessment:assess(plan.s,actual)});applied.push(plan.summary);
 }catch(e){failed.push({symbol,status:e.code??e.message});}save('checkpoint',{at:new Date(),applied,failed});}});save('result',{at:new Date(),summary:summarize(applied),applied,failed,held});console.log(json({...summarize(applied),failed:failed.length}));}
}finally{if(timer)clearInterval(timer);if(locked)await locks.releaseLock('dart-financial-statements',owner);await db.$disconnect();}
