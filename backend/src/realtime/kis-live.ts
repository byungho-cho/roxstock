import { randomUUID } from 'node:crypto';
import { prisma } from '@roxstock/shared/lib/prisma';
import { persistentKisToken } from '@roxstock/shared/lib/kis-token-cache';
import { isMarketClosed } from '@roxstock/shared/domain/market-calendar';
import { parseKisTrades, quoteMarkets, quoteLimit, type QuoteMarket, type LiveQuote } from '@roxstock/shared/domain/live-quotes';
const origin = 'https://openapi.koreainvestment.com:9443', jobName = 'kis-live-quotes';
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
type Client = {
    market: QuoteMarket;
    symbols: string[];
};
export function marketOpen(market: QuoteMarket, now = new Date()) {
    const kst = new Date(now.getTime() + 9 * 3600000), date = kst.toISOString().slice(0, 10), seconds = kst.getUTCHours() * 3600 + kst.getUTCMinutes() * 60 + kst.getUTCSeconds();
    if (isMarketClosed(date))
        return false;
    const nxt = seconds >= 28800 && seconds < 31800 || seconds >= 32430 && seconds < 55200 || seconds >= 56400 && seconds < 72000;
    const krx = seconds >= 32400 && seconds < 55800 || seconds >= 57600 && seconds < 72000;
    return market === 'NXT' ? nxt : market === 'KRX' ? krx : nxt || krx;
}
/** One application-wide socket. Only display-list writes and a 20s ownership lease touch DB. */
export class KisLiveService {
    private clients = new Map<string, Client>();
    private quotes = new Map<string, LiveQuote>();
    private subscribed = new Set<string>();
    private rejected = new Set<string>();
    private socket?: WebSocket;
    private closingSocket?: WebSocket;
    private running = false;
    private stopped = false;
    private owner = randomUUID();
    private leaseUntil = 0;
    private renewed = 0;
    private nextAttempt = 0;
    private attempts = 0;
    private lastMessage = 0;
    private timer?: ReturnType<typeof setInterval>;
    private pending?: {
        key: string;
        action: string;
        resolve: () => void;
        reject: () => void;
    };
    private restAt = new Map<string, number>();
    private restQueued = new Set<string>();
    private restQueue: string[] = [];
    private restBusy = false;
    state = 'DISCONNECTED';
    constructor(private enabled = process.env.KIS_LIVE_ENABLED !== 'false') { }
    watch(market: QuoteMarket, symbols: string[]) { const id = randomUUID(); this.clients.set(id, { market, symbols }); if (!this.timer) {
        this.timer = setInterval(() => void this.cycle(), 1000);
        this.timer.unref();
    } void this.cycle(); return () => { this.clients.delete(id); void this.cycle(); }; }
    private desired() { return [...new Set([...this.clients.values()].flatMap(c => c.symbols.map(s => `${c.market}:${s}`)))]; }
    snapshot(market: QuoteMarket, symbols: string[]) { const desired = this.desired(), allowed = new Set(desired.filter(key => /^\w+:\d{6}$/.test(key)).slice(0, quoteLimit)); return { connection: this.state, limit: quoteLimit, active: this.subscribed.size, quotes: symbols.map(symbol => { const key = `${market}:${symbol}`, quote = this.quotes.get(key) ?? null; let status = !/^\d{6}$/.test(symbol) ? 'MARKET_UNSUPPORTED' : !allowed.has(key) ? 'LIMIT_EXCEEDED' : this.rejected.has(key) ? 'SUBSCRIPTION_REJECTED' : !marketOpen(market) ? 'MARKET_CLOSED' : quote?.halted ? 'TRADING_HALTED' : this.state !== 'CONNECTED' ? this.state : !this.subscribed.has(key) || quote?.source !== 'KIS' ? 'WAITING_TRADE' : Date.now() - quote.receivedAt > 30000 ? 'NO_RECENT_TRADE' : Date.now() - Date.parse(quote.observedAt) > 30000 ? 'QUOTE_DELAYED' : 'LIVE'; return { symbol, status, quote }; }) }; }
    private async lease() {
        const now = new Date();
        if (Date.now() - this.renewed < 20000 && this.leaseUntil > Date.now())
            return true;
        try {
            await prisma.collectorLock.create({ data: { jobName, ownerToken: this.owner, lockedUntil: new Date(0) } });
        }
        catch (e) {
            if ((e as {
                code?: string;
            }).code !== 'P2002')
                throw e;
        }
        const updated = await prisma.collectorLock.updateMany({ where: { jobName, OR: [{ ownerToken: this.owner }, { lockedUntil: { lte: now } }] }, data: { ownerToken: this.owner, lockedUntil: new Date(Date.now() + 90000) } });
        if (!updated.count)
            return false;
        this.renewed = Date.now();
        this.leaseUntil = Date.now() + 90000;
        return true;
    }
    private async request(path: string, init: RequestInit = {}) { const response = await fetch(origin + path, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) }); if (!response.ok)
        throw Error('KIS_HTTP'); return response.json() as Promise<any>; }
    private disconnect() { this.pending?.reject(); this.pending = undefined; const socket = this.socket; this.socket = undefined; this.subscribed.clear(); if (socket && socket.readyState < 3) {
        this.closingSocket = socket;
        if (socket.readyState < 2)
            socket.close(1000);
    } }
    private command(key: string, action: '1' | '2', approval?: string) { return new Promise<void>((resolve, reject) => { const [market, symbol] = key.split(':') as [
        QuoteMarket,
        string
    ], socket = this.socket; if (!socket || socket.readyState !== 1) {
        reject(Error('CLOSED'));
        return;
    } const timer = setTimeout(() => { this.pending = undefined; reject(Error('ACK_TIMEOUT')); }, 5000); this.pending = { key, action, resolve: () => { clearTimeout(timer); resolve(); }, reject: () => { clearTimeout(timer); reject(Error('SUBSCRIBE_FAILED')); } }; socket.send(JSON.stringify({ header: { approval_key: approval ?? this.approval, custtype: 'P', tr_type: action, 'content-type': 'utf-8' }, body: { input: { tr_id: quoteMarkets[market], tr_key: symbol } } })); }); }
    private approval = '';
    private async connect() {
        if (this.closingSocket && this.closingSocket.readyState !== 3) {
            this.state = 'RECONNECTING';
            return false;
        }
        this.closingSocket = undefined;
        const appkey = process.env.KIS_APP_KEY, secretkey = process.env.KIS_APP_SECRET;
        if (!appkey || !secretkey || typeof WebSocket !== 'function') {
            this.state = 'NOT_CONFIGURED';
            return false;
        }
        this.state = 'CONNECTING';
        const body = await this.request('/oauth2/Approval', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', appkey, secretkey }) });
        if (typeof body.approval_key !== 'string')
            throw Error('KIS_AUTH');
        this.approval = body.approval_key;
        if (this.stopped || !this.clients.size)
            return false;
        const socket = new WebSocket('ws://ops.koreainvestment.com:21000');
        this.socket = socket;
        socket.addEventListener('message', event => { if (this.socket !== socket)
            return; this.lastMessage = Date.now(); try {
            const text = String(event.data);
            if (text.startsWith('{')) {
                const message = JSON.parse(text);
                if (message.header?.tr_id === 'PINGPONG') {
                    socket.send(text);
                    return;
                }
                const p = this.pending;
                if (!p)
                    return;
                const [market, symbol] = p.key.split(':') as [
                    QuoteMarket,
                    string
                ];
                if (message.header?.tr_id !== quoteMarkets[market] || message.header?.tr_key !== symbol)
                    return;
                this.pending = undefined;
                if (message.body?.rt_cd !== '0') {
                    this.rejected.add(p.key);
                    p.resolve();
                    return;
                }
                if (p.action === '1')
                    this.subscribed.add(p.key);
                else
                    this.subscribed.delete(p.key);
                p.resolve();
                return;
            }
            for (const quote of parseKisTrades(text)) {
                const key = `${quote.market}:${quote.symbol}`, previous = this.quotes.get(key);
                if (this.subscribed.has(key) && (!previous || quote.observedAt >= previous.observedAt))
                    this.quotes.set(key, quote);
            }
        }
        catch { /* Malformed/private frames never replace a valid quote. */ } });
        socket.addEventListener('close', () => { if (this.socket === socket) {
            this.state = 'RECONNECTING';
            this.disconnect();
            this.nextAttempt = Date.now() + Math.min(60000, 2000 * 2 ** Math.min(this.attempts++, 5));
        } });
        await new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(Error('CONNECT_TIMEOUT')), 10000); socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true }); socket.addEventListener('error', () => { clearTimeout(timer); reject(Error('CONNECT_FAILED')); }, { once: true }); });
        this.lastMessage = Date.now();
        this.state = 'CONNECTED';
        this.attempts = 0;
        this.rejected.clear();
        return true;
    }
    private seed(key: string) { if (this.restQueued.has(key) || Date.now() - (this.restAt.get(key) ?? 0) < 30000)
        return; this.restQueued.add(key); this.restQueue.push(key); void this.seedQueue(); }
    private async seedQueue() { if (this.restBusy)
        return; this.restBusy = true; try {
        while (this.restQueue.length && !this.stopped) {
            const key = this.restQueue.shift()!;
            this.restQueued.delete(key);
            if (!this.desired().includes(key))
                continue;
            this.restAt.set(key, Date.now());
            const [market, symbol] = key.split(':') as [
                QuoteMarket,
                string
            ];
            try {
                const appKey = process.env.KIS_APP_KEY!, appSecret = process.env.KIS_APP_SECRET!;
                const access = await persistentKisToken({ appKey, appSecret, origin, issue: async () => { const b = await this.request('/oauth2/tokenP', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', appkey: appKey, appsecret: appSecret }) }); if (typeof b.access_token !== 'string')
                        throw Error('TOKEN'); return { token: b.access_token, expiresAt: Date.now() + Number(b.expires_in) * 1000 }; } });
                const b = await this.request(`/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=${{ TOTAL: 'UN', NXT: 'NX', KRX: 'J' }[market]}&FID_INPUT_ISCD=${symbol}`, { headers: { authorization: `Bearer ${access.token}`, appkey: appKey, appsecret: appSecret, tr_id: 'FHKST01010100', custtype: 'P' } });
                const o = b.output, p = Number(o?.stck_prpr);
                if (b.rt_cd === '0' && Number.isFinite(p) && p > 0 && Number.isFinite(Number(o.prdy_vrss)) && Number.isFinite(Number(o.prdy_ctrt))) {
                    const previous = this.quotes.get(key);
                    if (!previous || previous.source === 'CACHE' || Date.now() - previous.receivedAt > 30000)
                        this.quotes.set(key, { symbol, market, price: p, change: Number(o.prdy_vrss), rate: Number(o.prdy_ctrt), observedAt: new Date().toISOString(), receivedAt: Date.now(), source: 'CACHE', halted: o.temp_stop_yn === 'Y' });
                }
            }
            catch { /* Keep last good value; no raw provider bodies or credentials in logs. */ }
            await wait(250);
        }
    }
    finally {
        this.restBusy = false;
    } }
    private async cycle() {
        if (this.running || this.stopped)
            return;
        this.running = true;
        try {
            const desired = this.desired().filter(key => /^\w+:\d{6}$/.test(key)).slice(0, quoteLimit);
            if (!this.enabled) {
                this.state = 'DISABLED';
                return;
            }
            if (!desired.length) {
                if (this.socket?.readyState === 1)
                    for (const key of [...this.subscribed])
                        await this.command(key, '2');
                this.disconnect();
                this.approval = '';
                this.state = 'DISCONNECTED';
                if (this.leaseUntil && (!this.closingSocket || this.closingSocket.readyState === 3)) {
                    await prisma.collectorLock.deleteMany({ where: { jobName, ownerToken: this.owner } });
                    this.leaseUntil = 0;
                    this.renewed = 0;
                }
                return;
            }
            if (!await this.lease()) {
                this.disconnect();
                this.state = 'SESSION_IN_USE';
                return;
            }
            if (!this.socket) {
                if (Date.now() < this.nextAttempt)
                    return;
                if (!await this.connect())
                    return;
            }
            if (this.socket?.readyState !== 1)
                return;
            if (Date.now() - this.lastMessage > 90000)
                throw Error('CONNECTION_STALE');
            for (const key of [...this.subscribed])
                if (!desired.includes(key)) {
                    await this.command(key, '2');
                    await wait(150);
                }
            for (const key of desired)
                if (!this.subscribed.has(key) && !this.rejected.has(key)) {
                    await this.command(key, '1');
                    if (this.subscribed.has(key))
                        this.seed(key);
                    await wait(150);
                }
            // Bounded memory: values for unobserved instruments are not a tick history.
            const wanted = new Set(this.desired());
            for (const key of this.quotes.keys())
                if (!wanted.has(key)) {
                    this.quotes.delete(key);
                    this.restAt.delete(key);
                }
        }
        catch {
            this.disconnect();
            this.state = 'RECONNECTING';
            this.nextAttempt = Date.now() + Math.min(60000, 2000 * 2 ** Math.min(this.attempts++, 5));
        }
        finally {
            this.running = false;
        }
    }
    async close() { this.stopped = true; clearInterval(this.timer); if (this.socket?.readyState === 1 && !this.pending)
        for (const key of [...this.subscribed]) {
            try {
                await this.command(key, '2');
            }
            catch {
                break;
            }
        } this.disconnect(); this.approval = ''; if (this.closingSocket && this.closingSocket.readyState !== 3)
        await Promise.race([new Promise<void>(resolve => this.closingSocket!.addEventListener('close', () => resolve(), { once: true })), wait(3000)]); if (this.leaseUntil && (!this.closingSocket || this.closingSocket.readyState === 3))
        await prisma.collectorLock.deleteMany({ where: { jobName, ownerToken: this.owner } }); }
}
