import fs from 'node:fs';
import assert from 'node:assert/strict';
import {mapPeriodicReports} from './fixture/collector/dart-provider.js';
const data=JSON.parse(fs.readFileSync(new URL('./dart-responses.json',import.meta.url),'utf8'));
const fixtures=data.records.filter(x=>x.path==='list.json');
const out=[];
for(const c of data.results){
 const rows=fixtures.find(x=>x.params.corp_code===c.corp).rows;
 const reports=mapPeriodicReports(rows,c.year);
 const selected=reports.find(x=>x.reportCode===c.code);
 // For the year-comparison, replay the 2024-selected receipt against the 2023 API identity.
 const compared=c.label==='period_year_comparison'?data.results[0].selected:selected;
 const strictMismatch=c.returnedReceipts.some(x=>x!==compared?.receiptNo);
 const expected=['non_december_failure','amendment_failure'].includes(c.label);
 assert.equal(strictMismatch,expected);
 out.push({label:c.label,corp:c.corp,requestYear:c.year,code:c.code,selected:compared?.receiptNo,returned:c.returnedReceipts,strictMismatch,assertion:'PASS'});
}
console.log(JSON.stringify({atUtc:new Date().toISOString(),deployment:'f16cd801236d5247358ee45c4bc7341de90dab1e',networkRequests:0,databaseAccess:false,checks:out},null,2));
