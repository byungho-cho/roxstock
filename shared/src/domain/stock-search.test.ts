import assert from 'node:assert/strict';
import test from 'node:test';
import {hasInitialQuery,matchesStockSearch} from './stock-search.js';
test('initial and mixed stock search preserves literal names and codes',()=>{
 for(const [name,query] of [['삼성전자','ㅅㅅㅈㅈ'],['삼성전자','ㅅㅅ'],['삼성전자','삼성ㅈㅈ'],['현대차','ㅎㄷㅊ'],['SK하이닉스','skㅎㅇ'],['005930','593'],['쌍용','ㅆㅇ']] as const)assert.equal(matchesStockSearch(name,query),true,query);
 for(const [name,query] of [['삼성전자','ㅅㅈㅅ'],['삼성전자','ㅎㄷ'],['삼성','ㅅㅅㅈ'],['쌍용','ㅅㅇ']] as const)assert.equal(matchesStockSearch(name,query),false,query);
 assert.equal(hasInitialQuery('삼성전자'),false);assert.equal(hasInitialQuery('ㅅㅅ'),true);
});