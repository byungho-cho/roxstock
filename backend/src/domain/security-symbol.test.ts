import assert from 'node:assert/strict';
import test from 'node:test';
import {isSecuritySymbol,normalizeSecuritySymbol,normalizeProviderSymbol} from './security-symbol.js';
import {parseSecurityMasterResponse} from '../collector/providers/data-go-kr-security-provider.js';
import {parseNaverPrice} from '../collector/providers/naver-price-provider.js';
test('six-character codes preserve zeroes and invalid characters; vendor prefix does not erase A codes',()=>{
 for(const code of ['0163y0','005930','069500','A12345'])assert.ok(isSecuritySymbol(normalizeSecuritySymbol(code)));
 assert.equal(normalizeSecuritySymbol(' 0163y0 '),'0163Y0');
 for(const code of ['0163Y!0','0163 0','01-6300','A005930','0163Y','0163Y00','０１６３Ｙ０','016ß0'])assert.equal(isSecuritySymbol(normalizeSecuritySymbol(code)),false);
 assert.notEqual(normalizeSecuritySymbol('0163Y0'),normalizeSecuritySymbol('016300'));
 assert.equal(normalizeProviderSymbol('a0163y0'),'0163Y0');assert.equal(normalizeProviderSymbol('a12345'),'A12345');
});
test('master and Naver price parser retain alphanumeric security identity',()=>{
 const parsed=parseSecurityMasterResponse({response:{header:{resultCode:'00'},body:{totalCount:3,items:{item:['A0163Y0','A12345','016300'].map(srtnCd=>({srtnCd,itmsNm:'종목',mrktCtg:'KOSDAQ'}))}}}});
 assert.deepEqual(parsed.items.map(s=>s.symbol),['0163Y0','A12345','016300']);
 const price=parseNaverPrice({id:1n,symbol:'0163y0',name:'KoAct'}, {datas:[{itemCode:'0163Y0',closePriceRaw:'10000',compareToPreviousClosePriceRaw:'0',localTradedAt:'2026-10-09T15:30:00+09:00',marketStatus:'CLOSE'}]},new Date('2026-10-09T06:30:00Z'));
 assert.equal(price.currentPrice,'10000');
});

