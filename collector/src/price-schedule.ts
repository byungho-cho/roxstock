import {isMarketClosed} from '@roxstock/shared/domain/market-calendar';
import {getSeoulClock} from '@roxstock/shared/collection/time';
import {publicHolidayDates,holidayCalendarStatus} from '@roxstock/shared/collection/dart-policy';
export async function priceScheduleDecision(now=new Date()){
 const date=getSeoulClock(now).dateKey;
 const explicit=(process.env.MARKET_CLOSED_DATES??'').split(',').map(s=>s.trim());
 if(isMarketClosed(date)||explicit.includes(date))return {date,closed:true,basis:'KRX_CALENDAR'};
 const dates=await publicHolidayDates(now);
 return {date,closed:dates.includes(date),basis:dates.includes(date)?'PUBLIC_HOLIDAY':holidayCalendarStatus(now)==='AVAILABLE'?'PUBLIC_CALENDAR_OPEN':'CALENDAR_UNAVAILABLE'};
}
