import {createInterface} from 'node:readline';
const records=[];
for await(const line of createInterface({input:process.stdin,crlfDelay:Infinity})){
 if(line.length>20000)continue;
 let row;try{row=JSON.parse(line);}catch{continue;}
 if(!row||typeof row!=='object'||!['DART collector failure','DART failure recording failed','DART collector worker tick failed','manual_refresh_task','historical_price_failure'].includes(row.event))continue;
 const record={event:'collector_diagnostic'};
 for(const key of ['timestamp','runId','jobId','source','fiscalYear','period','durationMs','code','category','stage','exceptionClass']){
  const value=row[key];
  if(value==null)continue;
  if(['runId','jobId','fiscalYear','durationMs'].includes(key)&&/^\d{1,20}$/.test(String(value)))record[key]=value;
  else if(key==='timestamp'&&/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value))record[key]=value;
  else if(key==='code'&&/^(?:\d{3}|(?:[A-Z][A-Z0-9]*_)+[A-Z0-9_]+)$/.test(value)&&value.length<=64)record[key]=value;
  else if(['source','period','category','stage','exceptionClass'].includes(key)&&/^[A-Za-z0-9_]{1,64}$/.test(value))record[key]=value;
 }
 records.push(record);if(records.length>50)records.shift();
}
console.log(JSON.stringify({event:'collector_diagnostic_summary',count:records.length}));
for(const record of records)console.log(JSON.stringify(record));
