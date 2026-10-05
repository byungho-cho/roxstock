import type { FastifyInstance } from 'fastify';
import { Prisma, type MarketType, type WatchlistType } from '../generated/prisma/index.js';

import { ApiError } from '../lib/api-error.js';
import { parseManualRefresh } from '../collector/dart-manual-refresh.js';
import { id, optionalMemo } from '../lib/input.js';
import { prisma } from '../lib/prisma.js';
import { serializable } from '../lib/transaction.js';
import { manualClassification, requireActiveAccount } from '../domain/classification.js';
import { calculateRemainingQuantity } from '../domain/trade.js';

type SecurityQuery = { accountId?: string; registeredOnly?: string; query?: string; marketType?: string; listType?: string; excludeRegistered?: string; limit?: string; offset?: string };
type WatchlistBody = { accountId?: unknown; securityId?: unknown; listType?: unknown; targetBuyPrice?: unknown; priority?: unknown; memo?: unknown };
type WatchlistParams = { id: string };
type SecurityParams = { id: string };
type DirectSecurityBody = { accountId?: unknown; symbol?: unknown; name?: unknown; marketType?: unknown; listType?: unknown; listingYear?: unknown };
type PriceBody = { currentPrice?: unknown };
type AnalysisBody = { accountId?: unknown; operatingProfit?: unknown; controllingProfit?: unknown; issuedShares?: unknown; treasuryShares?: unknown; assets?: unknown; liabilities?: unknown; equity?: unknown; previousEquity?: unknown; dividend?: unknown; memo?: unknown };

const marketTypes = new Set<MarketType>(['KOSPI', 'KOSDAQ', 'KONEX', 'OTHER']);


const queryText = (value: string | undefined) => {
  const result = value?.trim() ?? '';
  if (result.length > 100) throw new ApiError(400, 'INVALID_INPUT', 'query must be at most 100 characters.');
  return result;
};

const marketType = (value: string | undefined): MarketType | undefined => {
  if (!value) return undefined;
  if (!marketTypes.has(value as MarketType)) throw new ApiError(400, 'INVALID_INPUT', 'marketType is invalid.');
  return value as MarketType;
};

const listTypeFilter = (value: string | undefined): WatchlistType | undefined => {
  if (!value) return undefined;
  if (!['WATCHLIST', 'HOLDING', 'RECOMMENDED'].includes(value)) throw new ApiError(400, 'INVALID_INPUT', 'listType is invalid.');
  return value as WatchlistType;
};


const optionalPrice = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) {
    throw new ApiError(400, 'INVALID_INPUT', 'targetBuyPrice must be a non-negative decimal string or null.');
  }
  return new Prisma.Decimal(value);
};

const optionalPriority = (value: unknown) => {
  if (value === undefined) return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new ApiError(400, 'INVALID_INPUT', 'priority must be an integer between 0 and 65535.');
  }
  return value;
};

const pageNumber = (value: string | undefined, name: string, fallback: number, maximum: number) => {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new ApiError(400, 'INVALID_INPUT', `${name} must be a non-negative integer.`);
  const parsed = Number(value);
  if (parsed > maximum) throw new ApiError(400, 'INVALID_INPUT', `${name} must not exceed ${maximum}.`);
  return parsed;
};

const serializeSecurity = (security: {
  id: bigint; listingYear?: number | null; symbol: string; name: string; marketType: MarketType; securityType: string;
  watchlistItem: { id: bigint; listType: WatchlistType; targetBuyPrice: Prisma.Decimal | null; priority: number; memo: string | null } | null;
  marketPrice: { currentPrice: Prisma.Decimal; previousClosePrice: Prisma.Decimal | null; priceUpdatedAt: Date } | null;
}) => ({
  id: security.id.toString(),
  symbol: security.symbol,
  name: security.name,
  listingYear: security.listingYear ?? null,
  marketType: security.marketType,
  securityType: security.securityType,
  listType: security.watchlistItem?.listType ?? null,
  watchlistItemId: security.watchlistItem?.id.toString() ?? null,
  targetBuyPrice: security.watchlistItem?.targetBuyPrice?.toString() ?? null,
  priority: security.watchlistItem?.priority ?? null,
  memo: security.watchlistItem?.memo ?? null,
  currentPrice: security.marketPrice?.currentPrice.toString() ?? null,
  previousClosePrice: security.marketPrice?.previousClosePrice?.toString() ?? null,
  priceUpdatedAt: security.marketPrice?.priceUpdatedAt.toISOString() ?? null,
});

const serializeMetrics = (metric: {
  metricDate: Date; eps: Prisma.Decimal | null; bps: Prisma.Decimal | null;
  per: Prisma.Decimal | null; pbr: Prisma.Decimal | null; roe: Prisma.Decimal | null;
  dividendPerShare: Prisma.Decimal | null; dividendYield: Prisma.Decimal | null; marketCap: Prisma.Decimal | null;
} | null) => metric && ({
  metricDate: metric.metricDate.toISOString().slice(0, 10),
  eps: metric.eps?.toString() ?? null, bps: metric.bps?.toString() ?? null,
  per: metric.per?.toString() ?? null, pbr: metric.pbr?.toString() ?? null,
  roe: metric.roe?.toString() ?? null, dividendPerShare: metric.dividendPerShare?.toString() ?? null,
  dividendYield: metric.dividendYield?.toString() ?? null, marketCap: metric.marketCap?.toString() ?? null,
});

export async function securityRoutes(app: FastifyInstance) {
  app.patch<{ Params: SecurityParams; Body: AnalysisBody }>('/securities/:id/analysis', async (request) => {
    const securityId = id(request.params.id, 'id');
    const security = await prisma.security.findUnique({ where: { id: securityId } });
    if (!security || !security.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
    const body = request.body ?? {};
    const decimal = (key: keyof AnalysisBody) => {
      const value = body[key];
      if (value === undefined) return undefined;
      if (value === null || value === '') return null;
      if (typeof value !== 'string' || !/^-?\d+$/.test(value)) throw new ApiError(400, 'INVALID_INPUT', `${key} must be an integer string or null.`);
      return new Prisma.Decimal(value);
    };
    const operatingProfit = decimal('operatingProfit');
    const assets = decimal('assets');
    const liabilities = decimal('liabilities');
    const equity = decimal('equity');
    const dividend = decimal('dividend');
    const controllingProfit = decimal('controllingProfit');
    const issuedShares = decimal('issuedShares');
    const treasuryShares = decimal('treasuryShares');
    const previousEquity = decimal('previousEquity');
    await prisma.$transaction(async (tx) => {
      if (body.memo !== undefined) {
        const accountId = id(body.accountId, 'accountId');
        await requireActiveAccount(tx, accountId);
        await tx.accountWatchlistItem.updateMany({ where: { accountId, securityId }, data: { memo: optionalMemo(body.memo) } });
      }
      if ([operatingProfit, assets, liabilities, equity].some((value) => value !== undefined)) {
        const year = new Date().getUTCFullYear();
        await tx.financialStatement.upsert({
          where: { securityId_fiscalYear_periodType: { securityId, fiscalYear: year, periodType: 'ANNUAL' } },
          create: { securityId, fiscalYear: year, periodType: 'ANNUAL', periodEndDate: new Date(Date.UTC(year, 11, 31)), operatingProfit, totalAssets: assets, totalLiabilities: liabilities, totalEquity: equity },
          update: { operatingProfit, totalAssets: assets, totalLiabilities: liabilities, totalEquity: equity },
        });
      }
      if (dividend !== undefined) {
        const today = new Date(); today.setUTCHours(0, 0, 0, 0);
        const latest = await tx.valuationMetric.findFirst({ where: { securityId }, orderBy: { metricDate: 'desc' } });
        await tx.valuationMetric.upsert({
          where: { securityId_metricDate: { securityId, metricDate: today } },
          create: { securityId, metricDate: today, eps: latest?.eps, bps: latest?.bps, per: latest?.per, pbr: latest?.pbr, roe: latest?.roe, dividendYield: latest?.dividendYield, marketCap: latest?.marketCap, dividendPerShare: dividend },
          update: { dividendPerShare: dividend },
        });
      }
      if ([controllingProfit, issuedShares, treasuryShares, previousEquity].some((value) => value !== undefined)) {
        await tx.securityFundamentals.upsert({
          where: { securityId },
          create: { securityId, controllingProfit, issuedShares, treasuryShares, previousEquity },
          update: { controllingProfit, issuedShares, treasuryShares, previousEquity },
        });
      }
      if ([controllingProfit, issuedShares, treasuryShares, previousEquity, equity, dividend].some((value) => value !== undefined)) {
        const [fundamentals, annual, price, latest] = await Promise.all([
          tx.securityFundamentals.findUnique({ where: { securityId } }),
          tx.financialStatement.findFirst({ where: { securityId, periodType: 'ANNUAL' }, orderBy: { fiscalYear: 'desc' } }),
          tx.marketPrice.findUnique({ where: { securityId } }),
          tx.valuationMetric.findFirst({ where: { securityId }, orderBy: { metricDate: 'desc' } }),
        ]);
        const shares = fundamentals?.issuedShares?.minus(fundamentals.treasuryShares ?? 0);
        const bps = shares?.gt(0) && annual?.totalEquity ? annual.totalEquity.div(shares) : null;
        const eps = shares?.gt(0) && fundamentals?.controllingProfit ? fundamentals.controllingProfit.div(shares) : null;
        const prior = fundamentals?.previousEquity;
        const averageEquity = annual?.totalEquity && prior ? annual.totalEquity.plus(prior).div(2) : annual?.totalEquity;
        const roe = averageEquity?.gt(0) && fundamentals?.controllingProfit ? fundamentals.controllingProfit.div(averageEquity).mul(100) : null;
        const current = price?.currentPrice;
        const today = new Date(); today.setUTCHours(0, 0, 0, 0);
        const calculated = {
          eps, bps, roe,
          per: current && eps?.gt(0) ? current.div(eps) : null,
          pbr: current && bps?.gt(0) ? current.div(bps) : null,
          dividendYield: current?.gt(0) && latest?.dividendPerShare ? latest.dividendPerShare.div(current).mul(100) : null,
        };
        await tx.valuationMetric.upsert({
          where: { securityId_metricDate: { securityId, metricDate: today } },
          create: { securityId, metricDate: today, ...calculated, dividendPerShare: latest?.dividendPerShare ?? null },
          update: calculated,
        });
      }
    });
    return { data: { updated: true } };
  });

  app.get<{ Params: SecurityParams; Querystring: { fiscalYear?: string; accountId?: string } }>('/securities/:id/analysis', async (request) => {
    const securityId = id(request.params.id, 'id');
    const security = await prisma.security.findUnique({ where: { id: securityId }, include: { marketPrice: true, watchlistItem: true } });
    if (!security || !security.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
    const accountId = request.query.accountId === undefined ? undefined : id(request.query.accountId, 'accountId');
    if (accountId !== undefined) await requireActiveAccount(prisma, accountId);
    const manual = accountId === undefined ? null : await prisma.accountWatchlistItem.findUnique({ where: { accountId_securityId: { accountId, securityId } } });
    const fiscalYear = request.query.fiscalYear === undefined ? undefined : parseManualRefresh({ fiscalYear: Number(request.query.fiscalYear), period: 'ANNUAL' }).fiscalYear;
    const [metrics, manualStatements, dartFilings, fundamentals] = await Promise.all([
      prisma.valuationMetric.findMany({ where: { securityId }, orderBy: { metricDate: 'desc' }, take: 2 }),
      prisma.financialStatement.findMany({ where: { securityId, ...(fiscalYear === undefined ? {} : { fiscalYear }) }, orderBy: [{ fiscalYear: 'desc' }, { periodType: 'desc' }], take: 24 }),
      prisma.dartFinancialFiling.findMany({ where: { securityId, isWithdrawn: false, ...(fiscalYear === undefined ? {} : { fiscalYear }) }, orderBy: [{ fiscalYear: 'desc' }, { periodType: 'desc' }, { receiptDate: 'desc' }, { collectedAt: 'desc' }], take: 40 }),
      prisma.securityFundamentals.findUnique({ where: { securityId } }),
    ]);
    const manualByPeriod = new Map(manualStatements.map((item) => [`${item.fiscalYear}:${item.periodType}`, item]));
    const filingByPeriod = new Map<string, typeof dartFilings[number]>();
    for (const filing of dartFilings) {
      const key = `${filing.fiscalYear}:${filing.periodType}`;
      if (!filingByPeriod.has(key)) filingByPeriod.set(key, filing);
    }
    const periodKeys = new Set([...manualByPeriod.keys(), ...filingByPeriod.keys()]);
    for (const annual of dartFilings.filter((item) => item.periodType === 'ANNUAL')) {
      const q3 = filingByPeriod.get(`${annual.fiscalYear}:Q3`);
      if (q3 && q3.fsDivision === annual.fsDivision) periodKeys.add(`${annual.fiscalYear}:Q4`);
    }
    const statements = [...periodKeys].map((key) => {
      const [yearString, periodType] = key.split(':');
      const fiscalYear = Number(yearString);
      const manual = manualByPeriod.get(key);
      const filing = filingByPeriod.get(key);
      const annual = periodType === 'Q4' ? filingByPeriod.get(`${fiscalYear}:ANNUAL`) : undefined;
      const q3 = periodType === 'Q4' ? filingByPeriod.get(`${fiscalYear}:Q3`) : undefined;
      const dec = (value: { toString(): string } | null | undefined) => value?.toString() ?? null;
      const d = (value: unknown) => value === null || value === undefined ? null : String(value);
      const derived = (annualValue: unknown, q3Value: unknown) => {
        if (annualValue === null || annualValue === undefined || q3Value === null || q3Value === undefined) return null;
        try { return (BigInt(String(annualValue)) - BigInt(String(q3Value))).toString(); } catch { return null; }
      };
      const dartValue = (field: string) => {
        if (periodType === 'Q4' && annual && q3 && annual.fsDivision === q3.fsDivision) {
          const ytdKey = field === 'revenue' ? 'revenueYtd' : field === 'operatingProfit' ? 'operatingProfitYtd' : field === 'netIncome' ? 'netIncomeYtd' : field === 'operatingCashFlow' ? 'operatingCashFlowYtd' : 'capitalExpenditureYtd';
          return derived((annual as any)[ytdKey]?.toString(), (q3 as any)[ytdKey]?.toString());
        }
        if (!filing) return null;
        const ytd = periodType === 'ANNUAL';
        const suffix = ytd ? 'Ytd' : 'Quarter';
        const prop = field === 'totalAssets' || field === 'totalLiabilities' || field === 'totalEquity' ? field : `${field}${suffix}`;
        return d((filing as any)[prop]?.toString());
      };
      const periodEndDate = manual?.periodEndDate ?? filing?.periodEndDate ?? (annual && periodType === 'Q4' ? annual.periodEndDate : null);
      return { fiscalYear, periodType, periodEndDate: periodEndDate?.toISOString().slice(0, 10) ?? `${fiscalYear}-12-31`,
        revenue: dec(manual?.revenue) ?? dartValue('revenue'), operatingProfit: dec(manual?.operatingProfit) ?? dartValue('operatingProfit'), netIncome: dec(manual?.netIncome) ?? dartValue('netIncome'),
        totalAssets: dec(manual?.totalAssets) ?? dartValue('totalAssets'), totalLiabilities: dec(manual?.totalLiabilities) ?? dartValue('totalLiabilities'), totalEquity: dec(manual?.totalEquity) ?? dartValue('totalEquity'),
        operatingCashFlow: dec(manual?.operatingCashFlow) ?? dartValue('operatingCashFlow'), capitalExpenditure: dec(manual?.capitalExpenditure) ?? dartValue('capitalExpenditure'),
        source: manual ? 'MANUAL_WITH_DART_FALLBACK' : filing || annual ? 'OPEN_DART' : 'MANUAL', isDerived: periodType === 'Q4' && !manual && Boolean(annual && q3 && annual.fsDivision === q3.fsDivision),
        dartSource: filing ? { receiptNo: filing.receiptNo, reportName: filing.reportName, fsDivision: filing.fsDivision, collectedAt: filing.collectedAt.toISOString(), source: filing.source } : annual && q3 ? { receiptNo: annual.receiptNo, reportName: annual.reportName, fsDivision: annual.fsDivision, collectedAt: annual.collectedAt.toISOString(), source: 'OPEN_DART_Q4_DERIVED_FROM_YTD' } : null };
    }).sort((a, b) => b.fiscalYear - a.fiscalYear || String(b.periodType).localeCompare(String(a.periodType))).slice(0, 24);
    return { data: {
      security: serializeSecurity({ ...security, watchlistItem: manual }),
      valuation: serializeMetrics(metrics[0] ?? null),
      previousValuation: serializeMetrics(metrics[1] ?? null),
      fundamentals: fundamentals && {
        controllingProfit: fundamentals.controllingProfit?.toString() ?? null,
        issuedShares: fundamentals.issuedShares?.toString() ?? null,
        treasuryShares: fundamentals.treasuryShares?.toString() ?? null,
        previousEquity: fundamentals.previousEquity?.toString() ?? null,
      },
      statements,
    } };
  });

  app.post<{ Body: DirectSecurityBody }>('/securities', async (request, reply) => {
    const body = request.body ?? {};
    const accountId = id(body.accountId, 'accountId');
    const symbol = typeof body.symbol === 'string' ? body.symbol.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!/^\d{6}$/.test(symbol) || !name || name.length > 100) throw new ApiError(400, 'INVALID_INPUT', 'A six-digit symbol and name are required.');
    const selectedMarket = marketType(body.marketType as string) ?? 'OTHER';
    const selectedList = manualClassification(body.listType);
    const listingYear = body.listingYear === undefined ? undefined : Number(body.listingYear);
    if (listingYear !== undefined && (!Number.isInteger(listingYear) || listingYear < 1900 || listingYear > new Date().getFullYear())) throw new ApiError(400, 'INVALID_LISTING_YEAR', '상장연도는 1900년부터 올해까지 입력하세요.');
    const result = await serializable(async tx => {
      await requireActiveAccount(tx, accountId);
      const existing = await tx.security.findFirst({ where: { symbol } });
      if (existing) throw new ApiError(409, 'SECURITY_ALREADY_EXISTS', '이미 등록된 종목입니다. 검색에서 분류를 선택하세요.');
      const security = await tx.security.create({ data: { symbol, name, marketType: selectedMarket, listingYear } });
      const item = await tx.accountWatchlistItem.create({ data: { accountId, securityId: security.id, listType: selectedList } });
      return serializeSecurity({ ...security, marketPrice: null, watchlistItem: item });
    });
    return reply.code(201).send({ data: result });
  });

  app.patch<{ Params: SecurityParams; Body: PriceBody }>('/securities/:id/price', async (request) => {
    const securityId = id(request.params.id, 'id');
    const currentPrice = optionalPrice(request.body?.currentPrice);
    if (!currentPrice || currentPrice.lte(0)) throw new ApiError(400, 'INVALID_INPUT', 'currentPrice must be positive.');
    const security = await prisma.security.findUnique({ where: { id: securityId } });
    if (!security || !security.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', 'Security not found.');
    const previous = await prisma.marketPrice.findUnique({ where: { securityId } });
    const marketPrice = await prisma.marketPrice.upsert({
      where: { securityId },
      create: { securityId, currentPrice, previousClosePrice: previous?.previousClosePrice ?? null, priceUpdatedAt: new Date() },
      update: { currentPrice, priceUpdatedAt: new Date() },
    });
    const latest = await prisma.valuationMetric.findFirst({ where: { securityId }, orderBy: { metricDate: 'desc' } });
    if (latest) {
      await prisma.valuationMetric.update({ where: { id: latest.id }, data: {
        per: latest.eps?.gt(0) ? currentPrice.div(latest.eps) : null,
        pbr: latest.bps?.gt(0) ? currentPrice.div(latest.bps) : null,
        dividendYield: latest.dividendPerShare ? latest.dividendPerShare.div(currentPrice).mul(100) : null,
      } });
    }
    return { data: { currentPrice: marketPrice.currentPrice.toString(), previousClosePrice: marketPrice.previousClosePrice?.toString() ?? null, priceUpdatedAt: marketPrice.priceUpdatedAt.toISOString() } };
  });

  app.get<{ Querystring: SecurityQuery }>('/securities', async (request) => {
    const search = queryText(request.query.query);
    const selectedMarket = marketType(request.query.marketType);
    const accountId = request.query.accountId ? id(request.query.accountId, 'accountId') : undefined;
    const selectedList = request.query.listType === 'TRADED' ? 'TRADED' : listTypeFilter(request.query.listType);
    const excludeRegistered = request.query.excludeRegistered === 'true';
    const registeredOnly = request.query.registeredOnly === 'true';
    for (const key of ['excludeRegistered', 'registeredOnly'] as const) {
      if (request.query[key] && !['true', 'false'].includes(request.query[key]!)) throw new ApiError(400, 'INVALID_INPUT', `${key} must be true or false.`);
    }
    if (selectedList && excludeRegistered) throw new ApiError(400, 'INVALID_INPUT', 'listType and excludeRegistered cannot be combined.');
    if ((selectedList || excludeRegistered || registeredOnly) && !accountId) throw new ApiError(400, 'ACCOUNT_REQUIRED', '계좌를 선택하세요.');
    if (accountId) await requireActiveAccount(prisma, accountId);
    const lots = accountId ? await prisma.buyTrade.findMany({
      where: { accountId }, select: { securityId: true, quantity: true, sellTrades: { select: { quantity: true } } },
    }) : [];
    const remainingById = new Map<string, Prisma.Decimal>();
    for (const lot of lots) {
      const key = lot.securityId.toString();
      remainingById.set(key, (remainingById.get(key) ?? new Prisma.Decimal(0)).plus(calculateRemainingQuantity(lot.quantity, lot.sellTrades.map(s => s.quantity))));
    }
    const where: Prisma.SecurityWhereInput = {
      isActive: true,
      ...(selectedMarket && { marketType: selectedMarket }),
      ...(registeredOnly && { OR: [{ accountWatchlistItems: { some: { accountId } } }, { buyTrades: { some: { accountId } } }] }),
      ...(search && { AND: [{ OR: [{ symbol: { contains: search.replace(/^A(?=\d{6}$)/i, '') } }, { name: { contains: search } }] }] }),
    };
    const securities = await prisma.security.findMany({
      where, include: { marketPrice: true, accountWatchlistItems: { where: { accountId: accountId ?? 0n } } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    const classified = securities.map(security => {
      const manual = security.accountWatchlistItems[0] ?? null;
      const remaining = remainingById.get(security.id.toString());
      const effective = remaining !== undefined ? remaining.gt(0) ? 'HOLDING' : 'TRADED' : manual?.listType ?? null;
      return { security, manual, effective, hasTradeHistory: remaining !== undefined };
    }).filter(item => (!selectedList || item.effective === selectedList) && (!excludeRegistered || !['WATCHLIST', 'HOLDING'].includes(item.effective ?? '')));
    const hasPagination = request.query.limit !== undefined || request.query.offset !== undefined;
    const limit = pageNumber(request.query.limit, 'limit', 50, 100);
    const offset = pageNumber(request.query.offset, 'offset', 0, 100_000);
    const page = hasPagination ? classified.slice(offset, offset + limit) : classified;
    const securityIds = page.map(item => item.security.id);
    const [metrics, financials] = await Promise.all([
      prisma.valuationMetric.findMany({ where: { securityId: { in: securityIds } }, orderBy: { metricDate: 'desc' }, distinct: ['securityId'] }),
      prisma.financialStatement.findMany({ where: { securityId: { in: securityIds }, periodType: 'ANNUAL' }, orderBy: { fiscalYear: 'desc' } }),
    ]);
    const metricById = new Map(metrics.map(item => [item.securityId.toString(), item]));
    return { data: page.map(({ security, manual, effective, hasTradeHistory }) => {
      const years = financials.filter(item => item.securityId === security.id).slice(0, 2);
      return { ...serializeSecurity({ ...security, watchlistItem: manual }), listType: effective, manualListType: manual?.listType ?? null, hasTradeHistory,
        valuation: serializeMetrics(metricById.get(security.id.toString()) ?? null), operatingProfit: years[0]?.operatingProfit?.toString() ?? null,
        previousOperatingProfit: years[1]?.operatingProfit?.toString() ?? null };
    }), meta: { total: classified.length, limit: hasPagination ? limit : classified.length, offset: hasPagination ? offset : 0 } };
  });

  app.post<{ Body: WatchlistBody }>('/watchlist-items', async (request, reply) => {
    const body = request.body ?? {};
    const accountId = id(body.accountId, 'accountId'), securityId = id(body.securityId, 'securityId');
    const listType = manualClassification(body.listType);
    const targetBuyPrice = optionalPrice(body.targetBuyPrice), priority = optionalPriority(body.priority), memo = optionalMemo(body.memo);
    const result = await serializable(async tx => {
      await requireActiveAccount(tx, accountId);
      const security = await tx.security.findUnique({ where: { id: securityId }, include: { marketPrice: true } });
      if (!security?.isActive) throw new ApiError(404, 'SECURITY_NOT_FOUND', '종목을 찾을 수 없습니다.');
      if (await tx.buyTrade.count({ where: { accountId, securityId } })) throw new ApiError(409, 'CLASSIFICATION_LOCKED', '거래내역이 있는 종목은 분류를 변경할 수 없습니다.');
      const existing = await tx.accountWatchlistItem.findUnique({ where: { accountId_securityId: { accountId, securityId } } });
      if (existing && existing.listType !== listType) throw new ApiError(409, 'WATCHLIST_ITEM_ALREADY_EXISTS', '이미 등록된 종목입니다. 분류 변경을 사용하세요.');
      const item = existing ?? await tx.accountWatchlistItem.create({ data: { accountId, securityId, listType, targetBuyPrice, priority, memo } });
      return serializeSecurity({ ...security, watchlistItem: item });
    });
    return reply.code(201).send({ data: result });
  });

  app.patch<{ Params: WatchlistParams; Body: WatchlistBody }>('/watchlist-items/:id', async (request) => {
    const body = request.body ?? {}, accountId = id(body.accountId, 'accountId'), itemId = id(request.params.id, 'id');
    if (body.securityId !== undefined) throw new ApiError(400, 'IMMUTABLE_FIELD', 'securityId cannot be changed.');
    const listType = body.listType === undefined ? undefined : manualClassification(body.listType);
    const result = await serializable(async tx => {
      await requireActiveAccount(tx, accountId);
      const existing = await tx.accountWatchlistItem.findFirst({ where: { id: itemId, accountId } });
      if (!existing) throw new ApiError(404, 'WATCHLIST_ITEM_NOT_FOUND', '이 계좌의 분류 항목을 찾을 수 없습니다.');
      if (listType !== undefined && await tx.buyTrade.count({ where: { accountId, securityId: existing.securityId } })) throw new ApiError(409, 'CLASSIFICATION_LOCKED', '거래내역이 있는 종목은 분류를 변경할 수 없습니다.');
      const item = await tx.accountWatchlistItem.update({ where: { id: itemId }, data: {
        ...(listType && { listType }), ...(body.targetBuyPrice !== undefined && { targetBuyPrice: optionalPrice(body.targetBuyPrice) }),
        ...(body.priority !== undefined && { priority: optionalPriority(body.priority) }), ...(body.memo !== undefined && { memo: optionalMemo(body.memo) }),
      }, include: { security: { include: { marketPrice: true } } } });
      return serializeSecurity({ ...item.security, watchlistItem: item });
    });
    return { data: result };
  });

  app.delete<{ Params: WatchlistParams; Querystring: { accountId?: string } }>('/watchlist-items/:id', async (request) => {
    const accountId = id(request.query.accountId, 'accountId'), itemId = id(request.params.id, 'id');
    await serializable(async tx => {
      await requireActiveAccount(tx, accountId);
      const item = await tx.accountWatchlistItem.findFirst({ where: { id: itemId, accountId } });
      if (!item) throw new ApiError(404, 'WATCHLIST_ITEM_NOT_FOUND', '이 계좌의 분류 항목을 찾을 수 없습니다.');
      await tx.accountWatchlistItem.delete({ where: { id: itemId } });
    });
    return { data: { id: itemId.toString(), deleted: true } };
  });
}
