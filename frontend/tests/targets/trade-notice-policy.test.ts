import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTradeNotice,normalizeBrokerStockCode,matchingNoticeStocks,formatNoticeNumber,accountMatches,sellCandidates} from '../../src/notifications/tradeNotice';
const raw='[미래에셋증권] 전량체결\n매매구분: 매도\n계좌번호: 1234-**-5678\n종목명: 현대차\n종목코드: 005380\n체결일자: 2026.10.22\n체결수량: 5주\n체결단가: 311,000원';
test('only supported broker messages parse, unknown dates and fields stay empty',()=>{assert.equal(parseTradeNotice({id:'1',raw:'친구 메시지 매수 10주',receivedAt:0}),null);const n=parseTradeNotice({id:'1',raw,receivedAt:0})!;assert.equal(n.quantity,'5');assert.equal(n.price,'311000');assert.equal(n.date,'2026-10-22');assert.equal(parseTradeNotice({id:'1',raw:raw.replace('2026.10.22','10.22'),receivedAt:0})!.date,'');assert.equal(parseTradeNotice({id:'1',raw:raw.replace('2026.10.22','2026.02.31'),receivedAt:0})!.date,'');});
test('account masking and lot eligibility never combine lots or choose a future purchase',()=>{assert.equal(accountMatches('1234-**-5678','1234-12-5678'),true);assert.equal(accountMatches('','1234'),false);const n=parseTradeNotice({id:'1',raw,receivedAt:0})!;const lots=[{id:'a',boughtAt:'2026-10-21T15:00:00Z',remainingQuantity:'5'},{id:'b',boughtAt:'2026-10-22T15:00:00Z',remainingQuantity:'10'},{id:'c',boughtAt:'2026-10-21T00:00:00Z',remainingQuantity:'4'}];assert.deepEqual(sellCandidates(lots,n).map(l=>l.id),['a']);});
test('embedded broker stock code separates Kia name and preserves leading zeroes',()=>{
 const notice=parseTradeNotice({id:'stored-notice',raw:raw.replace('현대차','기아(A000270)').replace('종목코드: 005380\n','').replace('5주','10주').replace('311,000원','108,400원'),receivedAt:0})!;
 assert.equal(notice.name,'기아');assert.equal(notice.symbol,'000270');assert.equal(notice.quantity,'10');assert.equal(notice.price,'108400');assert.equal(notice.id,'stored-notice');
});

const stocks=[{id:'kia',name:'기아',symbol:'000270'},{id:'hyundai',name:'현대차',symbol:'005380'}];
const parse=(message:string)=>parseTradeNotice({id:'persisted',raw:message,receivedAt:0})!;
test('stock codes are strings, exact code wins over name, uncertain codes never fall back',()=>{
 assert.equal(normalizeBrokerStockCode('A000270'),'000270');assert.equal(normalizeBrokerStockCode('000270'),'000270');assert.equal(normalizeBrokerStockCode('a005380'),'005380');
 for(const bad of ['270','A00027','B000270','AA000270','0002700','A00027X'])assert.equal(normalizeBrokerStockCode(bad),undefined);
 assert.deepEqual(matchingNoticeStocks(stocks,parse(raw.replace('현대차','다른 표기'))).map(s=>s.id),['hyundai']);
 assert.deepEqual(matchingNoticeStocks(stocks,parse(raw.replace('005380','A005380'))).map(s=>s.id),['hyundai']);
 assert.deepEqual(matchingNoticeStocks(stocks,parse(raw.replace('005380','A00027'))),[]);
 assert.deepEqual(matchingNoticeStocks(stocks,parse(raw.replace('현대차','기아(A000270)'))),[]);
});
test('name-only notices require a unique exact name; no similarity or symbol fallback',()=>{
 const message=raw.replace('종목코드: 005380\n','');assert.deepEqual(matchingNoticeStocks(stocks,parse(message)).map(s=>s.id),['hyundai']);
 assert.deepEqual(matchingNoticeStocks(stocks,parse(message.replace('현대차','현대'))),[]);
 assert.deepEqual(matchingNoticeStocks([...stocks,{id:'other',name:'현대차',symbol:'123456'}],parse(message)).map(s=>s.id),['hyundai','other']);
 assert.deepEqual(matchingNoticeStocks(stocks,parse(raw.replace('005380','999999'))),[]);
});
test('buy, sell and dividend share embedded code identity without changing stored IDs',()=>{
 const buy=raw.replace('매매구분: 매도','매매구분: 매수').replace('현대차','기아(A000270)').replace('종목코드: 005380\n','');
 const messages=[buy,buy.replace('매매구분: 매수','매매구분: 매도'),buy.replace('[미래에셋증권] 전량체결','[미래에셋증권] 권리 입금 안내\n배당금 입금')];
 assert.deepEqual(messages.map(m=>parse(m).kind),['BUY','SELL','DIVIDEND']);
 for(const message of messages){const n=parse(message);assert.equal(n.id,'persisted');assert.equal(n.name,'기아');assert.equal(n.symbol,'000270');assert.deepEqual(matchingNoticeStocks(stocks,n).map(s=>s.id),['kia']);}
});
test('notice numbers group thousands without changing numeric values or decimal precision',()=>{
 assert.equal(formatNoticeNumber('108400'),'108,400');assert.equal(formatNoticeNumber('1084000'),'1,084,000');assert.equal(formatNoticeNumber('108400.0123'),'108,400.0123');assert.equal(formatNoticeNumber(''),'?' );assert.equal(formatNoticeNumber('', '확인 필요'),'확인 필요');
});

test('notification date uses explicit date or persisted receipt day in Seoul, never opening day',()=>{
 const without=raw.replace('체결일자: 2026.10.22\n','');
 for(const [receivedAt,expected] of [[Date.parse('2026-10-21T14:59:59Z'),'2026-10-21'],[Date.parse('2026-10-21T15:00:00Z'),'2026-10-22']] as const){
  assert.equal(parseTradeNotice({id:'old',raw:without,receivedAt})!.date,expected);
  assert.equal(parseTradeNotice({id:'old',raw,receivedAt})!.date,'2026-10-22');
 }
});
