import test from 'node:test';
import assert from 'node:assert/strict';
import {tradeHoldingDays,seoulTradeDate} from '../../src/utils/tradeDates';
import {sortedSellCandidates,candidateAmounts,parseTradeNotice} from '../../src/notifications/tradeNotice';
const notice=parseTradeNotice({id:'n',raw:'[미래에셋증권] 전량체결\n매매구분: 매도\n체결일자: 2026.10.22\n체결수량: 5주\n체결단가: 311,000원',receivedAt:0})!;
const lot=(id:string,unitPrice:string,boughtAt='2026-10-13',remainingQuantity='10')=>({id,unitPrice,boughtAt,remainingQuantity});
test('Seoul holding days: same day, year boundary, split exits, invalid dates',()=>{
 assert.equal(tradeHoldingDays('2026-10-21T15:00:00Z','2026-10-22T14:59:59Z'),0);
 assert.equal(tradeHoldingDays('2025-12-31','2026-01-01'),1);
 assert.equal(tradeHoldingDays('2026-10-01','2026-10-03'),2);
 assert.equal(tradeHoldingDays('2026-10-01','2026-10-22'),21);
 for(const value of ['bad','2026-02-30','2026-02-30T00:00:00Z','2026-10-22T00:00:00'])assert.equal(seoulTradeDate(value),null);
 assert.equal(tradeHoldingDays('2026-10-23','2026-10-22'),null);
});
test('sort exact rate descending, then Seoul buy day ascending, then stable id; filter eligibility',()=>{
 const rows=[lot('loss','400000'),lot('b','290000','2026-10-12'),lot('a','290000','2026-10-12'),lot('later','290000'),lot('profit','300000'),lot('flat','311000'),lot('future','1','2026-10-23'),lot('short','1','2026-10-01','4'),lot('zero','0'),lot('invalid','100','2026-02-30')];
 assert.deepEqual(sortedSellCandidates(rows,notice).map(l=>l.id),['a','b','later','profit','flat','loss']);
 assert.deepEqual(rows.map(l=>l.id),['loss','b','a','later','profit','flat','future','short','zero','invalid']);
 const precise=[lot('high','300000.0002'),lot('low','300000.0001')];assert.equal(sortedSellCandidates(precise,notice)[0].id,'low');
 assert.deepEqual(sortedSellCandidates([lot('worse','500000'),lot('better','400000')],notice).map(l=>l.id),['better','worse']);
});
test('remaining total and sale profit use different quantities with exact decimal arithmetic',()=>{
 assert.deepEqual(candidateAmounts(lot('a','290000'),notice),{profit:'105000',total:'2900000',sign:1});
 assert.deepEqual(candidateAmounts(lot('b','311000'),notice),{profit:'0',total:'3110000',sign:0});
 assert.deepEqual(candidateAmounts(lot('c','400000'),notice),{profit:'-445000',total:'4000000',sign:-1});
 assert.deepEqual(candidateAmounts(lot('d','100.0001','2026-01-01','10.0001'),{...notice,quantity:'0.0001',price:'100.0002'}),{profit:'0.00000001',total:'1000.01100001',sign:1});
});
