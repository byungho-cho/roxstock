// Regular Korean public holidays. Temporary holidays and future law changes require an update.
const lunarCalendar = new Intl.DateTimeFormat('en-u-ca-chinese', {
  month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul',
});
const holidayCache = new Map<number, Map<string, string>>();
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const dateAt = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day, 12));
const after = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);

export function getKoreanHolidays(year: number): Map<string, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const holidays = new Map<string, string>();
  const eligible: { date: Date; name: string; overlapsSundayOnly: boolean }[] = [];
  const occurrences = new Map<string, number>();
  const add = (date: Date, name: string, substitute = false, overlapsSundayOnly = false) => {
    const key = isoDate(date);
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    holidays.set(key, name);
    if (substitute) eligible.push({ date, name, overlapsSundayOnly });
  };

  const fixed: [number, number, string, boolean][] = [
    [1, 1, '신정', false], [3, 1, '삼일절', true], [5, 5, '어린이날', true],
    [6, 6, '현충일', false], [8, 15, '광복절', true], [10, 3, '개천절', true],
    [10, 9, '한글날', true], [12, 25, '성탄절', true],
  ];
  if (year >= 2026) fixed.push([5, 1, '노동절', true], [7, 17, '제헌절', true]);
  for (const [month, day, name, substitute] of fixed) add(dateAt(year, month, day), name, substitute);

  // Locate lunar New Year, Buddha's Birthday and Chuseok in this Gregorian year.
  for (let date = dateAt(year, 1, 1); date.getUTCFullYear() === year; date = after(date, 1)) {
    const parts = lunarCalendar.formatToParts(date);
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (month === '1' && day === '1') {
      for (const offset of [-1, 0, 1]) add(after(date, offset), '설날', true, true);
    } else if (month === '4' && day === '8') {
      add(date, '부처님오신날', true);
    } else if (month === '8' && day === '15') {
      for (const offset of [-1, 0, 1]) add(after(date, offset), '추석', true, true);
    }
  }

  // The next day that is neither a Sunday nor another public holiday is the substitute.
  for (const { date, name, overlapsSundayOnly } of eligible) {
    const weekday = date.getUTCDay();
    const overlapsHoliday = (occurrences.get(isoDate(date)) ?? 0) > 1;
    if (weekday !== 0 && !overlapsHoliday && (overlapsSundayOnly || weekday !== 6)) continue;
    let replacement = after(date, 1);
    while (replacement.getUTCDay() === 0 || holidays.has(isoDate(replacement))) replacement = after(replacement, 1);
    holidays.set(isoDate(replacement), `${name} 대체공휴일`);
  }

  // Election days are public holidays but do not repeat annually.
  if (year === 2026) holidays.set('2026-06-03', '전국동시지방선거');
  holidayCache.set(year, holidays);
  return holidays;
}
