import assert from 'node:assert/strict';
import test from 'node:test';
import { stockMatches } from '../../src/utils/stockSearch.ts';
import { isMarketClosed } from '../../src/utils/marketCalendar.ts';

test('initial, partial initial, name and code searches remain distinct', () => {
  for (const query of ['ㅎㄷㅊ','ㅎㄷ','ㄷㅊ','현대차','현대','005380','5380',' ㅎㄷㅊ ']) assert.ok(stockMatches('현대차','005380',query),query);
  for (const query of ['ㅅㅅㅈㅈ','ㅅㅅ','ㅈㅈ','삼성전자','삼성','005930']) assert.ok(stockMatches('삼성전자','005930',query),query);
  assert.ok(stockMatches('현대 차','005380','ㅎ ㄷ ㅊ'));
  assert.ok(stockMatches('SK하이닉스','000660','sk하이'));
  assert.ok(stockMatches('깨끗한나라','004540','ㄲㄲㅎ'));
  assert.equal(stockMatches('현대차','005380','ㅅㅅ'),false);
  assert.equal(stockMatches('현대차','005380','현ㅊ'),false);
  assert.ok(stockMatches('삼성전자','005930',''));
});
test('KRX weekends, public and special closures and year end do not depend on profit', () => {
  for (const date of ['2026-10-03','2026-10-04','2026-10-05','2026-09-25','2026-05-01','2026-06-03','2026-12-31','2023-12-29','2025-01-27','2025-06-03']) assert.ok(isMarketClosed(date),date);
  for (const date of ['2026-10-06','2026-10-07','2023-12-28','2025-01-24','2026-01-02','2021-12-27']) assert.equal(isMarketClosed(date),false,date);
});
