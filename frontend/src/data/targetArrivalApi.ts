import { apiEnvelope, apiRequest } from './apiClient';
export type TargetCondition = { days: number; rate: string };
export type TargetSettings = { accountId: string; scope: 'ACCOUNT'; version: number; conditions: TargetCondition[] };
export type TargetLot = {
  lotId: string; securityId: string; symbol: string; name: string; buyDate: string; holdingDays: number;
  remainingQuantity: string; unitPrice: string; currentPrice: string; returnRate: string; profitLoss: string;
  representativeCondition: TargetCondition; priceUpdatedAt: string;
};
export type TargetReport = { data: TargetLot[]; meta: {
  accountId: string; conditionsVersion: number; enabled: boolean; total: number; unavailableCount: number;
  unavailable: { lotId: string; name: string; reason: string }[]; calculatedAt: string; asOfDate: string;
  priceAsOf: string | null; priceAsOfLatest: string | null;
} };
const path = (accountId: string) => `/accounts/${encodeURIComponent(accountId)}`;
export const getTargetSettings = (accountId: string) => apiRequest<TargetSettings>(`${path(accountId)}/target-arrival-conditions`);
export const saveTargetSettings = (accountId: string, body: Pick<TargetSettings, 'conditions' | 'version'>) => apiRequest<TargetSettings>(`${path(accountId)}/target-arrival-conditions`, { method: 'PUT', body: JSON.stringify(body) });
export const getTargetArrivals = (accountId: string) => apiEnvelope<TargetReport>(`${path(accountId)}/target-arrivals`);
