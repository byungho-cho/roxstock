import {prisma} from '@roxstock/shared/lib/prisma';
import {exchangeScheduleJob,refreshExchangeScheduleCache} from '@roxstock/shared/lib/exchange-schedule-cache';
import {installExchangeSchedules,scheduleReviewDates,type ExchangeSchedule} from '@roxstock/shared/domain/exchange-schedule';
import {brokerNoticeLinks,nxtNoticeLinks,parseBrokerSchedule,verifyNxtSchedule} from './exchange-notices.js';

async function readNotice(url:string,fetcher:typeof fetch) {
    const response=await fetcher(url,{signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok)throw Error('SCHEDULE_SOURCE_UNAVAILABLE');
    const html=await response.text();
    if(html.length>2000000)throw Error('SCHEDULE_SOURCE_CHANGED');
    return html;
}
export async function readExchangeSchedules(now=new Date(),fetcher:typeof fetch=fetch) {
    const cutoff=new Date(+now-60*86400000).toISOString().slice(0,10);
    const brokerUrl='https://www.kakaopaysec.com/customer/notice/dynamicPage.do';
    const nxtUrl='https://nextrade.co.kr/menu/notice/menuList.do';
    const [brokerHtml,nxtHtml,brokerRecent,nxtRecent]=await Promise.all([
        readNotice(brokerUrl+'?searchOption=0&searchText='+encodeURIComponent('거래시간'),fetcher),
        readNotice(nxtUrl+'?searchKeyword='+encodeURIComponent('거래시간'),fetcher),
        readNotice(brokerUrl,fetcher),
        readNotice(nxtUrl,fetcher),
    ]);
    const broker=[...new Map([...brokerNoticeLinks(brokerRecent),...brokerNoticeLinks(brokerHtml)].map(n=>[n.url,n])).values()].filter(n=>n.published>=cutoff);
    const official=[...new Map([...nxtNoticeLinks(nxtRecent),...nxtNoticeLinks(nxtHtml)].map(n=>[n.url,n])).values()].filter(n=>n.published>=cutoff);
    const schedules:ExchangeSchedule[]=[];
    for(const notice of broker){
        const schedule=parseBrokerSchedule(await readNotice(notice.url,fetcher),notice.url);
        if(schedule.date<cutoff||schedules.some(s=>s.date===schedule.date))continue;
        const monthDay=Number(schedule.date.slice(5,7))+'.'+Number(schedule.date.slice(8));
        const matching=official.find(n=>n.title.includes(monthDay));
        if(!matching)throw Error('SCHEDULE_REVIEW_REQUIRED');
        verifyNxtSchedule(await readNotice(matching.url,fetcher),schedule);
        schedule.sources.push(matching.url);
        schedules.push(schedule);
    }
    // An unpaired official change must be surfaced for review, not silently treated as normal hours.
    if(official.some(n=>!schedules.some(s=>s.sources.includes(n.url))))throw Error('SCHEDULE_REVIEW_REQUIRED');
    return {schedules,reviewDates:scheduleReviewDates(now),sources:[brokerUrl,nxtUrl]};
}

/** Startup, then 06:00/18:00 KST. Failures retry hourly and preserve verified DB snapshots. */
export async function startExchangeScheduleCheck(report:(code:string)=>void,fetcher:typeof fetch=fetch) {
    try{await refreshExchangeScheduleCache();}catch{report('SCHEDULE_CACHE_UNAVAILABLE');}
    let stopped=false,busy:Promise<void>|undefined,nextAttempt=0;
    const check=()=>{
        if(stopped||busy||Date.now()<nextAttempt)return;
        busy=(async()=>{
            const now=new Date();
            const last=await prisma.collectorRun.findFirst({where:{jobType:exchangeScheduleJob},orderBy:{id:'desc'},select:{startedAt:true,status:true}});
            const kst=new Date(+now+9*3600000);
            const slot=new Date(Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth(),kst.getUTCDate(),kst.getUTCHours()>=18?18:6)-9*3600000);
            const due=+slot>+now?+slot-12*3600000:+slot;
            if(last&&+last.startedAt>=due&&last.status==='SUCCESS'){
                nextAttempt=due+12*3600000;
                return;
            }
            if(last&&last.status!=='SUCCESS'&&+now-+last.startedAt<3600000){nextAttempt=+last.startedAt+3600000;return;}
            try{
                const metadata=await readExchangeSchedules(now,fetcher);
                await prisma.collectorRun.create({data:{jobType:exchangeScheduleJob,provider:'KAKAOPAY_NXT_NOTICES',status:'SUCCESS',startedAt:now,finishedAt:new Date(),successCount:metadata.schedules.length,metadata}});
                installExchangeSchedules(metadata.schedules);
                nextAttempt=due+12*3600000;
            }catch{
                nextAttempt=Date.now()+3600000;
                await prisma.collectorRun.create({data:{jobType:exchangeScheduleJob,provider:'KAKAOPAY_NXT_NOTICES',status:'FAILED',startedAt:now,finishedAt:new Date(),failureCount:1,failureReason:'거래시간 공지 확인 실패 또는 공지 형식 변경 · 확인된 기존 일정 유지 · 운영 검토 필요'}});
                report('SCHEDULE_CHECK_FAILED');
            }
        })().catch(()=>{nextAttempt=Date.now()+3600000;report('SCHEDULE_CHECK_UNAVAILABLE');}).finally(()=>{busy=undefined;});
    };
    check();
    const timer=setInterval(()=>{
        if(busy)return;
        void refreshExchangeScheduleCache().then(check).catch(()=>report('SCHEDULE_CACHE_UNAVAILABLE'));
    },60000);timer.unref();
    return async()=>{stopped=true;clearInterval(timer);await busy;};
}
