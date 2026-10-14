import test from 'node:test';import assert from 'node:assert/strict';
import {parseAnalysisSort,sortAnalysisRows} from './analysis-sort.js';
test('default W, exact Decimal multi-order, missing last in either direction and code ties',()=>{
 const rows=[{id:'3',symbol:'003',w:'0',eps:'10'},{id:'1',symbol:'001',w:'9007199254740993',eps:'-5'},{id:'2',symbol:'002',w:'9007199254740992',eps:'0'},{id:'4',symbol:'004',w:null,eps:'999'}];
 assert.deepEqual(sortAnalysisRows(rows,parseAnalysisSort()).map(r=>r.id),['1','2','3','4']);
 assert.deepEqual(sortAnalysisRows(rows,parseAnalysisSort('w:asc')).map(r=>r.id),['3','2','1','4']);
 assert.deepEqual(sortAnalysisRows(rows,parseAnalysisSort('eps:asc,w:desc')).map(r=>r.id),['1','2','3','4']);
 assert.deepEqual(sortAnalysisRows(rows,parseAnalysisSort('')).map(r=>r.id),['1','2','3','4']);
 for(const v of ['no:asc','w:invalid','w:asc,w:desc','w:desc:bad'])assert.throws(()=>parseAnalysisSort(v));
});
