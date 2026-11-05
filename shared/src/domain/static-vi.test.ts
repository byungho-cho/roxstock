import test from 'node:test';
import assert from 'node:assert/strict';
import {parseKisTrades,quoteDayPrices,type LiveQuote} from './live-quotes.js';
import {staticViPrices,stockTick} from './static-vi.js';

const quote=(overrides:Partial<LiveQuote>={}):LiveQuote=>({symbol:'000270',market:'KRX',price:99900,change:4100,rate:4.28,observedAt:'2026-11-05T00:41:00Z',receivedAt:Date.now(),source:'KIS',viReferencePrice:97100,...overrides});
test('reference and ordinary stock ticks produce the screenshot boundaries without float rounding',()=>{
    assert.deepEqual(staticViPrices(quote(),true),{upper:106900,lower:87300,market:'KRX'});
    assert.deepEqual(staticViPrices(quote({viReferencePrice:100000}),true),{upper:110000,lower:90000,market:'KRX'});
    assert.deepEqual(staticViPrices(quote({viReferencePrice:199999,market:'NXT'}),true),{upper:220000,lower:179900,market:'NXT'});
    for(const n of[1999,2000,4999,5000,19999,20000,49999,50000,199999,200000,499999,500000]){
        const p=staticViPrices(quote({viReferencePrice:n}),true)!;
        assert.ok(p.upper>=n*11/10&&p.lower<=n*9/10);
        assert.equal(p.upper%stockTick(p.upper),0);assert.equal(p.lower%stockTick(p.lower),0);
    }
});
test('unsupported products, missing references, cache and unidentified TOTAL do not invent VI values',()=>{
    assert.equal(staticViPrices(quote(),false),null);
    for(const viReferencePrice of[undefined,0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER])assert.equal(staticViPrices(quote({viReferencePrice}),true),null);
    assert.equal(staticViPrices(quote({source:'CACHE'}),true),null);
    assert.equal(staticViPrices(quote({market:'TOTAL'}),true),null);
    assert.equal(staticViPrices(quote({market:'TOTAL',sourceMarket:'NXT'}),true)?.market,'NXT');
    // The provider moves the reference after a single-price auction.
    assert.equal(staticViPrices(quote({viReferencePrice:106900}),true)?.upper,117600);
});
test('existing batched feed provides optional OHLC and reference fields with no extra subscription',()=>{
    const f=Array(47).fill('0');Object.assign(f,{0:'000270',1:'094100',2:'99900',3:'2',4:'4100',5:'4.28',7:'97100',8:'101900',9:'96500',12:'1',33:'20261030',45:'97100',46:'K'});
    for(const tr of['H0STCNT0','H0NXCNT0','H0UNCNT0']){const rows=parseKisTrades('0|'+tr+'|002|'+f.join('^')+'^'+f.join('^'));assert.equal(rows.length,2);assert.deepEqual([rows[0].open,rows[0].high,rows[0].low,rows[0].viReferencePrice],[97100,101900,96500,97100]);}
    f[7]='';f[8]='bad';f[9]='0';f[45]='-1';const row=parseKisTrades('0|H0STCNT0|001|'+f.join('^'))[0];assert.equal(row.price,99900);assert.equal(row.open,undefined);assert.equal(row.viReferencePrice,undefined);
    assert.deepEqual(quoteDayPrices('97100','96000','97000'),{open:97100});
});
