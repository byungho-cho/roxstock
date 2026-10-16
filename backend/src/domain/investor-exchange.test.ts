
import {combinedStockFlows} from './investor-exchange.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Prisma} from '@roxstock/shared/prisma';
const row=(exchangeScope:string,value:string,day='2026-10-15')=>({tradeDate:new Date(day),investorCode:'FOREIGN',source:'KIS_API',exchangeScope,amountUnit:'KRW',quantityUnit:'SHARE',netAmount:new Prisma.Decimal(value),buyAmount:null,sellAmount:null,buyQuantity:null,sellQuantity:null,netQuantity:new Prisma.Decimal(value),raw:{closingPrice:'100'}} as any);
test('only KRX and NXT are added exactly once, preserving decimals and ignoring pre-integrated or NAVER data',()=>{
 const rows=[row('KRX','-9007199254740993'),row('NXT','0.5'),row('UN','99'),{...row('KRX','999'),source:'NAVER_WEB'}];
 const result=combinedStockFlows(rows,'amount');assert.equal(result[0]!.netAmount!.toString(),'-9007199254740992.5');assert.equal(result[0]!.exchangeScope,'KRX_NXT');assert.equal(result[0]!.buyAmount,null);
});
test('missing exchange, explicit missing value, invalid units and duplicate scope are not invented as zero',()=>{
 assert.equal(combinedStockFlows([row('KRX','5')],'quantity')[0]!.netQuantity,null);
 assert.equal(combinedStockFlows([row('KRX','5'),{...row('NXT','2'),netQuantity:null}],'quantity')[0]!.netQuantity,null);
 assert.equal(combinedStockFlows([row('KRX','5'),{...row('NXT','2'),amountUnit:null}],'amount')[0]!.netAmount,null);
 assert.equal(combinedStockFlows([row('KRX','5'),row('KRX','5'),row('NXT','2')],'amount')[0]!.netAmount,null);
 assert.equal(combinedStockFlows([row('KRX','5'),row('NXT','-5')],'amount')[0]!.netAmount!.toString(),'0');
 assert.equal(combinedStockFlows([row('KRX','5','2025-03-03')],'amount')[0]!.netAmount!.toString(),'5');
});
