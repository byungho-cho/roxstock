export const collectorLog = (level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}): void => {
  const payload = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields }, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(payload);
};
