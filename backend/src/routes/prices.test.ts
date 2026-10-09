import assert from 'node:assert/strict';
import test from 'node:test';
import Fastify from 'fastify';
import { realtimePriceCache } from '../realtime/price-cache.js';
import { internalPriceRoutes } from './prices.js';

test('internal realtime ingestion requires token and accepts valid prices', async () => {
  const priorToken = process.env.COLLECTOR_INTERNAL_TOKEN;
  process.env.COLLECTOR_INTERNAL_TOKEN = 'test-secret';
  const app = Fastify();
  await app.register(internalPriceRoutes);

  const body = { prices: [{
    securityId: '99', symbol: '123456', name: 'Test', currentPrice: '1234', previousClosePrice: '1200',
    observedAt: '2026-09-28T01:00:00.000Z', marketStatus: 'OPEN',
  }] };
  const unauthorized = await app.inject({ method: 'POST', url: '/internal/realtime-prices', payload: body });
  assert.equal(unauthorized.statusCode, 401);

  const accepted = await app.inject({
    method: 'POST', url: '/internal/realtime-prices', payload: body,
    headers: { authorization: 'Bearer test-secret' },
  });
  assert.equal(accepted.statusCode, 200);
  assert.deepEqual(accepted.json(), { data: { accepted: 1 } });
  assert.equal(realtimePriceCache.get(new Set(['123456']))[0]?.currentPrice, '1234');

  await app.close();
  if (priorToken === undefined) delete process.env.COLLECTOR_INTERNAL_TOKEN;
  else process.env.COLLECTOR_INTERNAL_TOKEN = priorToken;
});

test('realtime cache distinguishes alphanumeric codes from numeric lookalikes',()=>{
 const base={securityId:'170',symbol:'0163y0',name:'KoAct',currentPrice:'1234',previousClosePrice:null,observedAt:'2026-10-09T01:00:00Z',marketStatus:'OPEN'};
 assert.equal(realtimePriceCache.ingest([base]).length,1);
 assert.equal(realtimePriceCache.get(new Set(['0163Y0']))[0]?.symbol,'0163Y0');
 assert.equal(realtimePriceCache.get(new Set(['016300'])).length,0);
 assert.equal(realtimePriceCache.ingest([{...base,symbol:'0163Y!0'}]).length,0);
});
