import type { FastifyInstance } from 'fastify';
import { Prisma } from '../generated/prisma/index.js';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/api-error.js';
import { id } from '../lib/input.js';
import { fairPrice, weight, valuation, orderByWeight, mergeStatements, periods, financialRows } from '../domain/value-analysis.js';

type Query = { year?: string; query?: string; mode?: string; startYear?: string; startQuarter?: string; count?: string };
const currentYear = (now=new Date()) => Number(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now).slice(0, 4));
function integer(value: string | undefined, fallback: number, min: number, max: number, name: string) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) throw new ApiError(400, 'INVALID_INPUT', name + ' is invalid.');
  return Number(value);
}
function yearRange(year: number) { return { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }; }
export async function valueAnalysisRoutes(app: FastifyInstance) {
  // Cache slow financial joins briefly; never cache the live price used for W/order.
  const loadFinancials = (year: number, query: string) => prisma.security.findMany({
    where: { isActive: true, ...(query ? { OR: [{ name: { contains: query } }, { symbol: { contains: query } }] } : {}) },
    include: { fundamentals: true,
      financialStatements: {where:{fiscalYear:{lte:year},periodType:'ANNUAL'},orderBy:{fiscalYear:'desc'},take:1},
      dartFinancialFilings: {where:{fiscalYear:{lte:year},periodType:'ANNUAL',isWithdrawn:false},orderBy:[{fiscalYear:'desc'},{receiptDate:'desc'},{collectedAt:'desc'},{receiptNo:'desc'}],take:1},
      valuationMetrics: { where: { metricDate: yearRange(year) }, orderBy: { metricDate: 'desc' }, take: 1 } },
  });
  const cache = new Map<string, { expires: number; result: ReturnType<typeof loadFinancials> }>();
  function financials(year: number, query: string) {
    const key = JSON.stringify([year, query]), existing = cache.get(key);
    if (existing && existing.expires > Date.now()) return existing.result;
    if (cache.size >= 16) cache.delete(cache.keys().next().value!);
    const entry = { expires: Infinity, result: loadFinancials(year, query) };
    cache.set(key, entry);
    void entry.result.then(() => { entry.expires = Date.now() + 60_000; }, () => { if (cache.get(key) === entry) cache.delete(key); });
    return entry.result;
  }
  app.addHook('onClose', async () => { cache.clear(); });
  app.get<{ Querystring: Query }>('/value-analysis', async request => {
    const year = integer(request.query.year, currentYear(), 1900, currentYear(), 'year');
    const query = request.query.query?.trim() ?? '';
    if (query.length > 100) throw new ApiError(400, 'INVALID_INPUT', 'query is too long.');
    // Master securities, including unregistered companies. One result fixes the full navigation/order snapshot.
    const [securities, live] = await Promise.all([
      financials(year, query),
      prisma.security.findMany({
        where: { isActive: true, ...(query ? { OR: [{ name: { contains: query } }, { symbol: { contains: query } }] } : {}) },
        select: { id: true, marketPrice: true },
      }),
    ]);
    const prices = new Map(live.map(row => [row.id.toString(), row.marketPrice]));
    const rows = orderByWeight(securities.filter(security => prices.has(security.id.toString())).map(security => {
      const marketPrice = prices.get(security.id.toString());
      const metric = valuation(security.valuationMetrics[0]), price = marketPrice?.currentPrice.toString() ?? null;
      const annual=mergeStatements(security.financialStatements??[],security.dartFinancialFilings??[]).sort((a,b)=>b.fiscalYear-a.fiscalYear)[0];
      const fundamentals=security.fundamentals;
      // Fundamentals has no historical versions. Never associate a later edit with an earlier reference year.
      const issuedShares=fundamentals&&currentYear(fundamentals.updatedAt)===year?fundamentals.issuedShares?.toString()??null:null;
      return { id: security.id.toString(), symbol: security.symbol, name: security.name, currentPrice: price,
        previousClosePrice: marketPrice?.previousClosePrice?.toString() ?? null, priceUpdatedAt: marketPrice?.priceUpdatedAt.toISOString() ?? null,
        per: metric?.per ?? null, pbr: metric?.pbr ?? null, roe: metric?.roe ?? null, metricDate: metric?.metricDate ?? null, w: weight(metric, price),
        eps:metric?.eps??null,issuedShares,capital:annual?.totalEquity??null,capitalYear:annual?.fiscalYear??null,requiredReturn:'8.0',
        excessEarnings:null,shareholderValue:null,fundamentalsUpdatedAt:fundamentals?.updatedAt.toISOString()??null,
        fairPrices:['0.7','0.8','0.9','1.0'].map(persistence=>({persistence,price:fairPrice(metric,persistence)})),
        notices:['초과이익·주주가치: 총액 집계 기준이 미확정되어 —로 표시합니다.','발행주식수: 기준연도에 저장된 현재 필드만 표시하며 과거 버전은 보관되지 않습니다.'] };
    }));
    return { data: { rows, total: rows.length, year, query, timezone: 'Asia/Seoul', metricBasis: 'LATEST_STORED_DATE_WITHIN_YEAR' } };
  });
  app.get<{ Params: { id: string }; Querystring: Query }>('/value-analysis/:id', async request => {
    const securityId = id(request.params.id, 'id'), year = integer(request.query.year, currentYear(), 1900, currentYear(), 'year');
    const mode = request.query.mode ?? 'annual';
    if (mode !== 'annual' && mode !== 'quarter') throw new ApiError(400, 'INVALID_INPUT', 'mode is invalid.');
    const startYear = integer(request.query.startYear, Math.max(1900, year - 2), 1900, currentYear(), 'startYear');
    const quarter = mode === 'annual' ? null : integer(request.query.startQuarter, 1, 1, 4, 'startQuarter');
    const count = integer(request.query.count, 3, 1, 10, 'count'), selected = periods(startYear, quarter, count);
    const last = selected[selected.length - 1]!.year;
    return prisma.$transaction(async tx => {
      const security = await tx.security.findUnique({ where: { id: securityId }, include: { marketPrice: true, fundamentals: true } });
      if (!security?.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
      const fromYear = Math.min(startYear - 1, year - 1), toYear = Math.max(last, year);
      const [manual, filings, metrics] = await Promise.all([
        tx.financialStatement.findMany({ where: { securityId, fiscalYear: { gte: fromYear, lte: toYear } }, orderBy: [{ fiscalYear: 'desc' }, { periodType: 'desc' }] }),
        tx.dartFinancialFiling.findMany({ where: { securityId, isWithdrawn: false, fiscalYear: { gte: fromYear, lte: toYear } }, orderBy: [{ fiscalYear: 'desc' }, { periodType: 'desc' }, { receiptDate: 'desc' }, { collectedAt: 'desc' }, { receiptNo: 'desc' }] }),
        tx.valuationMetric.findMany({ where: { securityId, metricDate: { gte: new Date(Date.UTC(fromYear, 0, 1)), lt: new Date(Date.UTC(toYear + 1, 0, 1)) } }, orderBy: { metricDate: 'desc' } }),
      ]);
      const statements = mergeStatements(manual, filings), annual = statements.filter(row => row.periodType === 'ANNUAL' && row.fiscalYear <= year).sort((a, b) => b.fiscalYear - a.fiscalYear)[0];
      const metric = valuation(metrics.find(row => row.metricDate.getUTCFullYear() === year)), price = security.marketPrice?.currentPrice.toString() ?? null;
      return { data: {
        security: { id: security.id.toString(), symbol: security.symbol, name: security.name, currentPrice: price, previousClosePrice: security.marketPrice?.previousClosePrice?.toString() ?? null, priceUpdatedAt: security.marketPrice?.priceUpdatedAt.toISOString() ?? null },
        issuedShares: security.fundamentals && currentYear(security.fundamentals.updatedAt)===year ? security.fundamentals.issuedShares?.toString()??null : null,
        year, valuation: metric, w: weight(metric, price), fairPrices: ['0.7', '0.8', '0.9', '1.0'].map(persistence => ({ persistence, price: fairPrice(metric, persistence) })),
        requiredReturn: '8.0', equity: annual?.totalEquity ?? null, closingDate: annual?.periodEndDate ?? null,
        rows: financialRows(selected, statements, metrics), mode, startYear, startQuarter: quarter, count,
        notices: ['유동비율: 유동자산·유동부채 저장 필드가 없어 미수집입니다.', '가치지표는 해당 기간의 마지막 저장 기준일 값이며 분기 연환산을 새로 계산하지 않습니다.', '성장률은 동일 결산 구분의 전년 동기 대비이며 비교 기준이 없거나 0 이하면 계산하지 않습니다.'],
      } };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  });
}
