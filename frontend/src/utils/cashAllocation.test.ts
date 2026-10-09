import assert from 'node:assert/strict';import test from 'node:test';
import {cashAllocation} from './cashAllocation';import {colors} from '../styles/tokens';
test('cash allocation uses unrounded account-specific composition and exact thresholds',()=>{
 for(const [cash,stockColor,cashColor] of [[19.99,colors.marketFall,colors.marketRise],[20,colors.marketRise,colors.marketFall],[29.99,colors.marketRise,colors.marketFall],[30,colors.positive,colors.warning],[19.9999,colors.marketFall,colors.marketRise],[29.9999,colors.marketRise,colors.marketFall],[0,colors.marketFall,colors.marketRise]] as const){const r=cashAllocation(100-cash,cash);assert.equal(r.stockColor,stockColor);assert.equal(r.cashColor,cashColor);}
 assert.notEqual(cashAllocation(70,30).cashColor,cashAllocation(90,10).cashColor);
 for(const [stock,cash,complete] of [[0,0,true],[null,20,true],[100,null,true],[100,20,false],[NaN,20,true]] as const){const r=cashAllocation(stock,cash,complete);assert.equal(r.available,false);assert.ok(Number.isNaN(r.cashPercent));assert.equal(r.cashColor,colors.textMuted);}
});
