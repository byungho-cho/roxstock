import test from 'node:test';
import assert from 'node:assert/strict';
import {exactAdd,profitTotals} from './investment-profit.js';
test('profit addition retains all eight decimals, huge amounts and null uncertainty',()=>{
 assert.equal(exactAdd('999999999999999.99999999','0.00000001'),'1000000000000000.00000000');
 assert.equal(exactAdd('-1.00000001','1'),' -0.00000001'.trim());
 assert.equal(exactAdd(null,'1'),null);assert.equal(exactAdd('1e+30','0'),null);
 const totals=profitTotals([{date:'2026-01-01',securityId:'1',name:'s',kind:'SELL',buy:'0',sell:'90',cost:'100',trading:'-10',dividend:'0.00000001'}]);
 assert.equal(totals.total,'-9.99999999');assert.equal(totals.cost,'100.00000000');
});
