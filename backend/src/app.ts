import {notificationRoutes} from './notifications/routes.js';
import {adminUserRoutes} from './routes/admin-users.js';
import {stockNewsRoutes} from './routes/stock-news.js';
import {installAuth} from './auth/guard.js';
import {authRoutes} from './auth/routes.js';
import {collectionBugReportRoutes} from './routes/collection-bug-reports.js';
import {readFile} from 'node:fs/promises';
import release from './release.json' with { type: 'json' };
import {investorTrendRoutes} from './routes/investor-trends.js';
import {backupRoutes} from './routes/backups.js';
import {ValueReadModel} from '@roxstock/shared/read-model/value-cache';
import { installPageBootstrap } from './routes/page-bootstrap.js';
import { installReadBatch } from './routes/read-batch.js';
import {securityManagementRoutes} from './routes/security-management.js';
import {investmentProfitRoutes} from './routes/investment-profit.js';
import {recentBuysRoutes} from './routes/recent-buys.js';
import { annualConsensusRoutes } from './routes/annual-consensus.js';
import { compoundGrowthRoutes } from './routes/compound-growth.js';
import { financialStatementRoutes } from './routes/financial-statements.js';
import Fastify, {type FastifyRequest} from 'fastify';
import { valueAnalysisRoutes } from './routes/value-analysis.js';
import { financialRefreshActiveRoutes } from './routes/financial-refresh-active.js';
import { financialRefreshRoutes } from './routes/financial-refresh.js';

import { ApiError } from '@roxstock/shared/lib/api-error';
import { prisma } from './auth/scoped-db.js';
import { targetArrivalRoutes } from './routes/target-arrivals.js';
import { accountRoutes } from './routes/accounts.js';
import { securityRoutes } from './routes/securities.js';
import { tradeRoutes } from './routes/trades.js';
import { internalPriceRoutes, priceRoutes } from './routes/prices.js';
import { portfolioRoutes } from './routes/portfolio.js';
import { cashRoutes } from './routes/cash.js';
import { cashMutationRoutes } from './routes/cash-mutations.js';
import { collectionStatusRoutes } from './routes/collection-status.js';

export function buildApplication(boundary:(app:ReturnType<typeof Fastify>)=>void) {
  const app = Fastify({ logger: {redact:['req.headers.cookie','req.headers.authorization','req.headers.x-csrf-token','res.headers.set-cookie']} });
  boundary(app);
  void app.register(authRoutes,{prefix:'/api/auth'});
  app.decorate('valueReadModel',new ValueReadModel(prisma));
  app.addHook('onClose',async()=>app.valueReadModel.clear());
  installPageBootstrap(app);
  installReadBatch(app);
  void app.register(backupRoutes);
  const started=new WeakMap<FastifyRequest,bigint>();
  app.addHook('onRequest',async request=>{started.set(request,process.hrtime.bigint());});
  app.addHook('onSend',async(request,reply,payload)=>{
    const start=started.get(request);
    if(start!==undefined)reply.header('Server-Timing',`app;dur=${(Number(process.hrtime.bigint()-start)/1e6).toFixed(2)}`);
    return payload;
  });

  app.get('/api/version', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    let current = release;
    if (process.env.ROXSTOCK_RELEASE_FILE) {
      try {
        const metadata = JSON.parse(await readFile(process.env.ROXSTOCK_RELEASE_FILE, 'utf8'));
        if (/^1\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(metadata.version)) current = {version: metadata.version};
      } catch { /* Local development and pre-split deployments use the bundled version. */ }
    }
    return { data: current };
  });

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/health/db', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch (error) {
      app.log.error(error, 'Database health check failed');
      return reply.code(503).send({ status: 'error', database: 'disconnected' });
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } });
    }
    if(typeof error==='object'&&error&&'code' in error&&error.code==='P2002'&&'meta' in error&&(error.meta as {modelName?:string}|undefined)?.modelName==='Security')return reply.code(409).send({error:{code:'DUPLICATE_SECURITY_CODE',message:'이미 등록된 종목코드입니다.'}});
    app.log.error({code:'UNEXPECTED_REQUEST_FAILURE'});
    return reply.code(500).send({
      error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred.' },
    });
  });

  void app.register(compoundGrowthRoutes, { prefix: '/api' });
  void app.register(financialStatementRoutes, { prefix: '/api' });
  void app.register(valueAnalysisRoutes, { prefix: '/api' });
  void app.register(annualConsensusRoutes, { prefix: '/api' });
  void app.register(financialRefreshRoutes, { prefix: '/api' });
  void app.register(financialRefreshActiveRoutes, { prefix: '/api' });
  void app.register(notificationRoutes,{prefix:'/api'});
  void app.register(adminUserRoutes,{prefix:'/api'});
  void app.register(targetArrivalRoutes, { prefix: '/api' });
  void app.register(stockNewsRoutes,{prefix:'/api'});
  void app.register(investorTrendRoutes, {prefix:'/api'});
  void app.register(investmentProfitRoutes, {prefix:'/api'});
  void app.register(recentBuysRoutes, {prefix:'/api'});
  void app.register(accountRoutes, { prefix: '/api' });
  void app.register(securityManagementRoutes, {prefix:'/api'});
  void app.register(securityRoutes, { prefix: '/api' });
  void app.register(tradeRoutes, { prefix: '/api' });
  void app.register(priceRoutes, { prefix: '/api' });
  void app.register(portfolioRoutes, { prefix: '/api' });
  void app.register(cashRoutes, { prefix: '/api' });
  void app.register(cashMutationRoutes, { prefix: '/api' });
  void app.register(collectionStatusRoutes, { prefix: '/api' });
  void app.register(collectionBugReportRoutes, { prefix: '/api' });
  void app.register(internalPriceRoutes);

  return app;
}
export const buildApp=()=>buildApplication(installAuth);

declare module 'fastify' {interface FastifyInstance {valueReadModel:ValueReadModel;}}
