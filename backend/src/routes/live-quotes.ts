import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@roxstock/shared/prisma';
import { ApiError } from '@roxstock/shared/lib/api-error';
import { displayListWithinLimit, quoteMarkets, type DisplayStock, type LiveQuote, type QuoteMarket } from '@roxstock/shared/domain/live-quotes';
import { prisma } from '../auth/scoped-db.js';
import { loadPortfolio } from './portfolio.js';
import { KisLiveService } from '../realtime/kis-live.js';
export function readDisplayList(settings: unknown): {
    ids: string[];
    version: string;
} { const saved = (settings as {
    liveQuotes?: {
        ids?: unknown;
        version?: unknown;
    };
} | null)?.liveQuotes; return { ids: Array.isArray(saved?.ids) ? saved.ids.filter((v): v is string => typeof v === 'string' && /^\d{1,20}$/.test(v)) : [], version: typeof saved?.version === 'string' ? saved.version : 'initial' }; }
export function checkedIds(value: unknown): string[] { if (!Array.isArray(value) || value.length > 5000 || value.some(id => typeof id !== 'string' || !/^\d{1,20}$/.test(id)) || new Set(value).size !== value.length)
    throw new ApiError(400, 'INVALID_LIST', '표시 종목 목록을 확인해 주세요.'); return value; }
type Query = {
    accountId?: string;
    q?: string;
    tab?: string;
    cursor?: string;
};
export async function liveQuoteRoutes(app: FastifyInstance) {
    const live = new KisLiveService(), streams = new Set<() => void>();
    app.addHook('preClose', async () => { for (const end of streams)
        end(); });
    app.addHook('onClose', () => live.close());
    async function context(userId: bigint, accountId?: string) {
        if (accountId && !/^\d{1,20}$/.test(accountId))
            throw new ApiError(400, 'INVALID_ACCOUNT', '계좌를 확인해 주세요.');
        const user = await prisma.authUser.findUniqueOrThrow({ where: { id: userId }, select: { settings: true } }), list = readDisplayList(user.settings);
        const portfolio = accountId ? await loadPortfolio(BigInt(accountId)) : null;
        const watch = await prisma.accountWatchlistItem.findMany({ where: accountId ? { accountId: BigInt(accountId) } : {}, select: { securityId: true } });
        const watched = new Set(watch.map(w => String(w.securityId))), traded = new Set(portfolio?.account.buyTrades.map(t => String(t.securityId)) ?? []), holdings = new Map(portfolio?.holdings.map(h => [String(h.securityId), h]) ?? []);
        return { list, watched, traded, holdings };
    }
    async function stocks(ids: string[] | null, ctx: Awaited<ReturnType<typeof context>>, query: Query = {}) {
        const q = query.q?.trim() ?? '';
        if (q.length > 100)
            throw new ApiError(400, 'INVALID_SEARCH', '검색어를 확인해 주세요.');
        if(query.cursor&&!/^\d{1,20}$/.test(query.cursor))throw new ApiError(400,'INVALID_CURSOR','검색 목록을 다시 조회해 주세요.');
        if(query.tab&&!['search','holding','watch','trade'].includes(query.tab))throw new ApiError(400,'INVALID_TAB','검색 구분을 확인해 주세요.');
        const paged=ids===null&&(!query.tab||query.tab==='search');
        const candidates = query.tab === 'holding' ? [...ctx.holdings.keys()] : query.tab === 'watch' ? [...ctx.watched] : query.tab === 'trade' ? [...ctx.traded] : null;
        const securities = await prisma.security.findMany({ where: { isActive: true, ...(ids ? { id: { in: ids.map(BigInt) } } : candidates ? { id: { in: candidates.map(BigInt) } } : {}), ...(q ? { OR: [{ name: { contains: q } }, { symbol: { contains: q } }] } : {}) }, select: { id: true, name: true, symbol: true, marketPrice: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], ...(paged?{take:101,...(query.cursor?{cursor:{id:BigInt(query.cursor)},skip:1}:{})}:{}) });
        return securities.map(s => { const id = String(s.id), h = ctx.holdings.get(id), p = s.marketPrice, price = p ? Number(p.currentPrice) : null, previous = p?.previousClosePrice ? Number(p.previousClosePrice) : null; const initial: LiveQuote | null = price !== null && previous ? { symbol: s.symbol, market: 'KRX', price, change: price - previous, rate: (price - previous) / previous * 100, observedAt: p!.priceUpdatedAt.toISOString(), receivedAt: p!.priceUpdatedAt.getTime(), source: 'CACHE' } : null; return { id, symbol: s.symbol, name: s.name, held: !!h, watched: ctx.watched.has(id), traded: ctx.traded.has(id), quantity: h ? Number(h.quantity) : 0, purchaseAmount: h ? Number(h.purchaseAmount) : 0, marketValue: h?.marketValue ? Number(h.marketValue) : null, profit: h?.unrealizedProfitLoss ? Number(h.unrealizedProfitLoss) : null, initial } satisfies DisplayStock; });
    }
    app.get<{
        Querystring: Query;
    }>('/live-quotes/list', async (req) => { const ctx = await context(req.auth!.userId, req.query.accountId); return { data: { ...ctx.list, stocks: await stocks(ctx.list.ids, ctx) } }; });
    app.get<{
        Querystring: Query;
    }>('/live-quotes/candidates', async (req) => { const ctx = await context(req.auth!.userId, req.query.accountId), found=await stocks(null,ctx,req.query), paged=!req.query.tab||req.query.tab==='search', hasMore=paged&&found.length>100, items=paged?found.slice(0,100):found; return {data:{...ctx.list,stocks:items,hasMore,nextCursor:hasMore?items.at(-1)!.id:null}}; });
    app.put<{
        Body: {
            ids?: unknown;
            version?: unknown;
        };
    }>('/live-quotes/list', async (req, reply) => {
        const ids = checkedIds(req.body?.ids);
        if (typeof req.body?.version !== 'string')
            throw new ApiError(400, 'INVALID_VERSION', '목록을 다시 조회해 주세요.');
        const securities = await prisma.security.count({ where: { id: { in: ids.map(BigInt) }, isActive: true } });
        if (securities !== ids.length)
            throw new ApiError(409, 'SECURITY_CHANGED', '제외되거나 변경된 종목이 있습니다. 목록을 다시 확인해 주세요.');
        const user = await prisma.authUser.findUniqueOrThrow({ where: { id: req.auth!.userId }, select: { settings: true, updatedAt: true } });
        const list = readDisplayList(user.settings);
        if (list.version !== req.body.version)
            return reply.code(409).send({ error: { code: 'LIST_CONFLICT', message: '다른 화면에서 목록이 변경됐습니다. 편집을 유지한 채 최신 목록을 확인해 주세요.' } });
        if(!displayListWithinLimit(ids,list.ids))throw new ApiError(400,'DISPLAY_LIMIT','표시 종목은 최대 50개까지 추가할 수 있습니다.');
        const next = { ids, version: randomUUID() }, settings = { ...(user.settings as Record<string, Prisma.InputJsonValue> ?? {}), liveQuotes: next };
        const result = await prisma.authUser.updateMany({ where: { id: req.auth!.userId, updatedAt: user.updatedAt, settings: { equals: user.settings ?? Prisma.DbNull } }, data: { settings } });
        if (!result.count)
            throw new ApiError(409, 'LIST_CONFLICT', '다른 화면의 변경을 확인한 뒤 다시 저장해 주세요.');
        return { data: next };
    });
    app.get<{
        Querystring: {
            market?: string;
            symbols?: string;
        };
    }>('/live-quotes/stream', async (req, reply) => {
        const market = req.query.market as QuoteMarket;
        if (!Object.hasOwn(quoteMarkets, market))
            throw new ApiError(400, 'INVALID_MARKET', '시장을 확인해 주세요.');
        let symbols = [...new Set((req.query.symbols ?? '').split(',').filter(Boolean))];
        if (symbols.length > 5000 || symbols.some(s => !/^[0-9A-Z]{6}$/.test(s)))
            throw new ApiError(400, 'INVALID_SYMBOL', '종목코드를 확인해 주세요.');
        const user = await prisma.authUser.findUniqueOrThrow({ where: { id: req.auth!.userId }, select: { settings: true } }), ids = readDisplayList(user.settings).ids;
        const allowed = await prisma.security.findMany({ where: { id: { in: ids.map(BigInt) }, isActive: true, ...(req.query.symbols ? { symbol: { in: symbols } } : {}) }, select: { symbol: true } });
        if (!req.query.symbols)
            symbols = allowed.map(s => s.symbol);
        if (allowed.length !== symbols.length)
            throw new ApiError(403, 'DISPLAY_LIST_REQUIRED', '등록한 표시 종목만 구독할 수 있습니다.');
        const unwatch = live.watch(market, symbols);
        reply.hijack();
        reply.raw.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'private, no-store, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        reply.raw.write('retry: 3000\n\n');
        let closed = false, last = '', checking = false;
        const end = () => { if (closed)
            return; closed = true; streams.delete(end); clearInterval(ticker); clearInterval(auth); unwatch(); reply.raw.end(); };
        const send = () => { if (closed)
            return; if (reply.raw.writableLength > 256000) {
            end();
            return;
        } const payload = JSON.stringify(live.snapshot(market, symbols)); if (payload !== last) {
            last = payload;
            reply.raw.write(`event: quotes\ndata: ${payload}\n\n`);
        }
        else
            reply.raw.write(': heartbeat\n\n'); };
        const ticker = setInterval(send, 1000);
        send();
        const auth = setInterval(() => { if (checking)
            return; checking = true; void prisma.authSession.findFirst({ where: { id: req.auth!.sessionId, userId: req.auth!.userId, revokedAt: null, expiresAt: { gt: new Date() }, user: { verifiedAt: { not: null } } }, select: { id: true } }).then(row => { if (!row)
            end(); }).catch(end).finally(() => { checking = false; }); }, 15000);
        streams.add(end);
        reply.raw.once('close', end);
    });
}
