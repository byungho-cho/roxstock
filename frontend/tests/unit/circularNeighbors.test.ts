import test from 'node:test';
import assert from 'node:assert/strict';
import {circularNeighbors} from '../../src/utils/circularNeighbors';
test('entry order wraps both ends, deduplicates IDs and ignores missing or singleton selections',()=>{
 const rows=['3','1','2'].map(id=>({id}));
 assert.deepEqual(circularNeighbors(rows,'3'),{previous:rows[2],next:rows[1]});
 assert.deepEqual(circularNeighbors(rows,'2'),{previous:rows[1],next:rows[0]});
 for(const items of [[],[rows[0]],[rows[0],rows[0]]])assert.deepEqual(circularNeighbors(items,'3'),{previous:undefined,next:undefined});
 assert.equal(circularNeighbors(rows.slice(0,2),'3').previous?.id,'1');
 assert.equal(circularNeighbors(rows.slice(0,2),'3').next?.id,'1');
 assert.deepEqual(circularNeighbors(rows,'absent'),{previous:undefined,next:undefined});
});
