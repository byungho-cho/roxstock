import { getKoreanHolidays } from '../pages/journal/koreanHolidays';

// KRX cash-equity calendar: public holidays, weekends, May 1 and the last business day.
// https://regulation.krx.co.kr/contents/RGL/03/03020401/RGL03020401.jsp
// One-off closures require explicit additions; never infer a closure from prices or profit.
const specialClosures = new Set([
  '2010-06-02', '2012-04-11', '2012-12-19', '2014-06-04', '2015-08-14', '2016-04-13',
  '2017-05-09', '2017-10-02', '2018-06-13', '2020-04-15', '2020-08-17',
  '2022-03-09', '2022-06-01', '2023-10-02', '2024-04-10', '2024-10-01',
  '2025-01-27', '2025-06-03',
]);
const cache = new Map<number, Set<string>>();
function closedDates(year: number) {
  if (cache.has(year)) return cache.get(year)!;
  const holidays = getKoreanHolidays(year);
  const closed = new Set([...holidays].filter(([, name]) => {
    if (!name.includes('대체공휴일')) return true;
    if (/부처|성탄/.test(name)) return year >= 2023;
    if (/삼일|광복|개천|한글/.test(name)) return year >= 2021;
    return year >= 2014;
  }).map(([date]) => date));
  closed.add(`${year}-05-01`);
  for (const date of specialClosures) if (date.startsWith(`${year}-`)) closed.add(date);
  let last = new Date(Date.UTC(year, 11, 31));
  while ([0, 6].includes(last.getUTCDay()) || closed.has(last.toISOString().slice(0, 10))) last = new Date(last.getTime() - 86400000);
  closed.add(last.toISOString().slice(0, 10));
  cache.set(year, closed);
  return closed;
}
export function isMarketClosed(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6 || closedDates(Number(date.slice(0, 4))).has(date);
}
