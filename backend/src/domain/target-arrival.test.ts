import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultTargetConditions, evaluateTargetLots, seoulDate, validateTargetConditions, type TargetLotInput } from './target-arrival.js';

const now = new Date('2026-10-01T03:10:00Z');
function lot(days: number, rate: string, extra: Partial<TargetLotInput> = {}): TargetLotInput {
  const buy = new Date('2026-10-01T03:00:00Z'); buy.setUTCDate(buy.getUTCDate() - days);
  return { id: '1', securityId: '1', symbol: '005930', name: '삼성전자', boughtAt: buy,
    quantity: '10', soldQuantities: [], unitPrice: '100', currentPrice: String(100 + Number(rate)), priceUpdatedAt: now, ...extra };
}
test('independent OR conditions include boundaries and choose shortest matching period', () => {
  for (const [days, rate, expected, representative] of [[5,'6',true,7],[20,'8',false,0],[20,'11',true,30],[80,'16',true,90],[200,'25',false,0],[200,'30',true,365],[366,'50',false,0],[7,'5',true,7],[30,'10',true,30],[90,'15',true,90],[180,'20',true,180],[365,'30',true,365],[0,'5',true,7]] as const) {
    const result = evaluateTargetLots([lot(days, rate)], defaultTargetConditions, now);
    assert.equal(result.data.length, expected ? 1 : 0, `${days} days/${rate}%`);
    if (expected) assert.equal(result.data[0]!.representativeCondition.days, representative);
  }
  assert.equal(evaluateTargetLots([lot(5, '40')], defaultTargetConditions, now).data.length, 1);
  assert.equal(evaluateTargetLots([lot(7, '4.96')], defaultTargetConditions, now).data.length, 0);
});
test('partial sales use remainder, closed lots excluded, cost basis remains lot-specific', () => {
  const result = evaluateTargetLots([lot(5,'6',{ soldQuantities: ['2','3'] }), lot(5,'6',{ id:'2', soldQuantities: ['10'] }), lot(5,'6',{ id:'3', unitPrice:'105' })], defaultTargetConditions, now);
  assert.equal(result.data.length, 1); assert.equal(result.data[0]!.remainingQuantity, '5'); assert.equal(result.data[0]!.profitLoss, '30');
});
test('Korean calendar date changes at midnight, not after elapsed 24 hours', () => {
  assert.equal(seoulDate(new Date('2026-09-30T15:00:00Z')), '2026-10-01');
  const input = lot(0,'6',{ boughtAt: new Date('2026-09-30T14:59:59Z') });
  assert.equal(evaluateTargetLots([input], defaultTargetConditions, new Date('2026-09-30T15:00:01Z')).unavailable.length,1); // future quote rejected
  input.priceUpdatedAt = new Date('2026-09-30T15:00:00Z');
  assert.equal(evaluateTargetLots([input], defaultTargetConditions,new Date('2026-09-30T15:00:01Z')).data[0]!.holdingDays,1);
});
test('invalid price/cost/future dates are not normal empty results', () => {
  const result=evaluateTargetLots([lot(5,'6',{currentPrice:null}),lot(5,'6',{id:'2',unitPrice:'0'}),lot(-1,'6',{id:'3'})],defaultTargetConditions,now);
  assert.equal(result.unavailable.length,3);assert.equal(result.data.length,0);
});
test('exact ratio sort, older Korean date, numeric Lot ID; results are not capped at five', () => {
  const lots=[lot(1,'5',{id:'10'}),lot(1,'5',{id:'2'}),lot(2,'5',{id:'3'}),lot(1,'5.001',{id:'4'}),lot(1,'5',{id:'5'}),lot(1,'5',{id:'6'})];
  assert.deepEqual(evaluateTargetLots(lots,defaultTargetConditions,now).data.map(r=>r.lotId),['4','3','2','5','6','10']);
  assert.equal(evaluateTargetLots(lots,[],now).data.length,0);
});
test('large decimal boundary uses exact multiplication; rounded display never enters judgment', () => {
  const high=lot(7,'5',{unitPrice:'900000000000000.0000', currentPrice:'945000000000000.0000'});
  assert.equal(evaluateTargetLots([high],defaultTargetConditions,now).data.length,1);
  const huge=evaluateTargetLots([lot(0,'6',{unitPrice:'888888888888888',currentPrice:'999999999999999',quantity:'100000000000'})],defaultTargetConditions,now).data[0]!;
  assert.equal(huge.profitLoss,'11111111111111100000000000');
  assert.equal(huge.currentPrice,'999999999999999');
  high.currentPrice='944999999999999.9999';
  assert.equal(evaluateTargetLots([high],defaultTargetConditions,now).data.length,0);
});
test('settings validation: duplicate periods, bad inputs, max five and explicit empty', () => {
  assert.deepEqual(validateTargetConditions([]),[]);
  assert.deepEqual(validateTargetConditions([{days:30,rate:'10.00'},{days:7,rate:'5'}]),[{days:7,rate:'5'},{days:30,rate:'10'}]);
  for(const input of [Array(6).fill({days:7,rate:'5'}),[{days:7,rate:'5'},{days:7,rate:'10'}],[{days:0,rate:'1'}],[{days:1.2,rate:'1'}],[{days:1,rate:'0'}],[{days:1,rate:'NaN'}],[{days:1,rate:'1.00001'}]]) assert.throws(()=>validateTargetConditions(input));
});
