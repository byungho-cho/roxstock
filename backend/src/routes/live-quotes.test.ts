import test from 'node:test';
import assert from 'node:assert/strict';
import { checkedIds, readDisplayList } from './live-quotes.js';
import { KisLiveService, marketOpen } from '../realtime/kis-live.js';
test('display lists are opt-in and minimal; invalid/duplicate IDs cannot be written', () => { assert.deepEqual(readDisplayList(null), { ids: [], version: 'initial' }); assert.deepEqual(readDisplayList({ theme: 'light', liveQuotes: { ids: ['1', '2'], version: 'abc' } }), { ids: ['1', '2'], version: 'abc' }); for (const ids of [null, {}, ['1', '1'], ['1x'], [1], Array(5001).fill('1')])
    assert.throws(() => checkedIds(ids)); assert.deepEqual(checkedIds(['2', '1']), ['2', '1']); });
test('shared subscription budget deduplicates identical market/symbol across clients', async () => { const service = new KisLiveService(false); const stop = service.watch('TOTAL', Array.from({ length: 42 }, (_, i) => String(i + 1).padStart(6, '0'))); const stop2 = service.watch('TOTAL', ['000001']); const snapshot = service.snapshot('TOTAL', ['000001', '000041', '000042']); assert.equal(snapshot.quotes[2]!.status, 'LIMIT_EXCEEDED'); assert.notEqual(snapshot.quotes[1]!.status, 'LIMIT_EXCEEDED'); assert.equal(snapshot.limit, 41); stop(); stop2(); await service.close(); });
test('weekends and market intermissions cannot be presented as live', () => { assert.equal(marketOpen('TOTAL', new Date('2026-10-31T03:00:00Z')), false); assert.equal(marketOpen('NXT', new Date('2026-10-30T00:00:00Z')), false); assert.equal(marketOpen('NXT', new Date('2026-10-30T00:00:31Z')), true); assert.equal(marketOpen('KRX', new Date('2026-10-30T03:00:00Z')), true); assert.equal(marketOpen('TOTAL', new Date('2026-10-30T12:00:00Z')), false); });
import Fastify from 'fastify';
import { prisma as raw } from '@roxstock/shared/lib/prisma';
import { authContext } from '../auth/context.js';
import { liveQuoteRoutes } from './live-quotes.js';
test('API identity isolation and optimistic list writes preserve settings and reject concurrent stale saves', async (t) => {
    const patch = (object: any, name: string, fn: any) => { const original = object[name]; object[name] = fn; t.after(() => { object[name] = original; }); };
    const users = new Map(['1', '2'].map(id => [id, { id: BigInt(id), updatedAt: new Date(1), settings: { theme: 'dark', liveQuotes: { ids: [id], version: 'v1' } } }]));
    patch(raw.authUser, 'findUniqueOrThrow', async ({ where }: any) => structuredClone(users.get(String(where.id))));
    patch(raw.authUser, 'updateMany', async ({ where, data }: any) => { const row = users.get(String(where.id))!; if (JSON.stringify(row.settings) !== JSON.stringify(where.settings.equals))
        return { count: 0 }; row.settings = data.settings; return { count: 1 }; });
    patch(raw.accountWatchlistItem, 'findMany', async ({ where }: any) => { assert.ok(where.AND.some((w: any) => w.account?.userId)); return []; });
    patch(raw.security,'findMany',async({where,cursor,take}:any)=>{const rows=where.id?.in?where.id.in.map((id:bigint)=>({id,symbol:String(id).padStart(6,'0'),name:'test',marketPrice:null})):Array.from({length:205},(_,i)=>({id:BigInt(i+1),symbol:String(i+1).padStart(6,'0'),name:'candidate'+String(i+1).padStart(3,'0'),marketPrice:null}));if(!where.id?.in)assert.equal(take,101);const offset=cursor?rows.findIndex((r:any)=>r.id===cursor.id)+1:0;return rows.slice(offset,take?offset+take:undefined);});
    patch(raw.security, 'count', async ({ where }: any) => where.id.in.length);
    const app = Fastify();
    app.decorateRequest('auth', null);
    app.addHook('onRequest', (req, reply, done) => { const id = req.headers['x-test-user']; if (!id) {
        reply.code(401).send({ error: 'LOGIN_REQUIRED' });
        return;
    } const identity = { userId: BigInt(String(id)), role: 'USER', sessionId: 'fixture', mustChangePassword: false }; req.auth = identity; authContext.run(identity, done); });
    await app.register(liveQuoteRoutes, { prefix: '/api' });
    try {
        assert.equal((await app.inject('/api/live-quotes/list')).statusCode, 401);
        for (const id of ['1', '2']) {
            const r = await app.inject({ url: '/api/live-quotes/list', headers: { 'x-test-user': id } });
            assert.deepEqual(r.json().data.ids, [id]);
        }
        const overflow=await app.inject({url:'/api/live-quotes/list',method:'PUT',headers:{'x-test-user':'1'},payload:{ids:Array.from({length:51},(_,i)=>String(i+1)),version:'v1'}});
        assert.equal(overflow.statusCode,400);assert.equal(overflow.json().code,'DISPLAY_LIMIT');assert.deepEqual(users.get('1')!.settings.liveQuotes.ids,['1']);
        const found:string[]=[];let cursor:string|null=null;for(const length of [100,100,5]){const response:{statusCode:number;json():any}=await app.inject({url:'/api/live-quotes/candidates?tab=search'+(cursor?'&cursor='+cursor:''),headers:{'x-test-user':'1'}});assert.equal(response.statusCode,200);const data=response.json().data;assert.equal(data.stocks.length,length);assert.equal(data.hasMore,length===100);found.push(...data.stocks.map((r:any)=>r.id));cursor=data.nextCursor;}assert.equal(new Set(found).size,205);assert.equal(cursor,null);assert.equal((await app.inject({url:'/api/live-quotes/candidates?tab=search&cursor=invalid',headers:{'x-test-user':'1'}})).statusCode,400);
        const save = () => app.inject({ url: '/api/live-quotes/list', method: 'PUT', headers: { 'x-test-user': '1' }, payload: { ids: ['2', '1'], version: 'v1', userId: '2' } });
        const replies = await Promise.all([save(), save()]);
        assert.deepEqual(replies.map(r => r.statusCode).sort(), [200, 409]);
        assert.equal(users.get('1')!.settings.theme, 'dark');
        assert.deepEqual(users.get('2')!.settings.liveQuotes.ids, ['2']);
        const boundary=await app.inject({url:'/api/live-quotes/list',method:'PUT',headers:{'x-test-user':'2'},payload:{ids:Array.from({length:50},(_,i)=>String(i+1)),version:'v1'}});
        assert.equal(boundary.statusCode,200);assert.equal(boundary.json().data.ids.length,50);assert.deepEqual(users.get('1')!.settings.liveQuotes.ids,['2','1']);
    }
    finally {
        await app.close();
        t.mock.restoreAll();
    }
});

test('closed market snapshot retains the last same-market price tuple and receipt time',async()=>{const service=new KisLiveService(false),stop=service.watch('TOTAL',['005930']);const quote={symbol:'005930',market:'TOTAL',price:39150,change:-850,rate:-2.125,observedAt:'2026-10-30T11:00:00.000Z',receivedAt:Date.parse('2026-10-30T11:00:03.000Z'),source:'KIS'};(service as any).quotes.set('TOTAL:005930',quote);const packet=service.snapshot('TOTAL',['005930'],new Date('2026-10-30T12:00:00Z'));assert.equal(packet.marketOpen,false);assert.equal(packet.quotes[0]!.status,'MARKET_CLOSED');assert.deepEqual(packet.quotes[0]!.quote,quote);assert.equal(service.snapshot('NXT',['005930'],new Date('2026-10-30T12:00:00Z')).quotes[0]!.quote,null);stop();await service.close();});

import {loadSecurities} from './securities.js';
test('a display-only stock can be looked up by exact security ID without classifying or writing it',async(t)=>{
 const patch=(object:any,name:string,fn:any)=>{const original=object[name];object[name]=fn;t.after(()=>{object[name]=original;});};let lookups=0;
 patch(raw.security,'findMany',async({where}:any)=>{if(where.codeRevision)return [];lookups++;assert.equal(where.id,4n);return [{id:4n,symbol:'000004',name:'display only',marketType:'KOSPI',securityType:'COMMON',isActive:true,marketPrice:null,accountWatchlistItems:[]}];});
 patch(raw.valuationMetric,'findMany',async()=>[]);patch(raw.financialStatement,'findMany',async()=>[]);
 for(const model of [raw.security,raw.accountWatchlistItem,raw.buyTrade])for(const method of ['create','update','updateMany','delete'])patch(model,method,()=>{throw Error('READ_MUST_NOT_WRITE');});
 const result=await loadSecurities({securityId:'4'});assert.equal(result.data.length,1);assert.equal(result.data[0]!.id,'4');assert.equal(result.data[0]!.listType,null);assert.equal(result.data[0]!.hasTradeHistory,false);assert.equal(result.data[0]!.watchlistItemId,null);
 await assert.rejects(()=>loadSecurities({securityId:'invalid'}));assert.equal(lookups,1);
});

test('watch candidates and registered watch flags follow account classifications with trades overriding manual watch entries',async(t)=>{
 const {Prisma}=await import('@roxstock/shared/prisma');const patch=(object:any,name:string,fn:any)=>{const original=object[name];object[name]=fn;t.after(()=>{object[name]=original;});};
 const saved={ids:['1','2','3','4','5'],version:'v1'};patch(raw.authUser,'findUniqueOrThrow',async()=>({settings:{liveQuotes:saved}}));
 const manual=[{securityId:1n,listType:'WATCHLIST'},{securityId:2n,listType:'WATCHLIST'},{securityId:3n,listType:'HOLDING'},{securityId:4n,listType:'WATCHLIST'},{securityId:5n,listType:'RECOMMENDED'}];
 patch(raw.accountWatchlistItem,'findMany',async({where}:any)=>{assert.equal(where.accountId,7n);assert.ok(where.AND.some((w:any)=>w.account?.userId));assert.deepEqual(where.listType.in,['WATCHLIST','RECOMMENDED']);return manual.filter(row=>where.listType.in.includes(row.listType));});
 patch(raw.account,'findUnique',async({where}:any)=>{assert.equal(where.id,7n);assert.ok(where.AND.length);return {id:7n,isActive:true,cashTransactions:[],buyTrades:[2n,4n].map(securityId=>({id:securityId,securityId,boughtAt:new Date(),quantity:new Prisma.Decimal(10),unitPrice:new Prisma.Decimal(100),sellTrades:securityId===2n?[{quantity:new Prisma.Decimal(10),unitPrice:new Prisma.Decimal(110),soldAt:new Date()}]:[],security:{id:securityId,symbol:String(securityId).padStart(6,'0'),name:'fixture',marketType:'KOSPI',marketPrice:null}}))};});
 patch(raw.security,'findMany',async({where}:any)=>where.id.in.map((id:bigint)=>({id,symbol:String(id).padStart(6,'0'),name:'fixture',marketPrice:null})));
 const app=Fastify();app.decorateRequest('auth',null);app.addHook('onRequest',(req,_reply,done)=>{const identity={userId:1n,role:'USER' as const,sessionId:'fixture',mustChangePassword:false};req.auth=identity;authContext.run(identity,done);});await app.register(liveQuoteRoutes,{prefix:'/api'});try{
 const candidates=await app.inject('/api/live-quotes/candidates?tab=watch&accountId=7');assert.equal(candidates.statusCode,200);assert.deepEqual(candidates.json().data.stocks.map((s:any)=>s.id),['1','5']);
 const all=await app.inject('/api/live-quotes/list?accountId=7');assert.equal(all.statusCode,200);assert.deepEqual(all.json().data.stocks.filter((s:any)=>s.watched).map((s:any)=>s.id),['1','5']);assert.equal(all.json().data.stocks.find((s:any)=>s.id==='2').traded,true);assert.equal(all.json().data.stocks.find((s:any)=>s.id==='4').held,true);
 const noAccount=await app.inject('/api/live-quotes/candidates?tab=watch');assert.equal(noAccount.statusCode,200);assert.deepEqual(noAccount.json().data.stocks,[]);
 }finally{await app.close();}
});
