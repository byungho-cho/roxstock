import { useEffect, useRef } from 'react';
import type { TargetReport } from '../data/targetArrivalApi';
import { storedQueryOptions } from '../data/storedQueryOptions';
import { useQuery } from '@tanstack/react-query';
import { getTargetArrivals } from '../data/targetArrivalApi';
import { useActiveAccount } from './useActiveAccount';

export function useTargetArrivals({poll=true}:{poll?:boolean}={}) {
  const { accountId, accounts, page, pageMode, screen } = useActiveAccount();
  const query = useQuery({ ...storedQueryOptions, staleTime:60_000, queryKey: ['targetArrivals', accountId], queryFn: ({signal}) => getTargetArrivals(accountId!,signal), enabled: !!accountId && !(pageMode && screen === 'home'),
    refetchInterval: poll?60_000:false, refetchIntervalInBackground: false });
  const source = pageMode && screen === 'home'
    ? { ...page, data: page.data?.targets ?? undefined, isError: page.isError || page.data?.targets === null }
    : query;
  const valid = accountId && source.data?.meta.accountId === accountId ? source.data : undefined;
  const previous = useRef<{accountId: string; data: TargetReport} | undefined>(undefined);
  useEffect(() => {
    if (valid && accountId) previous.current = {accountId, data: valid};
    else if (previous.current?.accountId !== accountId) previous.current = undefined;
  }, [accountId, valid]);
  // A secondary refresh failure is not an empty result. Never reuse another account.
  const data = valid ?? (previous.current?.accountId === accountId ? previous.current?.data : undefined);
  return { ...source, data, accountId, accounts };
}
