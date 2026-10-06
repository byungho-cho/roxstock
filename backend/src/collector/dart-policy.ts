import { getSeoulClock, isHourInOvernightWindow } from './time.js';

export function dartWindowOpen(now: Date, start: number, end: number, holidays: readonly string[] = [], allDay = true) {
  const clock = getSeoulClock(now);
  const weekday = new Date(`${clock.dateKey}T00:00:00Z`).getUTCDay();
  return allDay && (weekday === 0 || weekday === 6 || holidays.includes(clock.dateKey)) || isHourInOvernightWindow(clock.hour, start, end);
}

export function dartFailure(error: unknown, stage: string, apiKey = '') {
  const e = error as { code?: unknown; name?: unknown; message?: unknown } | null;
  const code = typeof e?.code === 'string' ? e.code : stage === 'SAVE' ? 'DATABASE_ERROR' : stage === 'NORMALIZE' ? 'NORMALIZE_ERROR' : 'RESPONSE_ERROR';
  let message = typeof e?.message === 'string' ? e.message : 'Unknown collector error';
  if (apiKey) message = message.split(apiKey).join('[redacted]');
  message = message.replace(/https?:\/\/\S+/gi, '[url]').replace(/(?:crtfc_key|api[_-]?key|token|secret)[\s=:"']+[^\s&,"']+/gi, '[redacted]');
  return { code, message: `${stage}: ${String(e?.name ?? 'Error')} ${message}`.slice(0, 900) };
}

export function retryDecision(code: string, attempts: number, now: Date) {
  const paused = ['020', 'DAILY_CALL_LIMIT', 'SCHEDULE_WINDOW_ENDED'].includes(code);
  if (paused) return { status: 'PENDING' as const, code, nextAttemptAt: null, stop: true };
  const permanent = code.startsWith('P2') || ['RECEIPT_MISMATCH', 'DATABASE_ERROR', 'NORMALIZE_ERROR', 'RESPONSE_ERROR', 'INVALID_JSON', '100', '101'].includes(code);
  const review = attempts >= (permanent ? 3 : 5);
  const delay = permanent ? 6 * 3_600_000 : Math.min(6 * 3_600_000, 15 * 60_000 * 2 ** Math.min(attempts - 1, 5));
  return { status: 'FAILED' as const, code: review ? 'REVIEW_REQUIRED' : code, nextAttemptAt: review ? null : new Date(now.getTime() + delay), stop: false };
}

let calendar: { year: number; until: number; dates: string[]; available: boolean } | undefined;
/** Official holiday calendar; unavailable service falls back to night/weekend plus explicit dates. */
export async function publicHolidayDates(now = new Date(), fetcher: typeof fetch = fetch): Promise<string[]> {
  const explicit = (process.env.DART_PUBLIC_HOLIDAYS ?? '').split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
  const year = Number(getSeoulClock(now).dateKey.slice(0, 4));
  if (calendar?.year === year && calendar.until > now.getTime()) return [...new Set([...explicit, ...calendar.dates])];
  const serviceKey = process.env.DATA_GO_KR_SERVICE_KEY?.trim();
  if (!serviceKey) return explicit;
  try {
    const url = new URL('https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo');
    url.search = new URLSearchParams({ serviceKey, solYear: String(year), pageNo: '1', numOfRows: '100', _type: 'json' }).toString();
    const response = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error('Holiday HTTP error');
    const body = await response.json() as { response?: { header?: { resultCode?: string }; body?: { items?: { item?: Array<{ locdate: number; isHoliday: string }> | { locdate: number; isHoliday: string } } } } };
    if (body.response?.header?.resultCode !== '00') throw new Error('Holiday calendar unavailable');
    const item = body.response.body?.items?.item;
    const dates = (Array.isArray(item) ? item : item ? [item] : []).filter(row => row.isHoliday === 'Y').map(row => String(row.locdate).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'));
    calendar = { year, until: now.getTime() + 86_400_000, dates, available: true };
  } catch {
    calendar = { year, until: now.getTime() + 3_600_000, dates: calendar?.year === year ? calendar.dates : [], available: false };
  }
  return [...new Set([...explicit, ...calendar.dates])];
}

export function holidayCalendarStatus(now = new Date()) {
  const year = Number(getSeoulClock(now).dateKey.slice(0,4));
  return calendar?.year === year && calendar.available ? 'AVAILABLE' : process.env.DATA_GO_KR_SERVICE_KEY?.trim() ? 'UNAVAILABLE' : 'NOT_CONFIGURED';
}
