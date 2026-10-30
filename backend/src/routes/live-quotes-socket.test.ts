import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@roxstock/shared/lib/prisma';
import { KisLiveService } from '../realtime/kis-live.js';
test('one socket shares duplicate clients, swaps market subscriptions, retains latest and reconnects safely', async (t) => {
    const restore: Array<() => void> = [];
    const patch = (o: any, k: string, v: any) => { const old = o[k]; o[k] = v; restore.push(() => { o[k] = old; }); };
    let sockets: FakeSocket[] = [];
    let commands: any[] = [];
    class FakeSocket extends EventTarget {
        readyState = 0;
        constructor(_url: string) { super(); sockets.push(this); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
        send(text: string) { const m = JSON.parse(text); commands.push(m); queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ header: m.body.input, body: { rt_cd: '0' } }) }))); }
        close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
    }
    patch(globalThis, 'WebSocket', FakeSocket);
    patch(globalThis, 'fetch', async () => new Response(JSON.stringify({ approval_key: 'fixture-only-approval' })));
    patch(prisma.collectorLock, 'create', async () => ({}));
    patch(prisma.collectorLock, 'updateMany', async () => ({ count: 1 }));
    patch(prisma.collectorLock, 'deleteMany', async () => ({ count: 1 }));
    const oldKey = process.env.KIS_APP_KEY, oldSecret = process.env.KIS_APP_SECRET;
    process.env.KIS_APP_KEY = 'fixture-key';
    process.env.KIS_APP_SECRET = 'fixture-secret';
    restore.push(() => { if (oldKey === undefined)
        delete process.env.KIS_APP_KEY;
    else
        process.env.KIS_APP_KEY = oldKey; if (oldSecret === undefined)
        delete process.env.KIS_APP_SECRET;
    else
        process.env.KIS_APP_SECRET = oldSecret; });
    const service = new KisLiveService(true);
    (service as any).seed = () => { };
    const settle = async (predicate: () => boolean) => { const until = Date.now() + 8000; while (!predicate()) {
        if (Date.now() > until)
            throw Error('test timeout');
        await new Promise(r => setTimeout(r, 30));
    } };
    try {
        const a = service.watch('TOTAL', ['005930']), b = service.watch('TOTAL', ['005930']);
        await settle(() => service.snapshot('TOTAL', ['005930']).active === 1);
        assert.equal(sockets.length, 1);
        assert.equal(commands.filter(c => c.header.tr_type === '1').length, 1);
        const f = Array(47).fill('0');
        Object.assign(f, { 0: '005930', 1: '090100', 2: '100', 3: '2', 4: '1', 5: '1', 12: '1', 33: '20261030' });
        sockets[0]!.dispatchEvent(new MessageEvent('message', { data: '0|H0UNCNT0|001|' + f.join('^') }));
        assert.equal(service.snapshot('TOTAL', ['005930']).quotes[0]!.quote?.price, 100);
        assert.equal(service.snapshot('NXT', ['005930']).quotes[0]!.quote, null);
        a();
        assert.equal(service.snapshot('TOTAL', ['005930']).active, 1);
        const c = service.watch('KRX', ['005930']);
        b();
        await settle(() => commands.some(m => m.body.input.tr_id === 'H0STCNT0' && m.header.tr_type === '1'));
        assert.ok(commands.some(m => m.body.input.tr_id === 'H0UNCNT0' && m.header.tr_type === '2'));
        assert.equal(sockets.length, 1);
        (service as any).quotes.set('KRX:005930', {symbol:'005930',market:'KRX',price:100,change:1,rate:1,observedAt:new Date().toISOString(),receivedAt:Date.now(),source:'KIS'});
        sockets[0]!.close();
        await settle(() => sockets.length === 2 && service.state === 'CONNECTED');
        await settle(() => service.snapshot('KRX', ['005930']).active === 1);
        assert.ok(commands.filter(m => m.body.input.tr_id === 'H0STCNT0' && m.header.tr_type === '1').length >= 2);
        assert.equal(service.snapshot('KRX', ['005930']).quotes[0]!.quote?.price, 100);
        assert.notEqual(service.snapshot('KRX', ['005930']).quotes[0]!.status, 'LIVE', 'reconnection ACK alone cannot make the previous session quote live');
        c();
    }
    finally {
        await service.close();
        for (const fn of restore.reverse())
            fn();
    }
    assert.ok(sockets.every(s => s.readyState === 3));
});
