import { expect, test } from '@playwright/test';

test('target conditions persist and selected-account lots use remaining quantity', async ({ request }) => {
  const create = async (path: string, data: object) => {
    const response = await request.post(path, { data }); expect(response.status()).toBe(201); return (await response.json()).data;
  };
  const account = await create('/api/accounts', { name: `목표 검증 ${Date.now()}`, brokerName: 'CI' });
  const other = await create('/api/accounts', { name: `목표 격리 ${Date.now()}`, brokerName: 'CI' });
  const security = await create('/api/securities', { symbol: String(100000 + Math.floor(Math.random() * 800000)), name: '목표 도래 DB 검증', marketType: 'OTHER', listType: 'WATCHLIST' });
  const securityId = security.id;
  expect((await request.patch(`/api/securities/${securityId}/price`, { data: { currentPrice: '1200' } })).status()).toBe(200);
  const at = new Date().toISOString();
  const lot = await create('/api/buy-trades', { accountId: account.id, securityId, boughtAt: at, quantity: '10', unitPrice: '1000', feeTaxAmount: '0' });
  const closed = await create('/api/buy-trades', { accountId: account.id, securityId, boughtAt: at, quantity: '1', unitPrice: '1000', feeTaxAmount: '0' });
  await create('/api/sell-trades', { buyTradeId: lot.id, soldAt: at, quantity: '4', unitPrice: '1200', feeTaxAmount: '0' });
  await create('/api/sell-trades', { buyTradeId: closed.id, soldAt: at, quantity: '1', unitPrice: '1200', feeTaxAmount: '0' });
  const base = `/api/accounts/${account.id}`;
  const initial = (await (await request.get(`${base}/target-arrival-conditions`)).json()).data;
  expect(initial.conditions).toHaveLength(5);
  const report = await (await request.get(`${base}/target-arrivals`)).json();
  expect(report.meta.total).toBe(1); expect(report.data[0]).toMatchObject({ lotId: lot.id, holdingDays: 0, remainingQuantity: '6', profitLoss: '1200', representativeCondition: { days: 7, rate: '5' } });
  const emptyOther = await (await request.get(`/api/accounts/${other.id}/target-arrivals`)).json(); expect(emptyOther.meta.total).toBe(0);
  expect((await request.put(`${base}/target-arrival-conditions`, { data: { version: initial.version, conditions: [] } })).status()).toBe(200);
  expect((await (await request.get(`${base}/target-arrival-conditions`)).json()).data.conditions).toEqual([]);
  const disabled = await (await request.get(`${base}/target-arrivals`)).json(); expect(disabled.meta.enabled).toBe(false); expect(disabled.data).toEqual([]);
  expect((await request.put(`${base}/target-arrival-conditions`, { data: { version: initial.version, conditions: [{ days: 7, rate: '5' }] } })).status()).toBe(409);
  expect((await (await request.get(`/api/accounts/${other.id}/target-arrival-conditions`)).json()).data.conditions).toHaveLength(5);
});
