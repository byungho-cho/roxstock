/** Coalesce same-turn reads. Each caller keeps independent cancellation and error handling. */
import {csrfToken} from '../auth/client';
type Entry = {
  path: string;
  signal?: AbortSignal | null;
  resolve: (response: Response) => void;
  reject: (error: unknown) => void;
  settled: boolean;
  cleanup: () => void;
  cancelBatch?: () => void;
};
type Part = { status: number; body: unknown };
let queue: Entry[] = [];
let scheduled = false;
let legacy = false;
// Mirrors the server's read-only allowlist; unknown/new endpoints remain direct.
const allowed = [
  /^\/accounts\/\d+\/stock-news(?:\/\d+)?$/,
  /^\/accounts$/,
  /^\/accounts\/\d+\/(dashboard|holdings|asset-history|investment-capital|investment-baseline|investment-profit|trades|buy-lots|recent-buys|target-arrivals|target-arrival-conditions|cash-overview|cash-transactions|daily-position-profit|compound-plans|data-state)$/,
  /^\/accounts\/\d+\/cash-transactions\/\d+$/,
  /^\/(securities|security-management|financial-statements|value-analysis)$/,
  /^\/(financial-statements|value-analysis|security-management)\/\d+$/,
  /^\/securities\/\d+\/(analysis|annual-estimates)$/,
  /^\/(buy-trades|sell-trades)\/\d+$/,
  /^\/collection\/(status|monitoring|settings)$/,
  /^\/collection\/monitoring\/[a-z-]+(?:\/(runs|items))?$/,
];
const abortError = () => new DOMException('The operation was aborted.', 'AbortError');

export function fetchRead(path: string, init: RequestInit): Promise<Response> {
  // Keep custom fetch semantics, writes, bootstrap APIs and streaming/status controls direct.
  if (legacy || path.length > 2048 || !allowed.some(pattern => pattern.test(path.split('?')[0])) ||
      Object.keys(init).some(key => !['signal', 'method'].includes(key)) || (init.method ?? 'GET').toUpperCase() !== 'GET') {
    return fetch(`/api${path}`, init);
  }
  if (init.signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const entry: Entry = { path, signal: init.signal, resolve, reject, settled: false, cleanup: () => {} };
    const abort = () => { finish(entry, abortError()); entry.cancelBatch?.(); };
    entry.cleanup = () => init.signal?.removeEventListener('abort', abort);
    init.signal?.addEventListener('abort', abort, { once: true });
    queue.push(entry);
    if (!scheduled) { scheduled = true; queueMicrotask(flush); }
  });
}

function finish(entry: Entry, error?: unknown, response?: Response) {
  if (entry.settled) return;
  entry.settled = true;
  entry.cleanup();
  if (response) entry.resolve(response); else entry.reject(error);
}

function flush() {
  scheduled = false;
  const pending = queue.filter(entry => !entry.settled);
  queue = [];
  for (let offset = 0; offset < pending.length; offset += 8) void send(pending.slice(offset, offset + 8));
}

async function send(entries: Entry[]) {
  const controller = new AbortController();
  for (const entry of entries) entry.cancelBatch = () => { if (entries.every(item => item.settled)) controller.abort(); };
  const paths = [...new Set(entries.map(entry => entry.path))];
  try {
    const response = await fetch('/api/pages/read', { method: 'POST', headers: { 'Content-Type': 'application/json','X-CSRF-Token':csrfToken() }, body: JSON.stringify({ paths }), signal: controller.signal });
    if (response.status === 404) {
      legacy = true;
      // Rolling deployment/rollback: retry only reads, never conceal a 5xx or network error.
      await Promise.all(entries.map(async entry => {
        if (entry.settled) return;
        try { finish(entry, undefined, await fetch(`/api${entry.path}`, { signal: entry.signal })); }
        catch (error) { finish(entry, error); }
      }));
      return;
    }
    if (!response.ok) {
      const body = await response.text();
      for (const entry of entries) finish(entry, undefined, new Response(body, { status: response.status }));
      return;
    }
    const payload = await response.json() as { data?: Part[] };
    if (!Array.isArray(payload.data) || payload.data.length !== paths.length || payload.data.some(part => !part || !Number.isInteger(part.status) || part.status < 200 || part.status > 599 || !('body' in part))) throw new Error('조회 묶음 API 응답이 올바르지 않습니다.');
    for (const entry of entries) {
      const part = payload.data[paths.indexOf(entry.path)];
      finish(entry, undefined, new Response(part.status === 204 ? null : JSON.stringify(part.body), { status: part.status, headers: { 'Content-Type': 'application/json' } }));
    }
  } catch (error) { for (const entry of entries) finish(entry, error); }
}
