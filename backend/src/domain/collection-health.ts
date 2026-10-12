import {getSeoulClock} from '../collector/time.js';

export function skipKind(message: string | null | undefined) {
  if (message?.startsWith('사용자 설정:') || message?.startsWith('Z99 코드:')) return 'EXCLUDED';
  if (message === 'another execution holds the collector lock') return 'LOCK_CONFLICT';
  if (message === 'requested symbol is not an active security') return 'INACTIVE';
  if (message?.startsWith('종목코드 또는 수집 설정 변경:')) return 'IDENTITY_CHANGED';
  return 'UNKNOWN';
}

export function dailyScheduleHealth(now: Date, hours: number[], run: {startedAt: Date; status: string} | null, graceMinutes: number, maxMinutes: number) {
  const today = Date.parse(`${getSeoulClock(now).dateKey}T00:00:00+09:00`);
  const slots = [-1, 0, 1].flatMap(day => hours.map(hour => today + day * 86400000 + hour * 3600000)).sort((a,b) => a-b);
  const due = slots.filter(at => at <= now.getTime()).at(-1)!;
  const next = slots.find(at => at > now.getTime())!;
  const longRunning = run?.status === 'RUNNING' && now.getTime() - run.startedAt.getTime() > maxMinutes * 60000;
  const missed = (!run || run.startedAt.getTime() < due) && now.getTime() > due + graceMinutes * 60000;
  return {status: longRunning || missed ? 'DELAYED' : run?.status === 'RUNNING' ? 'RUNNING' : 'WAITING',
    reason: longRunning ? '실행 제한 시간 초과' : missed ? '예정 회차 시작 누락' : null,
    dueAt: new Date(due).toISOString(), nextAt: new Date(next).toISOString(), graceMinutes, maxMinutes};
}

export function priceRunResult(counters: {success:number;failed:number;stale:number;skipped:number}, excluded: number) {
  if (counters.failed === 0 && counters.stale === 0 && counters.skipped === excluded && counters.success + excluded > 0) return 'SUCCESS';
  if (counters.success > 0) return 'PARTIAL';
  return counters.failed > 0 ? 'FAILED' : 'SKIPPED';
}
