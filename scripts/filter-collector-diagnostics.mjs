import {createInterface} from 'node:readline';
const records=[];
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 if(line.length>20000)continue;
 let row;try{row=JSON.parse(line);}catch{continue;}
 if(!row||typeof row!=='object'||!['DART collector failure','DART failure recording failed','DART collector worker tick failed','manual_refresh_task','historical_price_failure','DART task primary failure','DART task failed','DART phase2 failure','DART manual source failure'].includes(row.event))continue;
 row={...row,...(row.context&&typeof row.context==='object'?row.context:{})};
 const record={event:'collector_diagnostic'};
 for(const key of ['timestamp','runId','jobId','source','fiscalYear','period','durationMs','code','category','stage','exceptionClass','symbol','corpCode','taskFiscalYear','apiFiscalYear','reportCode','fsDivision','reportPeriod','selectedReceiptNo','returnedReceiptNo','validationResult','originalCode','attempt','selectedCorrectionType','sourceCorrectionType']){
  const value=row[key];
  if(value==null)continue;
  if(['runId','jobId','fiscalYear','durationMs','taskFiscalYear','apiFiscalYear','attempt'].includes(key)&&/^\d{1,20}$/.test(String(value)))record[key]=value;
  else if(key==='timestamp'&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value))record[key]=value;
  else if(['code','originalCode'].includes(key)&&/^(?:\d{3}|(?:[A-Z][A-Z0-9]*_)+[A-Z0-9_]+)$/.test(value)&&value.length<=64)record[key]=value;
  else if(key==='symbol'&&/^[A-Z0-9]{6,12}$/.test(value))record[key]=value;
  else if(key==='corpCode'&&/^\d{8}$/.test(value))record[key]=value;
  else if(key==='reportCode'&&/^1101[1234]$/.test(value))record[key]=value;
  else if(key==='fsDivision'&&/^(CFS|OFS)$/.test(value))record[key]=value;
  else if(key==='reportPeriod'&&/^\d{4}-\d{2}$/.test(value))record[key]=value;
  else if(['selectedReceiptNo','returnedReceiptNo'].includes(key)&&/^\d{14}$/.test(value))record[key]=value;
  else if(['validationResult','selectedCorrectionType','sourceCorrectionType'].includes(key)&&/^[A-Z_]{1,64}$/.test(value))record[key]=value;
  else if(['source','period','category','stage','exceptionClass'].includes(key)&&/^[A-Za-z0-9_]{1,64}$/.test(value))record[key]=value;
 }
 if(Array.isArray(row.returnedReceiptNos))record.returnedReceiptNos=[...new Set(row.returnedReceiptNos.filter(v=>typeof v==='string'&&/^\d{14}$/.test(v)))].slice(0,10);
 records.push(record);if(records.length>50)records.shift();
}
console.log(JSON.stringify({event:'collector_diagnostic_summary',count:records.length}));
for(const record of records)console.log(JSON.stringify(record));
