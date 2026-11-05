import type {LiveQuote,QuoteMarket} from '../../../../shared/src/domain/live-quotes';

const koreanDay=(time:number)=>{const date=new Date(time+9*3600000);return Number.isFinite(date.getTime())?date.toISOString().slice(0,10):'';};

/** Socket connection and REST fetch time do not establish today's actual trade. */
export function hasCurrentTrade(q:LiveQuote|null|undefined,symbol:string,market:QuoteMarket,referenceMarket?:QuoteMarket,now=Date.now()):boolean {
    return !!q&&q.symbol===symbol&&q.market===market&&q.source==='KIS'&&!referenceMarket&&q.receivedAt>0&&koreanDay(q.receivedAt)===koreanDay(now)&&koreanDay(Date.parse(q.observedAt))===koreanDay(now);
}
