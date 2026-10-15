import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PrismaClient} from '@roxstock/shared/prisma';
import {PrismaDartRepository} from '../../collector/src/dart-repository.js';
import {mapPeriodicReports,normalizeDartFinancialRows,DartApiError,type RawReport,type DartFinancialRow} from '../../collector/src/dart-provider.js';
import {validateDartFiling} from '../../collector/src/dart-filing-validation.js';
const url=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(url.hostname)||!url.pathname.endsWith('_dart_recovery_test'))throw Error('Isolated MariaDB required');
const db=new PrismaClient(),repo=new PrismaDartRepository(db);
const evidence=JSON.parse(readFileSync(new URL('../../collector/tests/fixtures/dart-receipt-analysis.json',import.meta.url),'utf8')) as Array<{corpCode:string;path:string;rows:RawReport[]}>;

test('actual MariaDB stores GRT/CJ/Samsung source, period, units; duplicate attempts and wrong-period writes preserve existing data',async()=>{
 try{
 const originalTasks=await db.dartBackfillTask.findMany(),originalFilings=await db.dartFinancialFiling.findMany();
 for(const [symbol,corpCode,reportCode] of [['900290','01170962','11012'],['000120','00113410','11011'],['005930','00126380','11011']] as const){
  const stock=await db.security.create({data:{symbol,name:'Source test '+symbol,marketType:'OTHER'}});
  const report=mapPeriodicReports(evidence.find(r=>r.path==='list.json'&&r.corpCode===corpCode)!.rows,2024).find(r=>r.reportCode===reportCode)!;
  const receiptNo=corpCode==='00113410'?'20250317000953':report.receiptNo;
  const rows:DartFinancialRow[]=[{receiptNo,corpCode,fiscalYear:2024,reportCode,statementDivision:'IS',statementName:'fixture',accountId:'ifrs-full_Revenue',accountName:'매출액',currentAmount:'100',currentYtdAmount:'200',currency:'KRW'}];
  const source=validateDartFiling({corpCode,taskFiscalYear:2024,report,rows,fsDivision:'CFS'});
  const input={securityId:stock.id,fiscalYear:2024,periodType:report.periodType,reportCode,fsDivision:'CFS' as const,...source,collectedAt:new Date(),values:normalizeDartFinancialRows(rows)};
  assert.equal((await repo.saveFiling(input)).created,true);
  const before=await db.dartFinancialFiling.findUniqueOrThrow({where:{receiptNo}});
  assert.equal(before.periodEndDate.toISOString().slice(0,10),corpCode==='01170962'?'2024-12-31':'2024-12-31');
  assert.equal((before.sourceValidation as any).returnedReceiptNo,receiptNo);
  assert.equal((before.sourceValidation as any).currency,'KRW');
  assert.equal((before.sourceValidation as any).amountUnit,'CURRENCY_UNITS');
  assert.equal(before.revenueYtd!.toString(),'200');assert.equal(before.revenueQuarter!.toString(),'100');
  if(corpCode==='00113410')assert.equal((before.sourceValidation as any).selectedReceiptNo,'20250317001020');
  assert.equal((await repo.saveFiling({...input,values:{...input.values,revenueYtd:'999'}})).created,false);
  assert.equal(await db.dartFinancialFiling.count({where:{receiptNo}}),1);
  assert.equal((await db.dartFinancialFiling.findUniqueOrThrow({where:{receiptNo}})).revenueYtd!.toString(),'200');
  if(corpCode==='01170962'){
   const expected={ANNUAL:'2024-06-30',Q1:'2024-09-30',Q3:'2024-03-31'};
   for(const other of mapPeriodicReports(evidence.find(r=>r.path==='list.json'&&r.corpCode===corpCode)!.rows,2024).filter(r=>r.reportCode!==reportCode)){
    // DB fixture units/amounts are synthetic KRW; real GRT foreign currency remains blocked in production.
    const otherRows=[{...rows[0]!,receiptNo:other.receiptNo,reportCode:other.reportCode}];
    const proof=validateDartFiling({corpCode,taskFiscalYear:2024,report:other,rows:otherRows,fsDivision:'CFS'});
    await repo.saveFiling({...input,periodType:other.periodType,reportCode:other.reportCode,...proof,values:normalizeDartFinancialRows(otherRows)});
    const stored=await db.dartFinancialFiling.findUniqueOrThrow({where:{receiptNo:other.receiptNo}});
    assert.equal(stored.periodEndDate.toISOString().slice(0,10),expected[other.periodType as keyof typeof expected]);
   }
  }
  if(corpCode==='00113410'){
   const later='20250318001021';
   const updated=mapPeriodicReports([...evidence.find(r=>r.path==='list.json'&&r.corpCode===corpCode)!.rows,{corp_code:corpCode,rcept_no:later,rcept_dt:'20250318',report_nm:'[첨부추가]사업보고서 (2024.12)'}],2024).find(r=>r.reportCode===reportCode)!;
   const proof=validateDartFiling({corpCode,taskFiscalYear:2024,report:updated,rows,fsDivision:'CFS'});
   assert.equal((await repo.saveFiling({...input,...proof})).created,false);
   assert.equal(await repo.hasStoredReceipt(later),true);
   assert.equal(await repo.hasStoredReceipt('20250318009999'),false);
   const metadata=(await db.dartFinancialFiling.findUniqueOrThrow({where:{receiptNo}})).sourceValidation as any;
   assert.equal(metadata.returnedReceiptNo,receiptNo);assert.ok(metadata.priorSelectedReceiptNos.includes('20250317001020'));
  }
  const stable=await db.dartFinancialFiling.findUniqueOrThrow({where:{receiptNo}});
  await assert.rejects(repo.saveFiling({...input,periodEndDate:new Date('2024-06-30')}),(e:unknown)=>e instanceof DartApiError&&e.code==='STORED_FILING_CONFLICT');
  await assert.rejects(repo.saveFiling({...input,fiscalYear:2023}),DartApiError);
  assert.deepEqual(await db.dartFinancialFiling.findUniqueOrThrow({where:{receiptNo}}),stable);
  const count=await db.dartFinancialFiling.count();
  assert.throws(()=>validateDartFiling({corpCode,taskFiscalYear:2024,report,rows:[...rows,{...rows[0]!,receiptNo:'20250317009999'}],fsDivision:'CFS'}),DartApiError);
  assert.throws(()=>validateDartFiling({corpCode,taskFiscalYear:2024,report,rows:[{...rows[0]!,corpCode:'99999999'}],fsDivision:'CFS'}),DartApiError);
  assert.equal(await db.dartFinancialFiling.count(),count);
  const task=await db.dartBackfillTask.create({data:{securityId:stock.id,fiscalYear:2024,reportCode,periodType:report.periodType,status:'FAILED',attempts:3,errorCode:'REVIEW_REQUIRED',errorMessage:'RECEIPT_MISMATCH: preserved historical event'}});
  const run=await db.collectorRun.create({data:{jobType:'source-validation-fixture',provider:'FIXTURE',status:'RUNNING'}});
  await repo.addRunItem(run.id,{id:stock.id,symbol,corpCode,securityType:'STOCK'},{...task,reportCode,periodType:report.periodType},'FAILED','RECEIPT_MISMATCH',{originalCode:'RECEIPT_MISMATCH',attempt:3,returnedReceiptNo:receiptNo,selectedReceiptNo:report.receiptNo,validationResult:'HISTORICAL_RECEIPT_MISMATCH'});
  await repo.updateTask(task.id,{status:'SUCCESS',attempts:4,diagnostics:source.sourceValidation as any});
  assert.equal((await db.collectorRunItem.findFirstOrThrow({where:{runId:run.id}})).message,'RECEIPT_MISMATCH');
 }
 assert.deepEqual(await db.dartBackfillTask.findMany({where:{id:{in:originalTasks.map(t=>t.id)}}}),originalTasks);
 assert.deepEqual(await db.dartFinancialFiling.findMany({where:{id:{in:originalFilings.map(f=>f.id)}}}),originalFilings);
 console.log('MariaDB: source/selection receipts separated, real dates, currency/unit metadata, amounts/YTD, idempotency, negative-save blocking, SUCCESS/pending and error history preservation verified');
 }finally{await db.$disconnect();}
});
