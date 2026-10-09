import assert from 'node:assert/strict';
import test from 'node:test';
import { kstInput, matchesMaskedAccount, parseBrokerNotice, resolveNoticeAccount } from '../../src/pages/notifications/notificationModel.ts';

const buy = '[미래에셋증권] 전량체결\n계좌번호 : 010-12**-**78-0\n종목명 : SK하이닉스(A000660)\n매매구분 : 매수\n주문수량 : 1주\n체결수량 : 1주\n체결단가 : 1,681,000원\n체결금액 : 1,681,000원\n주문번호 : 10001';
test('full fill: use filled quantity, code and price, not order quantity', () => {
  const parsed = parseBrokerNotice(buy)!;
  assert.equal(parsed.kind, 'buy'); assert.equal(parsed.symbol, '000660'); assert.equal(parsed.quantity, '1'); assert.equal(parsed.price, '1681000'); assert.deepEqual(parsed.warnings, []);
  assert.equal(parseBrokerNotice(buy.replace('매수', '매도'))?.kind, 'sell');
  const partial = parseBrokerNotice(buy.replace('주문수량 : 1주', '주문수량 : 3주'))!;
  assert.equal(partial.quantity, '1'); assert.ok(partial.warnings.length);
  assert.ok(parseBrokerNotice(buy.replace('체결금액 : 1,681,000', '체결금액 : 10'))!.warnings.length);
});
test('ignore partial fill, order acceptance, generic conversations and other brokers', () => {
  for (const text of [buy.replace('전량체결', '부분체결'), buy.replace('전량체결', '주문접수'), buy.replace('미래에셋증권', '다른증권'), '매수 전량체결 했어요']) assert.equal(parseBrokerNotice(text), null);
});
test('dividend separates gross, two taxes and net', () => {
  const parsed = parseBrokerNotice('[미래에셋증권] 권리 입금 안내\n010-12**-**78-0\nA005380 현대자동차보통주\n배당금입금 되었습니다.\n배정금액 : 137,500원(세전)\n소득세 : 19,250원\n지방소득세 : 1,920원\n세후금액 : 116,330원')!;
  assert.equal(parsed.kind, 'dividend'); assert.equal(parsed.symbol, '005380'); assert.equal(parsed.tax, '21170'); assert.equal(parsed.amount, '116330'); assert.equal(parsed.gross, '137500'); assert.deepEqual(parsed.warnings, []);
});
test('masked matching keeps positions and rejects invalid, missing or ambiguous numbers', () => {
  assert.ok(matchesMaskedAccount('010-12**-**78-0', '010123456780'));
  for (const value of ['010-9834-5678-0', '01012345678', '010-12**-**78-0', null]) assert.equal(matchesMaskedAccount('010-12**-**78-0', value), false);
  assert.equal(matchesMaskedAccount('************', '010123456780'), false);
  const accounts = [{ id: '1', accountNumber: '010123456780' }, { id: '2', accountNumber: '010987654320' }];
  assert.equal(resolveNoticeAccount('010-12**-**78-0', accounts, '1')?.id, '1');
  assert.equal(resolveNoticeAccount('010-12**-**78-0', accounts, '2'), undefined);
  assert.equal(resolveNoticeAccount('010-12**-**78-0', [...accounts, { id: '3', accountNumber: '010129999780' }], '1'), undefined);
});
test('receipt instant keeps Korean date at UTC day boundary', () => {
  assert.equal(kstInput(Date.parse('2026-10-09T16:30:15Z')), '2026-10-10T01:30:15');
});
