import { useLocation } from 'react-router-dom';
import { getPageBootstrap } from '../data/pageApi';
import { storedQueryOptions } from '../data/storedQueryOptions';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { chooseAccount, listAccounts, selectedAccountStorageKey } from '../data/roxstockApi';
import { liveApiEnabled } from '../data/liveData';

const subscribe = (notify: () => void) => {
  window.addEventListener('roxstock-selected-account', notify);
  window.addEventListener('storage', notify);
  return () => {
    window.removeEventListener('roxstock-selected-account', notify);
    window.removeEventListener('storage', notify);
  };
};
const selectedId = () => window.localStorage.getItem(selectedAccountStorageKey) ?? import.meta.env.VITE_API_ACCOUNT_ID ?? null;

export function useActiveAccount() {
  // The selection event makes a switch visible before any new account request finishes.
  const client = useQueryClient();
  const selected = useSyncExternalStore(subscribe, selectedId, () => null);
  const { pathname } = useLocation();
  const screen = pathname === "/" ? "home" : pathname === "/stocks" ? "stocks" : undefined;
  const pageEnabled = liveApiEnabled && !!screen;
  const page = useQuery({ queryKey: [screen === "home" ? "homePage" : "stocksPage", selected], queryFn: async ({ signal }) => { const result = await getPageBootstrap(screen!, selected, signal); if (!signal.aborted && !result.legacy) client.setQueryData(['accounts', 'api'], result.accounts); return result; }, enabled: pageEnabled, staleTime: 30_000, refetchInterval: pageEnabled ? 60_000 : false, refetchIntervalInBackground: false, refetchOnWindowFocus: false });
  const pageMode = pageEnabled && !page.data?.legacy;
  const accounts = useQuery({ ...storedQueryOptions, queryKey: ['accounts', 'api'], queryFn: ({signal})=>listAccounts(signal), enabled: liveApiEnabled && !pageMode });
  if (pageMode) return { accountId: page.data?.accountId ?? undefined, accounts: { ...page, data: page.data?.accounts }, page, pageMode, screen };
  return { page, pageMode, screen, accountId: liveApiEnabled ? chooseAccount(accounts.data ?? [])?.id : undefined, accounts };
}
