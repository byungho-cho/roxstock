import {isMarketClosed} from './market-calendar.js';

export type TradingInterval = [number, number];
export type ExchangeSchedule = {
    date: string;
    regular: TradingInterval;
    krx: TradingInterval[];
    nxt: TradingInterval[];
    sources: string[];
};
let exceptions: ExchangeSchedule[] = [];
const validInterval=(value:unknown):value is TradingInterval=>Array.isArray(value)&&value.length===2&&value.every(Number.isInteger)&&value[0]>=0&&value[0]<value[1]&&value[1]<=86400;
export function validExchangeSchedule(value:unknown):value is ExchangeSchedule {
    if(!value||typeof value!=='object')return false;
    const s=value as ExchangeSchedule;
    return typeof s.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&
        Number.isFinite(Date.parse(s.date))&&new Date(s.date).toISOString().slice(0,10)===s.date&&validInterval(s.regular)&&
        Array.isArray(s.krx)&&s.krx.length>0&&s.krx.every(validInterval)&&
        Array.isArray(s.nxt)&&s.nxt.every(validInterval)&&
        Array.isArray(s.sources)&&s.sources.length>0&&s.sources.every(url=>typeof url==='string'&&/^https:\/\/(?:www\.kakaopaysec\.com|nextrade\.co\.kr)\//.test(url));
}
export function installExchangeSchedules(values:unknown):void {
    if(!Array.isArray(values)||!values.every(validExchangeSchedule))throw Error('INVALID_EXCHANGE_SCHEDULE');
    if(new Set(values.map(s=>s.date)).size!==values.length)throw Error('CONFLICTING_EXCHANGE_SCHEDULE');
    exceptions=values;
}
export function exchangeSchedule(date:string) { return exceptions.find(s=>s.date===date); }
export function withinTradingIntervals(seconds:number,intervals:TradingInterval[]) {
    return intervals.some(([start,end])=>seconds>=start&&seconds<end);
}
export function scheduleReviewDates(now:Date) {
    const today=new Date(+now+9*3600000).toISOString().slice(0,10);
    let next=new Date(today+'T00:00:00Z');
    do {next=new Date(+next+86400000);}while(isMarketClosed(next.toISOString().slice(0,10)));
    return [today,next.toISOString().slice(0,10)];
}
