export const collectorLog = (level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}): void => {
  const payload = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields }, (key, value) =>
    /token|password|secret|api.?key|service.?key/i.test(key) ? '[redacted]' : typeof value === 'bigint' ? value.toString() : value,
  );
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(payload);
};

