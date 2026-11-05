import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '@roxstock/shared/lib/prisma';
import {quoteMarkets} from '@roxstock/shared/domain/live-quotes';
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
        await settle(() => service.snapshot('TOTAL', ['005930']).active === 2);
        assert.equal(sockets.length, 1);
        assert.equal(commands.filter(c => c.header.tr_type === '1').length, 2);
        const f = Array(47).fill('0');
        Object.assign(f, { 0: '005930', 1: '090100', 2: '100', 3: '2', 4: '1', 5: '1', 7:'99',8:'102',9:'98',12: '1', 33: '20261030',45:'100' });
        await assert.rejects((service as any).command('TOTAL:005930','1'),/LOGICAL_MARKET_ONLY/);
        sockets[0]!.dispatchEvent(new MessageEvent('message',{data:'0|H0UNCNT0|001|'+f.join('^')}));
        assert.equal(service.snapshot('TOTAL',['005930']).quotes[0]!.quote,null,'legacy provider TOTAL frames are not consumed');
        sockets[0]!.dispatchEvent(new MessageEvent('message', { data: '0|H0STCNT0|001|' + f.join('^') }));
        assert.equal(service.snapshot('TOTAL', ['005930']).quotes[0]!.quote?.price, 100);
        const details=service.snapshot('TOTAL',['005930']).quotes[0]!.quote!;
        assert.deepEqual([details.open,details.high,details.low,details.viReferencePrice],[99,102,98,100]);
        assert.equal(service.snapshot('NXT', ['005930']).quotes[0]!.quote, null);
        const actual='KRX' as const;
        const ticks:any[]=[];const detach=service.onTrade(q=>ticks.push(q));
        const korean=new Date(Date.now()+9*3600000).toISOString(),fresh=[...f];fresh[1]=korean.slice(11,19).replaceAll(':','');fresh[33]=korean.slice(0,10).replaceAll('-','');fresh[2]='101';fresh[13]='100';
        sockets[0]!.dispatchEvent(new MessageEvent('message',{data:'0|'+quoteMarkets[actual]+'|001|'+fresh.join('^')}));
        const fallback=service.snapshot('TOTAL',['005930']).quotes[0]!.quote!;
        assert.equal(fallback.sourceMarket,actual);assert.equal(fallback.price,101);assert.equal(ticks.filter(q=>q.market==='TOTAL').length,1,'TOTAL alerts receive the selected fallback once');assert.equal(ticks.find(q=>q.market==='TOTAL')?.observedAt,fallback.observedAt);const duplicate=[...fresh];duplicate[13]='99';duplicate[2]='99';sockets[0]!.dispatchEvent(new MessageEvent('message',{data:'0|'+quoteMarkets[actual]+'|001|'+duplicate.join('^')}));assert.equal(ticks.length,2,'out-of-order physical sequence cannot replace latest or retrigger alerts');assert.equal(service.snapshot('TOTAL',['005930']).quotes[0]!.quote?.price,101);detach();
        a();
        assert.equal(service.snapshot('TOTAL', ['005930']).active, 2);
        const c = service.watch('KRX', ['005930']);
        b();
        await new Promise(r=>setTimeout(r,300));
        assert.equal(commands.filter(m=>m.header.tr_type==='1').length,2,'view changes reuse the pair');
        assert.ok(commands.every(m=>m.body.input.tr_id!=='H0UNCNT0'),'no provider TOTAL command');
        assert.equal(sockets.length, 1);
        (service as any).quotes.set('KRX:005930', {symbol:'005930',market:'KRX',price:100,change:1,rate:1,observedAt:new Date().toISOString(),receivedAt:Date.now(),source:'KIS'});
        sockets[0]!.close();
        await settle(() => sockets.length === 2 && service.state === 'CONNECTED');
        await settle(() => service.snapshot('KRX', ['005930']).active === 2);
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
