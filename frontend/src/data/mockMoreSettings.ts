import type { AccountDto, AccountWriteInput } from './roxstockApi';

/** Demo-only state. This module must never write to an API-backed account or dashboard cache. */
type DemoState = { accounts: AccountDto[]; selectedId: string | null; automatic: boolean; interval: number; theme: 'dark' | 'light' | 'system' };
const KEY = 'roxstock-170-demo-settings-v2';
const initial = (): DemoState => ({ accounts: [{ id: 'demo-1', name: '기본 계좌', brokerName: '증권사명', accountNumber: '1234-56••••', isDefault: true, isActive: true, cashBalance: '203200000', updatedAt: '2026-09-20T08:30:00+09:00' }], selectedId: 'demo-1', automatic: true, interval: 1, theme: 'dark' });
export function readDemoSettings(): DemoState {
  try { const value = localStorage.getItem(KEY); return value ? { ...initial(), ...JSON.parse(value) as DemoState } : initial(); }
  catch { return initial(); }
}
function write(next: DemoState) { localStorage.setItem(KEY, JSON.stringify(next)); window.dispatchEvent(new Event('roxstock-demo-settings')); return next; }
export const saveDemoSettings = (change: Partial<DemoState>) => write({ ...readDemoSettings(), ...change });
export function addDemoAccount(input: AccountWriteInput) {
  const state = readDemoSettings(); const id = `demo-${Date.now()}`;
  const next: AccountDto = { ...input, id, accountNumber: input.accountNumber ?? null, cashBalance: '0', isActive: true, isDefault: state.accounts.length === 0 || !!input.isDefault, updatedAt: new Date().toISOString() };
  return write({ ...state, selectedId: id, accounts: [...state.accounts.map((item) => ({ ...item, isDefault: next.isDefault ? false : item.isDefault })), next] });
}
export function editDemoAccount(id: string, input: Partial<AccountWriteInput>) {
  const state = readDemoSettings();
  return write({ ...state, accounts: state.accounts.map((item) => item.id === id ? { ...item, ...input, updatedAt: new Date().toISOString() } : input.isDefault ? { ...item, isDefault: false } : item) });
}
export function changeDemoCash(id: string, cashBalance: string) {
  const state = readDemoSettings();
  return write({ ...state, accounts: state.accounts.map((item) => item.id === id ? { ...item, cashBalance, updatedAt: new Date().toISOString() } : item) });
}
