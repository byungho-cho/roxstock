import test from 'node:test';
import assert from 'node:assert/strict';
import {readExchangeSchedules,startExchangeScheduleCheck} from '../realtime/exchange-schedule-check.js';
import {parseBrokerSchedule} from '../realtime/exchange-notices.js';
import {exchangeSchedule,installExchangeSchedules,scheduleReviewDates} from '@roxstock/shared/domain/exchange-schedule';
import {quoteSession} from '@roxstock/shared/domain/live-quote-policy';
import {marketOpen} from '../realtime/kis-live.js';
import {prisma} from '@roxstock/shared/lib/prisma';

const url='https://www.kakaopaysec.com/customer/notice/dynamicBoardPageDetail.do?id=7618';
const table=(rows:string[][])=>'<table>'+rows.map(row=>'<tr>'+row.map(value=>'<td>'+value+'</td>').join('')+'</tr>').join('')+'</table>';
const broker='<h3>대학수학능력시험일 (2026.11.19) 거래시간 임시 변경 안내</h3><p>KRX</p>'+
    table([['구분','변경 전','변경 후'],['정규장','09:00 ~ 15:30','10:00 ~ 16:30'],['장전 시간외종가','08:30 ~ 08:40','09:30 ~ 09:40'],['장후 시간외종가','15:40 ~ 16:00','16:40 ~ 17:00'],['애프터마켓','16:00 ~ 20:00','17:00 ~ 20:00']])+
    '<p>NXT</p>'+table([['구분','변경 전','변경 후'],['프리마켓','08:00 ~ 08:50','미운영'],['메인마켓','09:00:30 ~ 15:20','10:00:30 ~ 16:20'],['애프터마켓','15:40 ~ 20:00','16:40 ~ 20:00'],['종가매매','15:30 ~ 16:00','16:30 ~ 17:00']]);
const official='<h3>대학수학능력시험일 (‘26.11.19) 매매거래시간 임시 변경 안내</h3><p>나. 변경 후</p>'+
    table([['구분','호가접수시간','매매거래시간'],['프리마켓','운영하지 않음','운영하지 않음'],['메인마켓','10:00:30~16:20','좌동'],['애프터마켓','16:30~20:00','16:40~20:00']]);
const fetcher:typeof fetch=async(input)=>{
    const request=String(input);
    const body=request.includes('dynamicPage.do')?'<h2>공지사항</h2><table><tr><td><a href="/customer/notice/dynamicBoardPageDetail.do?id=7618">대학수학능력시험일 (2026.11.19) 거래시간 변경</a></td><td>2026.11.17</td></tr></table>':
        request.includes('dynamicBoardPageDetail')?broker:
        request.includes('menuList.do')?'<h2>공지사항</h2><a data-nttNo="46"><p>2026-11-05 10:00</p><strong>대학수학능력시험일(11.19) 매매거래시간 임시 변경 안내</strong></a>':official;
    return new Response(body);
};
test('paired notices select post-change hours for KRX and NXT and apply the effective date only',async()=>{
    const result=await readExchangeSchedules(new Date('2026-11-19T06:00:00+09:00'),fetcher);
    assert.deepEqual(result.reviewDates,['2026-11-19','2026-11-20']);
    assert.equal(result.schedules.length,1);
    const schedule=result.schedules[0]!;
    assert.deepEqual(schedule.regular,[36000,59400]);
    assert.equal(schedule.sources.length,2);
    installExchangeSchedules(result.schedules);
    try{
        assert.equal(marketOpen('TOTAL',new Date('2026-11-19T08:10:00+09:00')),false);
        assert.equal(marketOpen('KRX',new Date('2026-11-19T09:35:00+09:00')),true);
        assert.equal(marketOpen('NXT',new Date('2026-11-19T10:00:29+09:00')),false);
        assert.equal(marketOpen('NXT',new Date('2026-11-19T10:00:30+09:00')),true);
        assert.equal(quoteSession(new Date('2026-11-19T16:15:00+09:00')),'regular');
        assert.equal(marketOpen('KRX',new Date('2026-11-19T16:45:00+09:00')),true);
        assert.equal(marketOpen('TOTAL',new Date('2026-11-19T20:00:00+09:00')),false);
        assert.equal(quoteSession(new Date('2026-11-20T09:00:00+09:00')),'regular');
        assert.deepEqual(scheduleReviewDates(new Date('2026-11-20T06:00:00+09:00')),['2026-11-20','2026-11-23']);
    }finally{installExchangeSchedules([]);}
});
test('ambiguous dates, malformed tables, source errors and disagreement require review',async()=>{
    assert.throws(()=>parseBrokerSchedule(broker.replace('2026.11.19','11.19'),url),/REVIEW_REQUIRED/);
    assert.throws(()=>parseBrokerSchedule(broker.replace('10:00 ~ 16:30','24:00 ~ 25:00'),url),/REVIEW_REQUIRED/);
    assert.throws(()=>parseBrokerSchedule(broker.replace('변경 후','변경 전'),url),/REVIEW_REQUIRED/);
    await assert.rejects(readExchangeSchedules(new Date('2026-11-19'),async()=>new Response('',{status:503})),/SOURCE_UNAVAILABLE/);
    await assert.rejects(readExchangeSchedules(new Date('2026-11-19'),async(input,init)=>{
        const response=await fetcher(input,init);
        return String(input).includes('view.do')?new Response((await response.text()).replace('10:00:30~16:20','11:00:30~16:20')):response;
    }),/DISAGREEMENT/);
});
test('verified schedules persist and a failed refresh records a failure while retaining the last schedule',async(t)=>{
    t.mock.timers.enable({apis:['Date'],now:new Date('2026-11-19T06:00:00+09:00')});
    const created:any[]=[];
    const delegate=prisma.collectorRun as any,findFirst=delegate.findFirst,create=delegate.create;
    delegate.findFirst=async({where}:any)=>where.status==='SUCCESS'?[...created].reverse().find(run=>run.status==='SUCCESS')??null:created.at(-1)??null;
    delegate.create=async({data}:any)=>{created.push(data);return data;};
    t.after(()=>{delegate.findFirst=findFirst;delegate.create=create;installExchangeSchedules([]);});
    const codes:string[]=[];
    const stop=await startExchangeScheduleCheck(code=>codes.push(code),fetcher);
    await stop();
    assert.equal(created[0].status,'SUCCESS');
    assert.equal(exchangeSchedule('2026-11-19')?.regular[0],36000);
    const sameSlot=await startExchangeScheduleCheck(code=>codes.push(code),fetcher);
    await sameSlot();
    assert.equal(created.length,1,'a restart does not repeat a completed daily slot');
    t.mock.timers.setTime(Date.parse('2026-11-19T18:00:00+09:00'));
    const fail=await startExchangeScheduleCheck(code=>codes.push(code),async()=>new Response('',{status:503}));
    await fail();
    assert.equal(created[1].status,'FAILED');
    assert.deepEqual(codes,['SCHEDULE_CHECK_FAILED']);
    assert.equal(exchangeSchedule('2026-11-19')?.regular[0],36000);
    const retryLater=await startExchangeScheduleCheck(code=>codes.push(code),fetcher);
    await retryLater();
    assert.equal(created.length,2,'a failed check waits an hour before retrying');
    t.mock.timers.setTime(Date.parse('2026-11-19T19:00:00+09:00'));
    const retry=await startExchangeScheduleCheck(code=>codes.push(code),fetcher);
    await retry();
    assert.equal(created.at(-1).status,'SUCCESS');
    installExchangeSchedules([]);
});
