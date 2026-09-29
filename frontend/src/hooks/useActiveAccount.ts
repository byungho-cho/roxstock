import { useQuery } from '@tanstack/react-query';
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
const selectedId = () => window.localStorage.getItem(selectedAccountStorageKey);

export function useActiveAccount() {
  // The selection event makes a switch visible before any new account request finishes.
  useSyncExternalStore(subscribe, selectedId, () => null);
  const accounts = useQuery({ queryKey: ['accounts', 'api'], queryFn: listAccounts, enabled: liveApiEnabled });
  return { accountId: liveApiEnabled ? chooseAccount(accounts.data ?? [])?.id : undefined, accounts };
}
