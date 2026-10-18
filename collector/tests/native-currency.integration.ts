import test from 'node:test';
import assert from 'node:assert/strict';
import {PrismaClient,Prisma} from '@roxstock/shared/prisma';
import {buildApp} from '../../backend/src/app.js';
import {PrismaDartRepository} from '../src/dart-repository.js';
import {mapPeriodicReports,normalizeDartFinancialRows,type DartFinancialRow} from '../src/dart-provider.js';
import {validateDartFiling} from '../src/dart-filing-validation.js';
import {reconcileForeignSourceReports,foreignHoldCode} from '@roxstock/shared/collection/foreign-source-reports';
const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.endsWith('_dart_recovery_test'))throw Error('Isolated MariaDB required');
test('MariaDB: KRW unchanged, USD/CNY/JPY exact 30-decimal round trip, identity guard, selective report resolution',async()=>{
 const db=new PrismaClient(),repo=new PrismaDartRepository(db),originals=await db.dartFinancialFiling.findMany();
 try{
 for(const [i,currency]of ['KRW','USD','CNY','JPY'].entries()){
  const symbol='FXT00'+i,corpCode='00100001',receipt='2025031900000'+i;
  const stock=await db.security.create({data:{symbol,name:'FX fixture '+currency,marketType:'OTHER'}});
  const report=mapPeriodicReports([{corp_code:corpCode,rcept_no:receipt,rcept_dt:'20250319',report_nm:'사업보고서 (2024.12)'}],2024)[0]!;
  const amount=currency==='KRW'?'999999999999999999999999':'99999999999999999999999999999999999.123456789012345678901234567891';
  const rows=[{receiptNo:receipt,corpCode,fiscalYear:2024,reportCode:'11011',statementDivision:'BS',statementName:'재무상태표',accountId:'ifrs-full_Equity',accountName:'자본총계',currentAmount:amount,currentYtdAmount:null,currency}] as DartFinancialRow[];
  const source=validateDartFiling({report,rows,corpCode,taskFiscalYear:2024,fsDivision:'OFS'});
  const input={securityId:stock.id,fiscalYear:2024,periodType:'ANNUAL' as const,reportCode:'11011' as const,fsDivision:'OFS' as const,...source,collectedAt:new Date(),values:normalizeDartFinancialRows(rows)};
  assert.equal((await repo.saveFiling(input)).created,true);
  assert.equal((await repo.saveFiling(input)).created,false);
  let f=await db.dartFinancialFiling.findUniqueOrThrow({where:{receiptNo:receipt}});
  assert.equal(f.totalEquity?.toFixed(),amount);
  const app=buildApp();
  try{const response=await app.inject({method:'GET',url:'/api/securities/'+stock.id+'/analysis?fiscalYear=2024'});assert.equal(response.statusCode,200);const statement=response.json().data.statements[0];assert.equal(statement.currency,currency);assert.ok(new Prisma.Decimal(statement.totalEquity).eq(amount));}
  finally{await app.close();}

  assert.equal((f.sourceValidation as any).currency,currency);
  assert.equal((f.accountSources as any).totalEquity.amount,amount);
  await assert.rejects(repo.saveFiling({...input,sourceValidation:{...source.sourceValidation,currency:currency==='USD'?'CNY':'USD'}}));
  assert.deepEqual(await db.dartFinancialFiling.findUniqueOrThrow({where:{receiptNo:receipt}}),f);
  await db.dartBackfillTask.create({data:{securityId:stock.id,fiscalYear:2024,periodType:'ANNUAL',reportCode:'11011',status:currency==='CNY'?'FAILED':'SUCCESS',selectedReceiptNo:receipt,...(currency==='CNY'?{errorCode:'REVIEW_REQUIRED',diagnostics:{validationResult:'NON_KRW_STORAGE_UNSUPPORTED'}}:{})}});
  for(const [j,code]of [foreignHoldCode,'DART_REVIEW_PUBLIC_DOCUMENT_UNVERIFIED'].entries()){
   const r=await db.collectionBugReport.create({data:{fingerprint:(symbol+j).padEnd(64,'x'),feature:'dart-financial-statements',code,severity:'WARNING',summary:'fixture',state:'REVIEWING',firstSeenAt:new Date(0),lastSeenAt:new Date(0)}});
   await db.collectionBugOccurrence.create({data:{eventKey:(symbol+j).padEnd(64,'y'),reportId:r.id,securityId:stock.id,fiscalYear:2024,periodType:'ANNUAL',observedAt:new Date(0)}});
  }
  await reconcileForeignSourceReports(db);
  const events=await db.collectionBugOccurrence.findMany({where:{securityId:stock.id},include:{report:true}});
  assert.equal(events.find(e=>e.report?.code===foreignHoldCode)?.resolution,'NATIVE_CURRENCY_SOURCE_STORED');
  assert.equal(events.find(e=>e.report?.code==='DART_REVIEW_PUBLIC_DOCUMENT_UNVERIFIED')?.resolvedAt,null);
  assert.equal((await db.dartBackfillTask.findFirstOrThrow({where:{securityId:stock.id}})).status,'SUCCESS');
  // Resolving again never changes counts or the unrelated warning.
  await reconcileForeignSourceReports(db);assert.deepEqual(await db.collectionBugOccurrence.findMany({where:{securityId:stock.id},include:{report:true}}),events);
 }
 assert.deepEqual(await db.dartFinancialFiling.findMany({where:{id:{in:originals.map(f=>f.id)}}}),originals);
 }finally{await db.$disconnect();}
});
