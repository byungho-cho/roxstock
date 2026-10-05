// Regular Korean public holidays. Temporary holidays and future law changes require an update.
// Solar dates for lunar New Year, Buddha's Birthday and Chuseok, respectively.
// Keep these independent of the device's Intl Chinese-calendar implementation.
const lunarDates: Record<number, [string, string, string]> = {
  2021: ['02-12', '05-19', '09-21'],
  2022: ['02-01', '05-08', '09-10'],
  2023: ['01-22', '05-26', '09-29'],
  2024: ['02-10', '05-15', '09-17'],
  2025: ['01-29', '05-05', '10-06'],
  2026: ['02-17', '05-24', '09-25'],
  2027: ['02-07', '05-13', '09-15'],
  2028: ['01-26', '05-02', '10-03'],
  2029: ['02-13', '05-20', '09-22'],
  2030: ['02-02', '05-09', '09-12'],
  2031: ['01-23', '05-28', '10-01'],
  2032: ['02-11', '05-16', '09-19'],
};
const holidayCache = new Map<number, Map<string, string>>();
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const dateAt = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day, 12));
const after = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);
const solarDate = (year: number, monthDay: string) => {
  const [month, day] = monthDay.split('-').map(Number);
  return dateAt(year, month, day);
};
function getLunarDates(year: number): [string, string, string] {
  if (lunarDates[year]) return lunarDates[year];
  let calendar: Intl.DateTimeFormat;
  try {
    calendar = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' });
  } catch {
    return ['', '', ''];
  }
  if (calendar.resolvedOptions().calendar !== 'chinese') return ['', '', ''];
  const found: Record<string, string> = {};
  for (let date = dateAt(year, 1, 1); date.getUTCFullYear() === year; date = after(date, 1)) {
    const parts = calendar.formatToParts(date);
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (month === '1' && day === '1') found.newYear = isoDate(date).slice(5);
    if (month === '4' && day === '8') found.buddha = isoDate(date).slice(5);
    if (month === '8' && day === '15') found.chuseok = isoDate(date).slice(5);
  }
  return [found.newYear, found.buddha, found.chuseok];
}

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

  const [newYear, buddha, chuseok] = getLunarDates(year);
  if (newYear) for (const offset of [-1, 0, 1]) add(after(solarDate(year, newYear), offset), '설날', true, true);
  if (buddha) add(solarDate(year, buddha), '부처님오신날', true);
  if (chuseok) for (const offset of [-1, 0, 1]) add(after(solarDate(year, chuseok), offset), '추석', true, true);

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
