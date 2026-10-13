import {useActiveAccount} from './useActiveAccount';
import {useQueryClient} from '@tanstack/react-query';
import {useEffect,useState} from 'react';
import {liveApiEnabled} from '../data/liveData';
import {readDemoSettings,saveDemoSettings} from '../data/mockMoreSettings';
import {chooseAccount,selectedAccountStorageKey} from '../data/roxstockApi';

export function useMoreAccounts() {
  const client = useQueryClient();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = () => setVersion((value) => value + 1);
    window.addEventListener('roxstock-demo-settings', listener);
    window.addEventListener('roxstock-selected-account', listener);
    return () => { window.removeEventListener('roxstock-demo-settings', listener); window.removeEventListener('roxstock-selected-account', listener); };
  }, []);
  const { accounts: query } = useActiveAccount();
  void version;
  const demo = readDemoSettings();
  const accounts = liveApiEnabled ? (query.data ?? []).filter(a=>a.isActive) : demo.accounts;
  const selected = liveApiEnabled ? chooseAccount(accounts) : accounts.find((item) => item.id === demo.selectedId) ?? accounts[0];
  const refresh = async () => {
    if (!liveApiEnabled) return;
    await client.invalidateQueries({ predicate: (item) => ['homePage', 'stocksPage', 'accounts', 'dashboard', 'stocks', 'buyLots', 'journalTrades', 'targetArrivals', 'recentBuys'].includes(String(item.queryKey[0])) });
  };
  const select = async (id: string) => {
    if (selected?.id === id) return;
    if (liveApiEnabled) { localStorage.setItem(selectedAccountStorageKey, id); window.dispatchEvent(new Event('roxstock-selected-account')); }
    else saveDemoSettings({ selectedId: id });
  };
  return { accounts, selected, query, demo, refresh, select };
}

