import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCollectorConfig} from './config.js';
test('DART current collection defaults to 10000, accepts explicit budgets and rejects larger values',()=>{
 const previous=process.env.DART_DAILY_CALL_LIMIT;
 try{delete process.env.DART_DAILY_CALL_LIMIT;assert.equal(loadCollectorConfig().dartDailyCallLimit,10000);process.env.DART_DAILY_CALL_LIMIT='10000';assert.equal(loadCollectorConfig().dartDailyCallLimit,10000);process.env.DART_DAILY_CALL_LIMIT='3000';assert.equal(loadCollectorConfig().dartDailyCallLimit,3000);process.env.DART_DAILY_CALL_LIMIT='10001';assert.throws(()=>loadCollectorConfig(),/cannot exceed 10000/);}finally{if(previous===undefined)delete process.env.DART_DAILY_CALL_LIMIT;else process.env.DART_DAILY_CALL_LIMIT=previous;}
});
