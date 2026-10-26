import test from 'node:test';
import assert from 'node:assert/strict';
import {clampChartViewport,zoomChartViewport} from '../../src/pages/investment/chartViewport.ts';
const day=86400000,bounds={start:Date.parse('2021-01-01'),end:Date.parse('2026-10-26')};
test('pinch zoom preserves midpoint and contracts the date span',()=>{
 const next=zoomChartViewport(bounds,bounds,2,.5);
 assert.equal(next.end-next.start,(bounds.end-bounds.start)/2);
 assert.equal((next.start+next.end)/2,(bounds.start+bounds.end)/2);
});
test('zoom out and pan remain within selected years, minimum one week',()=>{
 assert.deepEqual(zoomChartViewport(bounds,bounds,.1,.5),bounds);
 assert.deepEqual(clampChartViewport(bounds.start-100*day,30*day,bounds),{start:bounds.start,end:bounds.start+30*day});
 assert.deepEqual(clampChartViewport(bounds.end,30*day,bounds),{start:bounds.end-30*day,end:bounds.end});
 const next=zoomChartViewport(bounds,bounds,100000,.5);
 assert.equal(next.end-next.start,7*day);
});
test('single-date and short ranges remain valid',()=>{
 assert.deepEqual(zoomChartViewport({start:0,end:0},{start:0,end:0},2,.5),{start:0,end:0});
 assert.deepEqual(zoomChartViewport({start:0,end:day},{start:0,end:day},2,.5),{start:0,end:day});
});
