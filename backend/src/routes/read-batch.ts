import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { PageCache } from '../domain/page-cache.js';
import { withReadScope } from '../domain/read-scope.js';
import { ApiError } from '../lib/api-error.js';
import { realtimePriceCache } from '../realtime/price-cache.js';

const endpoint = '/api/pages/read';
const allowed = [
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
export function readPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048 || /[#\\\r\n]/.test(value)) throw new ApiError(400, 'INVALID_READ_BATCH', 'Invalid read path.');
  const path = value.split('?')[0]!;
  if (!allowed.some(pattern => pattern.test(path))) throw new ApiError(400, 'INVALID_READ_BATCH', 'Only approved read endpoints are allowed.');
  const query = new URLSearchParams(value.slice(path.length + 1));
  query.sort();
  return path + (query.size ? `?${query}` : '');
}

export function installReadBatch(app: FastifyInstance) {
  const ordinary = new PageCache(10_000, 96);
  const monitoring = new PageCache(2_000, 32);
  const clear = () => { ordinary.clear(); monitoring.clear(); };
  const unsubscribe = realtimePriceCache.subscribe(clear);
  app.addHook('onClose', async () => { unsubscribe(); clear(); });
  app.addHook('onSend', async (request, _reply, payload) => {
    if (request.routeOptions.url !== endpoint && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) clear();
    return payload;
  });
  app.post<{ Body: { paths: string[] } }>(endpoint, { bodyLimit: 20_000 }, async (request, reply) => {
    if (!Array.isArray(request.body?.paths) || !request.body.paths.length || request.body.paths.length > 8) throw new ApiError(400, 'INVALID_READ_BATCH', 'Provide 1–8 read paths.');
    const paths = request.body.paths.map(readPath);
    // Propagate caller identity through normal route hooks, and isolate cache entries by it.
    const headers: Record<string, string> = {};
    for (const key of ['authorization', 'cookie', 'accept-language', 'origin']) {
      const value = request.headers[key];
      if (typeof value === 'string') headers[key] = value;
    }
    const identity = createHash('sha256').update(JSON.stringify(headers)).digest('hex');
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
    const data = await withReadScope(() => Promise.all(paths.map(async path => {
      const cache = path.startsWith('/collection/') ? monitoring : ordinary;
      const key = JSON.stringify([identity, day, path]);
      const result = await cache.get(key, async () => {
        // Fastify dispatches in process: no HTTP connection or extra network round trip.
        const response = await app.inject({ method: 'GET', url: `/api${path}`, headers, remoteAddress: request.ip });
        return { status: response.statusCode, body: response.json() as unknown };
      });
      // Error/oversized responses never persist in the cache. Max retained payload ≈64 MiB.
      if (result.value.status !== 200 || Buffer.byteLength(JSON.stringify(result.value.body)) > 512 * 1024) cache.delete(key);
      return { ...result.value, cache: result.status };
    })));
    reply.header('Cache-Control', 'private, no-store');
    return { data };
  });
}
