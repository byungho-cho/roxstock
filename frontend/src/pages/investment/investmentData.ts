import { amount } from '../investment-profit/profitData';
import { apiEnvelope } from '../../data/apiClient';
import type { AssetHistoryDto, CashHistoryDto, CashTransactionDto, TradeReport, BuyLotDto } from '../../data/roxstockApi';

export type Quarter = 0 | 1 | 2 | 3 | 4;
export const quarters: Quarter[] = [0, 1, 2, 3, 4];
export const seoulToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
export function quarterAvailable(year: number, quarter: Quarter, today: string) {
  return !quarter || year < Number(today.slice(0, 4)) || (year === Number(today.slice(0, 4)) && quarter <= Math.ceil(Number(today.slice(5, 7)) / 3));
}
export function periodRange(year: number, quarter: Quarter, today: string) {
  const firstMonth = quarter ? (quarter - 1) * 3 + 1 : 1;
  const lastMonth = quarter ? quarter * 3 : 12;
  const from = `${year}-${String(firstMonth).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, lastMonth, 0)).toISOString().slice(0, 10);
  return { from, to: end < today ? end : today };
}

// Money stays at database precision until display; chart geometry alone uses Number.
const scale = 10000n;
export function money(value: string | null | undefined): bigint | null {
  if (value == null || !/^-?\d+(\.\d{1,4})?$/.test(value)) return null;
  const negative = value.startsWith('-'), [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const result = BigInt(whole) * scale + BigInt(fraction.padEnd(4, '0'));
  return negative ? -result : result;
}
export function moneyText(value: bigint | null, signed = false) {
  if (value === null) return '—';
  const absolute = value < 0n ? -value : value, rounded = (absolute + 5000n) / scale;
  return `${value < 0n ? '−' : signed && value > 0n ? '+' : ''}${rounded.toLocaleString('ko-KR')}원`;
}
export const moneyNumber = (value: bigint | null) => value === null ? Number.NaN : Number(value) / 10000;
export function returnRate(evaluation: bigint | null, investment: bigint | null) {
  if (evaluation === null || investment === null || investment <= 0n) return '—';
  const delta = evaluation - investment, absolute = delta < 0n ? -delta : delta;
  const tenths = (absolute * 1000n + investment / 2n) / investment;
  return `${delta < 0n ? '−' : delta > 0n ? '+' : ''}${tenths / 10n}.${tenths % 10n}%`;
}
type Snapshot = AssetHistoryDto['data'][number] & { updatedAt?: string };
type Transaction = CashTransactionDto & { createdAt?: string; updatedAt?: string };
export type InvestmentPoint = { date: string; evaluation: bigint | null; investment: bigint | null; dailyProfit?: bigint | null };
export type InvestmentData = {
  points: InvestmentPoint[];
  asOf: string | null;
  evaluation: bigint | null;
  investment: bigint | null;
  dividend: bigint | null;
  initialInvestment: bigint | null;
  initialAsOf: string | null;
  historicalUnavailable: boolean;
  annualTradingProfit?: bigint | null;
  currentYearProfit?: bigint | null;
};

export function calculateInvestment(snapshots: Snapshot[], transactions: Transaction[], year: number, opening: Pick<Snapshot,'date'|'investmentAmount'|'updatedAt'> | null = null): InvestmentData {
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const formatter = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' });
  const relevant = transactions.filter(row => row.transactionType === 'DIVIDEND').map(row => ({
    type: row.transactionType,
    date: formatter.format(new Date(row.transactionDate)),
    created: row.createdAt ? Date.parse(row.createdAt) : Number.NaN,
    modified: row.updatedAt ? Date.parse(row.updatedAt) : row.createdAt ? Date.parse(row.createdAt) : Number.NaN,
    amount: money(row.transactionType === 'DIVIDEND' ? row.dividend?.netAmount : row.amount),
  }));
  let historicalUnavailable = false;
  const totals = (snapshot: Snapshot) => {
    const cutoff = snapshot.updatedAt ? Date.parse(snapshot.updatedAt) : Number.NaN;
    const investment = money(snapshot.investmentAmount);
    if (investment === null) historicalUnavailable = true;
    let dividend: bigint | null = 0n;
    for (const row of relevant) {
      const { date, created, modified, amount } = row;
      if (date > snapshot.date || date < `${year}-01-01`) continue;
      // Older servers without collection/creation timestamps cannot reconstruct a snapshot cutoff.
      if (Number.isFinite(created) && Number.isFinite(cutoff) && created > cutoff) continue;
      const uncertain = !(snapshot as Snapshot & {isCurrent?:boolean}).isCurrent && (!Number.isFinite(cutoff) || !Number.isFinite(created) || !Number.isFinite(modified) || modified > cutoff);
      if (row.type === 'DIVIDEND') {
        if (date.startsWith(`${year}-`)) dividend = uncertain || amount === null ? null : dividend === null ? null : dividend + amount;
      }
      if (uncertain) historicalUnavailable = true;
    }
    return { investment, dividend };
  };
  const points = ordered.filter(snapshot => snapshot.date.startsWith(`${year}-`)).map(snapshot => {
    const previousDate = new Date(Date.parse(snapshot.date) - 86400000).toISOString().slice(0, 10);
    const previous = ordered.find(row => row.date === previousDate);
    const evaluation = money(snapshot.totalAssetValue), previousValue = money(previous?.totalAssetValue);
    let netDeposit: bigint | null = 0n;
    for (const row of transactions) {
      if (!['DEPOSIT', 'WITHDRAWAL'].includes(row.transactionType) || formatter.format(new Date(row.transactionDate)) !== snapshot.date) continue;
      const value = money(row.amount);
      netDeposit = value === null || netDeposit === null ? null : netDeposit + (row.transactionType === 'DEPOSIT' ? value : -value);
    }
    return { date: snapshot.date, evaluation, investment: totals(snapshot).investment,
      dailyProfit: evaluation === null || previousValue === null || netDeposit === null ? null : evaluation - previousValue - netDeposit };
  });
  const point = points.at(-1), latest = ordered.find(row => row.date === point?.date);
  return { points, asOf: latest?.date ?? null, evaluation: point?.evaluation ?? null, investment: point?.investment ?? null,
    dividend: latest ? totals(latest).dividend : null, initialInvestment: opening ? money(opening.investmentAmount) : 0n, initialAsOf: opening?.date ?? null, historicalUnavailable };
}

/** 8-decimal trade precision: only remaining lots, excluding cash/dividends. */
export function currentHoldingProfit(lots: BuyLotDto[]): bigint | null {
  let total = 0n;
  for (const lot of lots) {
    const quantity = money(lot.remainingQuantity);
    if (quantity === null || quantity < 0n) return null;
    if (quantity === 0n) continue;
    const price = money(lot.currentPrice), cost = money(lot.unitPrice);
    if (price === null || price <= 0n || cost === null) return null;
    total += (price - cost) * quantity;
  }
  return total;
}

export async function loadInvestment(accountId: string, year: number, today: string, signal: AbortSignal) {
  const range = periodRange(year, 0, today), account = encodeURIComponent(accountId);
  const isCurrentYear = year === Number(today.slice(0, 4));
  const [history, baseline, trades, lots] = await Promise.all([
    apiEnvelope<AssetHistoryDto>(`/accounts/${account}/asset-history?${new URLSearchParams({ ...range, from: `${year-1}-12-31`, storedOnly: 'true' })}`, { signal }),
    apiEnvelope<{data:{date:string;investmentAmount:string|null;updatedAt:string}|null}>(`/accounts/${account}/investment-baseline?year=${year}`,{signal}),
    apiEnvelope<TradeReport>(`/accounts/${account}/trades?${new URLSearchParams(range)}`, {signal}),
    isCurrentYear ? apiEnvelope<{data:BuyLotDto[]}>(`/accounts/${account}/buy-lots?remainingOnly=true`, {signal}) : Promise.resolve(null),
  ]);
  const opening=baseline.data;
  const transactions: Transaction[] = [];
  // Read every page: a latest-20 list cannot supply cumulative principal.
  if (history.data.length) {
    let total = Infinity;
    const seen = new Set<string>();
    while (transactions.length < total) {
      const result = await apiEnvelope<CashHistoryDto>(`/accounts/${account}/cash-transactions?limit=100&types=DEPOSIT,WITHDRAWAL,DIVIDEND&offset=${transactions.length}`, { signal });
      if (!Number.isSafeInteger(result.meta.total) || result.meta.total < 0 || (Number.isFinite(total) && result.meta.total !== total)) throw new Error('조회 중 투자금 내역이 변경되었습니다. 다시 시도해 주세요.');
      total = result.meta.total;
      if (!result.data.length && transactions.length < total) throw new Error('투자금 내역 조회가 완료되지 않았습니다.');
      for (const row of result.data) {
        if (seen.has(row.id)) throw new Error('조회 중 투자금 내역 순서가 변경되었습니다. 다시 시도해 주세요.');
        seen.add(row.id);
      }
      transactions.push(...result.data);
    }
  }
  const annualTradingProfit = amount(trades.summary.realizedProfitLoss), holdingProfit = lots ? currentHoldingProfit(lots.data) : null;
  return { ...calculateInvestment(history.data.filter(point => point.date >= `${year-1}-12-31` && point.date <= range.to), transactions, year, opening), annualTradingProfit, currentYearProfit: isCurrentYear && annualTradingProfit !== null && holdingProfit !== null ? annualTradingProfit + holdingProfit : null };
}
