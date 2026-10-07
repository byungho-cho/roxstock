import test from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';
import { storedQueryOptions } from '../../src/data/storedQueryOptions.ts';
import { invalidatePortfolio } from '../../src/data/invalidatePortfolio.ts';
import { detailSwipeDirection } from '../../src/utils/detailSwipe.ts';
import { amount, rate, sortProfit, calculateProfit, loadProfit } from '../../src/pages/investment-profit/profitData.ts';
import type { TradeDto } from '../../src/data/roxstockApi.ts';
test('gesture contract: direction, distance, velocity, diagonal/vertical lock and click',()=>{
 assert.equal(detailSwipeDirection(-50,5,500,'horizontal'),1);
 assert.equal(detailSwipeDirection(50,5,500,'horizontal'),-1);
 assert.equal(detailSwipeDirection(-22,2,40,'horizontal'),1);
 assert.equal(detailSwipeDirection(-22,2,500,'horizontal'),0);
 assert.equal(detailSwipeDirection(-50,60,100,'pending'),0);
 assert.equal(detailSwipeDirection(-100,1,100,'vertical'),0);
 assert.equal(detailSwipeDirection(0,0,1,'pending'),0);
});
test('static cache deduplicates, isolates conditions, refreshes after mutation and never mixes delayed accounts',async()=>{
 const client=new QueryClient();let reads=0,release!:()=>void;
 const a={...storedQueryOptions,queryKey:['investment-profit','1',2026],queryFn:async()=>{reads++;return 'A';}};
 await Promise.all([client.fetchQuery(a),client.fetchQuery(a)]);assert.equal(reads,1);
 await client.fetchQuery(a);assert.equal(reads,1);await invalidatePortfolio(client);await client.fetchQuery(a);assert.equal(reads,2);
 const old=client.fetchQuery({...storedQueryOptions,queryKey:['investment-profit','1',2025],queryFn:async()=>{await new Promise<void>(r=>release=r);return 'older A';}});
 await client.fetchQuery({...a,queryKey:['investment-profit','2',2026],queryFn:async()=>'B'});release();await old;
 assert.equal(client.getQueryData(['investment-profit','2',2026]),'B');assert.equal(client.getQueryData(a.queryKey),'A');client.clear();
});
test('profit rows sort signed amounts with stable ties; sold-lot cost cannot replace total purchases',()=>{
 const sec=(id:string)=>({id,name:id,symbol:id,marketType:'KOSPI' as const});
 const rows:TradeDto[]=[{id:'b',type:'BUY',buyTradeId:'b',tradedAt:'2024-01-01T00:00:00Z',security:sec('1'),quantity:'10',unitPrice:'100',amount:'1000',realizedProfitLoss:null,memo:null},
 {id:'s',type:'SELL',buyTradeId:'b',tradedAt:'2026-01-01T00:00:00Z',security:sec('1'),quantity:'5',unitPrice:'170',amount:'850',realizedProfitLoss:'350',memo:null}];
 const data=calculateProfit(rows,[],'2026-10-07'),stock=data.stocks[0]!;
 assert.equal(rate(stock.totals.trading,stock.totals.buy),'+35.0%');assert.equal(rate(stock.totals.trading,stock.totals.cost),'+70.0%');
 const groups=[-1000,0,350,-10,350].map((value,i)=>({...stock,id:String(i),totals:{...stock.totals,total:amount(String(value))}}));
 assert.deepEqual(sortProfit(groups).map(r=>r.id),['2','4','1','3','0']);assert.deepEqual(sortProfit(groups,true).map(r=>r.id),['0','3','1','2','4']);
 assert.equal(rate(amount('39720500'),amount('107317732')),'+37.0%');assert.equal(rate(amount('0'),amount('0')),'—');
});
test('profit load makes one trades request, parallel paginated dividends and passes cancellation to every source',async()=>{
 const original=globalThis.fetch,signal=new AbortController().signal,paths:string[]=[];
 globalThis.fetch=(async(url:any,init:any)=>{assert.equal(init.signal,signal);const path=String(url);paths.push(path);
 return {ok:true,json:async()=>path.includes('cash-transactions')?{data:[],meta:{total:0}}:path.includes('investment-capital')?{data:[{year:2026,date:'2026-10-01',investmentAmount:'50',status:'AVAILABLE'}]}:{data:[],summary:{}}} as any;}) as any;
 try {const data=await loadProfit('7','2026-10-07',signal);assert.equal(paths.length,3);assert.equal(paths.filter(p=>p.includes('/trades?')).length,1);assert.equal(data.capital?.[0]?.date,'2026-10-01');} finally {globalThis.fetch=original;}
});
