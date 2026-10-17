import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import {prisma} from '@roxstock/shared/lib/prisma';
import {financialRefreshRoutes} from './financial-refresh.js';
test('material times use saved filing and explicit supplement evidence, never run completion',async()=>{
 const old={securities:prisma.security.findMany,filing:prisma.dartFinancialFiling.findFirst,metrics:prisma.periodValuation.findMany};let recorded=false;
 prisma.security.findMany=(async()=>[]) as typeof old.securities;
 prisma.dartFinancialFiling.findFirst=(async()=>recorded?{collectedAt:new Date('2026-10-01T00:00:00Z')}:null) as typeof old.filing;
 prisma.periodValuation.findMany=(async(q:any)=>{assert.equal(q.where.supplemental.path,'$.verifiedAt');return recorded?[{supplemental:{verifiedAt:'2026-10-17T09:00:00Z'},updatedAt:new Date('2026-10-17T10:00:00Z')}]:[{supplemental:{},updatedAt:new Date()}];}) as typeof old.metrics;
 const app=Fastify();await app.register(financialRefreshRoutes,{prefix:'/api'});
 try{const response=await app.inject('/api/securities/1/financial-refresh/material-times');assert.equal(response.statusCode,200,response.body);assert.deepEqual(response.json().data,{financialCollectedAt:null,supplementUpdatedAt:null});recorded=true;assert.deepEqual((await app.inject('/api/securities/1/financial-refresh/material-times')).json().data,{financialCollectedAt:'2026-10-01T00:00:00.000Z',supplementUpdatedAt:'2026-10-17T09:00:00Z'});}finally{await app.close();prisma.security.findMany=old.securities;prisma.dartFinancialFiling.findFirst=old.filing;prisma.periodValuation.findMany=old.metrics;}
});
