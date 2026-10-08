import assert from 'node:assert/strict';
import test from 'node:test';
import { CashTransactionType, Prisma } from '../generated/prisma/index.js';

import { cashDelta, kstMonthRange, kstYearRange, summarizeCashGroups } from './cash.js';

test('cash delta includes fee and tax with the correct sign', () => {
  const amount = new Prisma.Decimal(1000);
  const fee = new Prisma.Decimal(10);
  assert.equal(cashDelta(CashTransactionType.BUY, amount, fee).toString(), '-1010');
  assert.equal(cashDelta(CashTransactionType.SELL, amount, fee).toString(), '990');
  assert.equal(cashDelta(CashTransactionType.DEPOSIT, amount, fee).toString(), '1000');
  assert.equal(cashDelta(CashTransactionType.WITHDRAWAL, amount, fee).toString(), '-1000');
  assert.equal(cashDelta(CashTransactionType.DIVIDEND, amount, fee).toString(), '1000');
});

test('cash summary aggregates all transaction types and net change', () => {
  const decimal = (value: number) => new Prisma.Decimal(value);
  const summary = summarizeCashGroups([
    { transactionType: CashTransactionType.BUY, _sum: { amount: decimal(1000), feeTaxAmount: decimal(10) } },
    { transactionType: CashTransactionType.SELL, _sum: { amount: decimal(600), feeTaxAmount: decimal(5) } },
    { transactionType: CashTransactionType.DEPOSIT, _sum: { amount: decimal(5000), feeTaxAmount: decimal(0) } },
    { transactionType: CashTransactionType.WITHDRAWAL, _sum: { amount: decimal(500), feeTaxAmount: decimal(0) } },
    { transactionType: CashTransactionType.DIVIDEND, _sum: { amount: decimal(100), feeTaxAmount: decimal(0) } },
  ]);
  assert.deepEqual(summary, {
    buy: '1000', sell: '600', deposit: '5000', withdrawal: '500', dividend: '100', netChange: '4185',
  });
});

test('KST month and year ranges use exclusive upper boundaries', () => {
  assert.equal(kstMonthRange(2026, 9).gte.toISOString(), '2026-08-31T15:00:00.000Z');
  assert.equal(kstMonthRange(2026, 12).lt.toISOString(), '2026-12-31T15:00:00.000Z');
  assert.equal(kstYearRange(2026).gte.toISOString(), '2025-12-31T15:00:00.000Z');
  assert.equal(kstYearRange(2026).lt.toISOString(), '2026-12-31T15:00:00.000Z');
});

test('current year tax is account-scoped, independent of viewed year, excludes future and includes legacy dividend tax once', async()=>{
 const {prisma}=await import('../lib/prisma.js');const {buildApp}=await import('../app.js');
 const original={account:prisma.account.findUnique,group:prisma.cashTransaction.groupBy,recent:prisma.cashTransaction.findMany,cash:prisma.cashTransaction.aggregate,dividend:prisma.dividend.aggregate};let cashWhere:any,dividendWhere:any;
 prisma.account.findUnique=(async()=>({id:2n,name:'계좌',isActive:true,cashBalance:new Prisma.Decimal(10),updatedAt:new Date()})) as any;
 prisma.cashTransaction.groupBy=(async()=>[]) as any;prisma.cashTransaction.findMany=(async()=>[]) as any;
 prisma.cashTransaction.aggregate=(async(args:any)=>{cashWhere=args.where;return{_sum:{feeTaxAmount:new Prisma.Decimal(30)}};}) as any;
 prisma.dividend.aggregate=(async(args:any)=>{dividendWhere=args.where;return{_sum:{grossAmount:new Prisma.Decimal(100),netAmount:new Prisma.Decimal(80)}};}) as any;
 const app=buildApp();try{
  const result=await app.inject({method:'GET',url:'/api/accounts/2/cash-overview?year=2020&month=2'});assert.equal(result.statusCode,200,result.body);const currentYear=Number(new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}).slice(0,4));
  assert.deepEqual(result.json().data.currentYearTax,{year:currentYear,amount:'50'});assert.equal(cashWhere.accountId,2n);assert.equal(cashWhere.transactionType.not,'DIVIDEND');assert.equal(cashWhere.transactionDate.gte.toISOString(),`${currentYear-1}-12-31T15:00:00.000Z`);assert.ok(cashWhere.transactionDate.lte<=new Date());assert.equal(dividendWhere.accountId,2n);assert.deepEqual(dividendWhere.cashTransaction.transactionDate.gte,cashWhere.transactionDate.gte);
 }finally{await app.close();prisma.account.findUnique=original.account;prisma.cashTransaction.groupBy=original.group;prisma.cashTransaction.findMany=original.recent;prisma.cashTransaction.aggregate=original.cash;prisma.dividend.aggregate=original.dividend;}
});
