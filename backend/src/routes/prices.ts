import {exclusionReason} from '@roxstock/shared/collection/collection-policy';
import { normalizeProviderSymbol, isSecuritySymbol } from '@roxstock/shared/domain/security-symbol';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@roxstock/shared/lib/prisma';
import { realtimePriceCache, type RealtimePriceDto } from '../realtime/price-cache.js';

interface PriceQuery {
  symbols?: string;
}

interface InternalPriceBody {
  prices?: unknown[];
}

const parseSymbols = (value: string | undefined): Set<string> | undefined => {
  if (!value) return undefined;
  const symbols = value.split(',').map((symbol) => normalizeProviderSymbol(symbol)).filter(Boolean);
  if (symbols.length > 100 || symbols.some((symbol) => !isSecuritySymbol(symbol))) {
    throw new Error('symbols must contain at most 100 comma-separated six-character alphanumeric codes');
  }
  return new Set(symbols);
};

const tokenMatches = (authorization: string | undefined, expected: string): boolean => {
  const actual = authorization?.replace(/^Bearer\s+/i, '') ?? '';
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
};

const databasePrices = async (symbols?: Set<string>): Promise<RealtimePriceDto[]> => {
  const securities = await prisma.security.findMany({
    where: {
      isActive: true,
      ...(symbols ? { symbol: { in: [...symbols] } } : { OR: [{ accountWatchlistItems: { some: { account: { isActive: true } } } }, { buyTrades: { some: { account: { isActive: true } } } }] }),
    },
    select: { id: true, symbol: true, name: true, marketPrice: true },
    take: 100,
    orderBy: { symbol: 'asc' },
  });
  return securities.flatMap((security) => security.marketPrice ? [{
    securityId: security.id.toString(),
    symbol: security.symbol,
    name: security.name,
    currentPrice: security.marketPrice.currentPrice.toString(),
    previousClosePrice: security.marketPrice.previousClosePrice?.toString() ?? null,
    observedAt: security.marketPrice.priceUpdatedAt.toISOString(),
    marketStatus: 'STORED',
  }] : []);
};

async function currentCachedPrices(prices:RealtimePriceDto[]){
 if(!prices.length)return prices;
 const securities=await prisma.security.findMany({where:{id:{in:prices.map(p=>BigInt(p.securityId))}},select:{id:true,symbol:true,isActive:true,collectionRevision:true,collectionExcluded:true,excludedFeatures:true}});
 const current=new Map(securities.map(s=>[String(s.id),s]));
 return prices.filter(p=>{const s=current.get(p.securityId);return s?.isActive&&s.symbol===p.symbol&&s.collectionRevision===p.collectionRevision&&!exclusionReason(s,'realtime-prices');});
}
const latestPrices = async (symbols?: Set<string>): Promise<RealtimePriceDto[]> => {
  const merged = new Map((await databasePrices(symbols)).map((price) => [price.symbol, price]));
  for (const price of await currentCachedPrices(realtimePriceCache.get(symbols))) {
    const stored = merged.get(price.symbol);
    if (!stored || Date.parse(price.observedAt) >= Date.parse(stored.observedAt)) merged.set(price.symbol, price);
  }
  return [...merged.values()].sort((left, right) => left.symbol.localeCompare(right.symbol));
};

export async function priceRoutes(app: FastifyInstance) {
  app.get<{ Querystring: PriceQuery }>('/prices/latest', async (request, reply) => {
    try {
      const symbols = parseSymbols(request.query.symbols);
      return { data: await latestPrices(symbols), meta: { realtime: true } };
    } catch (error) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: (error as Error).message } });
    }
  });

  app.get<{ Querystring: PriceQuery }>('/prices/stream', async (request, reply) => {
    let symbols: Set<string> | undefined;
    try {
      symbols = parseSymbols(request.query.symbols);
    } catch (error) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: (error as Error).message } });
    }

    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    reply.raw.write('retry: 5000\n\n');
    const initial = await latestPrices(symbols);
    reply.raw.write(`event: snapshot\ndata: ${JSON.stringify({ prices: initial })}\n\n`);

    const unsubscribe = realtimePriceCache.subscribe((prices) => {
      void currentCachedPrices(symbols?prices.filter(p=>symbols.has(p.symbol)):prices).then(selected=>{
        if(selected.length&&!reply.raw.destroyed)reply.raw.write(`event: prices\ndata: ${JSON.stringify({prices:selected})}\n\n`);
      }).catch(()=>{});
    });
    const heartbeat = setInterval(() => {
      if (!reply.raw.destroyed) reply.raw.write(': heartbeat\n\n');
    }, 15_000);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}

export async function internalPriceRoutes(app: FastifyInstance) {
  app.post<{ Body: InternalPriceBody }>('/internal/realtime-prices', async (request, reply) => {
    const expected = (process.env.COLLECTOR_INTERNAL_TOKEN ?? '').trim();
    if (!tokenMatches(request.headers.authorization, expected)) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid collector token.' } });
    }
    if (!Array.isArray(request.body?.prices) || request.body.prices.length > 100) {
      return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'prices must be an array of at most 100 items.' } });
    }
    let count=0;
    for(const raw of request.body.prices){
      if(!raw||typeof raw!=='object')continue;
      const value=raw as {securityId?:string;symbol?:string;collectionRevision?:number};
      if(!value.securityId||!/^\d+$/.test(value.securityId)||!Number.isInteger(value.collectionRevision))continue;
      await prisma.$transaction(async tx=>{
        const securityId=BigInt(value.securityId!);
        await tx.$queryRaw`SELECT id FROM securities WHERE id=${securityId} FOR UPDATE`;
        const current=await tx.security.findUnique({where:{id:securityId}});
        if(!current||!current.isActive||current.symbol!==value.symbol||current.collectionRevision!==value.collectionRevision||exclusionReason(current,'realtime-prices'))return;
        count+=realtimePriceCache.ingest([raw]).length;
      });
    }
    return {data:{accepted:count}};
  });
}

