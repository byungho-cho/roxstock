import { cashEntries, dashboardData } from './mockData';
import type { CashEntry } from '../types/models';

const storageKey = 'roxstock:mock-cash-v1';

export function loadCash() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null') as { balance: number; entries: CashEntry[] } | null;
    if (saved && Number.isFinite(saved.balance) && Array.isArray(saved.entries)) return saved;
  } catch { /* Fall back to the shared mock fixture. */ }
  return { balance: dashboardData.summary.cashBalance, entries: cashEntries };
}

export function saveCash(balance: number, entries: CashEntry[]) {
  try { window.localStorage.setItem(storageKey, JSON.stringify({ balance, entries })); } catch { /* The mock remains usable without storage. */ }
}
