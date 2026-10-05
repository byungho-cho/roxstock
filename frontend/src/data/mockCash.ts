import { cashEntries, dashboardData } from './mockData';
import type { CashEntry } from '../types/models';

const storageKey = 'roxstock:mock-cash-v1';

export function loadCash() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? 'null') as { balance: number; entries: CashEntry[]; seedVersion?: number } | null;
    if (saved && Number.isFinite(saved.balance) && Array.isArray(saved.entries)) {
      if (saved.seedVersion === 2) return saved;
      const ids = new Set(saved.entries.map((entry) => entry.id));
      const additions = cashEntries.slice(13).filter((entry) => !ids.has(entry.id));
      return { ...saved, entries: [...saved.entries, ...additions], seedVersion: 2 };
    }
  } catch { /* Fall back to the shared mock fixture. */ }
  return { balance: dashboardData.summary.cashBalance, entries: cashEntries, seedVersion: 2 };
}

export function saveCash(balance: number, entries: CashEntry[]) {
  try { window.localStorage.setItem(storageKey, JSON.stringify({ balance, entries, seedVersion: 2 })); } catch { /* The mock remains usable without storage. */ }
}
