import assert from 'node:assert/strict';
import test from 'node:test';
import {compoundAchievement,compoundAssetColor} from '../../src/utils/compoundAchievement';
import {colors} from '../../src/styles/tokens';
test('unrounded decimal boundaries including huge amounts and display rounding',()=>{
 for(const [amount,status] of [['89.999999','below'],['90','near'],['90.000001','near'],['99.999999','near'],['100','near'],['100.000001','above'],['0','below'],['-1','below']] as const)assert.equal(compoundAchievement(amount,'100'),status);
 assert.equal(compoundAchievement('90000000000000000.00000001','100000000000000000'),'near');
 assert.equal(compoundAchievement('89999999999999999.99999999','100000000000000000'),'below');
 assert.equal(compoundAchievement('100000000000000000.00000001','100000000000000000'),'above');
 assert.equal(compoundAchievement('0.09','0.1'),'near');
});
test('unavailable denominator/current uses common neutral token',()=>{
 for(const target of [null,undefined,'0','-1','NaN',''])assert.equal(compoundAssetColor('100',target),colors.textPrimary);
 for(const current of [null,undefined,'NaN',''])assert.equal(compoundAssetColor(current,'100'),colors.textPrimary);
 assert.equal(compoundAssetColor('90','100'),colors.warning);assert.equal(compoundAssetColor('0','100'),colors.marketFall);assert.equal(compoundAssetColor('101','100'),colors.marketRise);
});
