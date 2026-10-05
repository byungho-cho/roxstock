const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

export interface SeoulClock {
  dateKey: string;
  hour: number;
  minute: number;
}

export const getSeoulClock = (date = new Date()): SeoulClock => {
  const shifted = new Date(date.getTime() + SEOUL_OFFSET_MS);
  return {
    dateKey: shifted.toISOString().slice(0, 10),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
};

export const toDatabaseDate = (dateKey: string): Date => new Date(`${dateKey}T00:00:00.000Z`);

export const isHourInOvernightWindow = (hour: number, startHour: number, endHour: number): boolean =>
  startHour <= endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;

export const priceScheduleKey = (date: Date, intervalMinutes: number): string => {
  const clock = getSeoulClock(date);
  const bucket = Math.floor((clock.hour * 60 + clock.minute) / intervalMinutes);
  return `${clock.dateKey}:${bucket}`;
};

export const snapshotScheduleKey = (date: Date): string => {
  const clock = getSeoulClock(date);
  return `${clock.dateKey}:${clock.hour}`;
};
