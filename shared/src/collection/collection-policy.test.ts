import test from 'node:test';import assert from 'node:assert/strict';
import {exclusionReason,CollectionExcluded,withCollection,collectionFetch} from './collection-policy.js';
import {collectionPublicMessage} from '../../../backend/src/domain/collection-public-message.js';
test('normalization and independent ALL/feature exclusions distinguish immutable Z99 from reversible user settings',()=>{
 const s={symbol:'z99001',collectionExcluded:false,excludedFeatures:[],collectionRevision:0};assert.match(exclusionReason(s)! ,/Z99/);
 s.symbol='005930';assert.equal(exclusionReason(s),null);s.excludedFeatures=['consensus'] as never;assert.equal(exclusionReason(s,'market-prices'),null);assert.match(exclusionReason(s,'consensus')!,/해당 기능/);s.collectionExcluded=true;assert.match(exclusionReason(s,'market-prices')!,/모든 외부/);
});
test('late external result is rejected even after exclude/reactivate ABA changes',async()=>{
 const security={id:1n,symbol:'005930',collectionExcluded:false,excludedFeatures:[],collectionRevision:0};
 const db={security:{findUnique:async()=>({...security})}} as any;let calls=0,release!:()=>void,entered!:()=>void;
 const started=new Promise<void>(r=>entered=r),pending=new Promise<void>(r=>release=r);
 const work=withCollection(db,1n,'market-prices',()=>collectionFetch((async()=>{calls++;entered();await pending;return Response.json({price:100});}) as typeof fetch)('https://example.invalid'));
 await started;security.collectionRevision+=2;release();await assert.rejects(work,CollectionExcluded);assert.equal(calls,1);
 security.collectionExcluded=true;await assert.rejects(withCollection(db,1n,'market-prices',()=>collectionFetch((async()=>{calls++;return Response.json({})}) as typeof fetch)('https://example.invalid')),CollectionExcluded);assert.equal(calls,1);
});
test('public failure messages redact entire URLs, JSON credentials, authorization and raw database/stack exceptions',()=>{
 const value=collectionPublicMessage('수집 실패 https://example.invalid/report?crtfc_key=abc "api_key":"private" Authorization: Bearer abcdef 오류 안내');
 assert.ok(value?.includes('오류 안내'));assert.doesNotMatch(value!,/example\.invalid|private|abcdef|crtfc_key=abc/);
 assert.equal(collectionPublicMessage('PrismaClient error SELECT secret FROM users'), '수집 요청 또는 저장 처리에 오류가 발생했습니다. 서버 담당자가 원문 로그를 확인해야 합니다.');
});
