import {type ExchangeSchedule,type TradingInterval,validExchangeSchedule} from '@roxstock/shared/domain/exchange-schedule';

const text=(html:string)=>html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<[^>]*>/g,'').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/[\u200b\uFEFF]/g,'').replace(/\s+/g,' ').trim();
const interval=(value:string):TradingInterval=>{
    const match=value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?\s*[~～∼]\s*(\d{2}):(\d{2})(?::(\d{2}))?/);
    if(!match)throw Error('SCHEDULE_REVIEW_REQUIRED');
    const seconds=(h:string,m:string,s='0')=>{
        if(Number(h)>23||Number(m)>59||Number(s)>59)throw Error('SCHEDULE_REVIEW_REQUIRED');
        return Number(h)*3600+Number(m)*60+Number(s);
    };
    const result:TradingInterval=[seconds(match[1]!,match[2]!,match[3]),seconds(match[4]!,match[5]!,match[6])];
    if(result[0]>=result[1])throw Error('SCHEDULE_REVIEW_REQUIRED');
    return result;
};
function rows(table:string) {
    return [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row=>
        [...row[1]!.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell=>text(cell[1]!)));
}
export function brokerNoticeLinks(html:string) {
    if(!html.includes('공지사항')||!html.includes('dynamicBoardPageDetail'))throw Error('SCHEDULE_SOURCE_CHANGED');
    return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap(row=>{
        const m=row[1]!.match(/<a\b[^>]*href="(\/customer\/notice\/dynamicBoardPageDetail\.do\?id=\d+)"[^>]*>([\s\S]*?)<\/a>/i);
        const published=text(row[1]!).match(/20\d{2}\.\d{2}\.\d{2}$/)?.[0]?.replaceAll('.','-');
        return m&&published?[{url:'https://www.kakaopaysec.com'+m[1],title:text(m[2]!),published}]:[];
    })
        .filter(n=>/거래시간|매매시간|개장|휴장/.test(n.title)&&!/미국|해외|홍콩|중국|일본/.test(n.title));
}
/** Only complete, explicit before/after tables with one effective date can be applied. */
export function parseBrokerSchedule(html:string,url:string):ExchangeSchedule {
    const title=text(html.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1]??'');
    const dates=[...title.matchAll(/(20\d{2})[.년/-]\s*(\d{1,2})[.월/-]\s*(\d{1,2})/g)];
    if(dates.length!==1)throw Error('SCHEDULE_REVIEW_REQUIRED');
    const d=dates[0]!,date=d[1]+'-'+d[2]!.padStart(2,'0')+'-'+d[3]!.padStart(2,'0');
    if(new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('SCHEDULE_REVIEW_REQUIRED');
    let krx:TradingInterval[]|undefined,nxt:TradingInterval[]|undefined,regular:TradingInterval|undefined;
    let previousEnd=0;
    for(const match of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)){
        const heading=text(html.slice(previousEnd,match.index));
        previousEnd=match.index!+match[0].length;
        const data=rows(match[0]),header=data[0]??[];
        if(header.at(-1)!=='변경 후'||header.at(-2)!=='변경 전')continue;
        if(/KRX/.test(heading)){
            if(krx)throw Error('SCHEDULE_REVIEW_REQUIRED');
            krx=[];
            for(const row of data.slice(1)){
                if(row.length!==3)throw Error('SCHEDULE_REVIEW_REQUIRED');
                const hours=interval(row[2]!);
                if(row[0]==='정규장')regular=hours;
                else if(!['장전 시간외종가','장후 시간외종가','애프터마켓'].includes(row[0]!))throw Error('SCHEDULE_REVIEW_REQUIRED');
                krx.push(hours);
            }
            if(data.length!==5)throw Error('SCHEDULE_REVIEW_REQUIRED');
        }else if(/NXT/.test(heading)){
            if(nxt)throw Error('SCHEDULE_REVIEW_REQUIRED');
            nxt=[];
            const labels=new Set<string>();
            for(const row of data.slice(1)){
                const label=row.at(-3)!,value=row.at(-1)!;
                if(!['프리마켓','메인마켓','애프터마켓','종가매매'].includes(label)||labels.has(label))throw Error('SCHEDULE_REVIEW_REQUIRED');
                labels.add(label);
                if(label==='종가매매')continue;
                if(label==='프리마켓'&&/^(미운영|운영하지 않음)$/.test(value))continue;
                nxt.push(interval(value));
            }
            if(labels.size!==4)throw Error('SCHEDULE_REVIEW_REQUIRED');
        }
    }
    const result={date,regular,krx,nxt,sources:[url]};
    if(!validExchangeSchedule(result))throw Error('SCHEDULE_REVIEW_REQUIRED');
    return result;
}
export function nxtNoticeLinks(html:string) {
    if(!html.includes('공지사항')||!html.includes('data-nttNo'))throw Error('SCHEDULE_SOURCE_CHANGED');
    return [...html.matchAll(/<a\b[^>]*data-nttNo="(\d+)"[^>]*>([\s\S]*?)<\/a>/gi)]
        .map(m=>({url:'https://nextrade.co.kr/menu/notice/view.do?scNttNo='+m[1],title:text(m[2]!),published:text(m[2]!).match(/20\d{2}-\d{2}-\d{2}/)?.[0]??''}))
        .filter(n=>/거래시간|매매시간|개장|휴장/.test(n.title));
}
export function verifyNxtSchedule(html:string,schedule:ExchangeSchedule) {
    const plain=text(html);
    const short=schedule.date.slice(2).replaceAll('-','.');
    if(!plain.includes(short))throw Error('SCHEDULE_SOURCE_DISAGREEMENT');
    let previousEnd=0;
    const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)];
    const changed=tables.filter(m=>{
        const heading=text(html.slice(previousEnd,m.index)).replace(/\s/g,'');
        previousEnd=m.index!+m[0].length;
        return heading.includes('나.변경후');
    });
    if(changed.length!==1)throw Error('SCHEDULE_REVIEW_REQUIRED');
    const data=rows(changed[0]![0]),hours:TradingInterval[]=[];
    if(!data[0]?.join('').includes('호가접수시간')||!data[0]?.join('').includes('매매거래시간'))throw Error('SCHEDULE_REVIEW_REQUIRED');
    for(const row of data.slice(1)){
        const label=row.find(v=>/^(프리마켓|메인마켓|애프터마켓)$/.test(v));
        if(!label)continue;
        const value=row.at(-1)!;
        if(label==='프리마켓'&&/운영하지 않음|미운영/.test(value))continue;
        const range=value==='좌동'?row.at(-2)!:value;
        hours.push(interval(range));
    }
    if(JSON.stringify(hours)!==JSON.stringify(schedule.nxt))throw Error('SCHEDULE_SOURCE_DISAGREEMENT');
}
