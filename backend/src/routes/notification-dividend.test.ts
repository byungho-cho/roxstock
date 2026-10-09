import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApp } from '../app.js';
import { prisma } from '../lib/prisma.js';
import { Prisma } from '../generated/prisma/index.js';

test('dividend notification retries replay a single cash entry; changed payload and invalid id are rejected', async () => {
  const original = prisma.$transaction;
  const records = new Map<string, any>();
  let cashWrites = 0, dividendWrites = 0, balance = new Prisma.Decimal(1000000);
  const tx: any = {
    $queryRaw: async () => [],
    account: { findUnique: async () => ({ id: 1n, isActive: true }), update: async ({ data }: any) => { balance = data.cashBalance; } },
    security: { findUnique: async () => ({ id: 2n, isActive: true }) },
    tradeRequest: { findUnique: async ({ where }: any) => records.get(where.accountId_requestId.requestId), create: async ({ data }: any) => { records.set(data.requestId, data); return data; } },
    cashTransaction: { findFirst: async () => ({ id: 1n, balanceAfter: balance }), create: async ({ data }: any) => { cashWrites++; assert.equal(data.transactionDate.toISOString(), '2026-10-09T16:30:15.000Z'); assert.equal(data.feeTaxAmount.toString(), '21170'); return { ...data, id: 2n }; } },
    dividend: { create: async ({ data }: any) => { dividendWrites++; return { ...data, id: 3n }; } },
  };
  prisma.$transaction = (async (work: any) => work(tx)) as any;
  const app = buildApp();
  const payload = { requestId: 'notification-dividend-001', accountId: '1', securityId: '2', receivedDate: '2026-10-09T16:30:15Z', grossAmount: '137500', netAmount: '116330', memo: null };
  try {
    const send = (body: object) => app.inject({ method: 'POST', url: '/api/dividends', payload: body });
    const first = await send(payload); assert.equal(first.statusCode, 201, first.body);
    const retry = await send(payload); assert.equal(retry.statusCode, 201, retry.body); assert.deepEqual(retry.json(), first.json());
    assert.equal(cashWrites, 1); assert.equal(dividendWrites, 1); assert.equal(balance.toString(), '1116330');
    const changed = await send({ ...payload, netAmount: '116000' }); assert.equal(changed.statusCode, 409); assert.equal(changed.json().error.code, 'REQUEST_ID_REUSED');
    assert.equal((await send({ ...payload, requestId: 'bad' })).statusCode, 400);
    assert.equal((await send({ ...payload, requestId: 'another-notification-001', grossAmount: '1' })).statusCode, 400);
    assert.equal(cashWrites, 1);
  } finally { await app.close(); prisma.$transaction = original; }
});
