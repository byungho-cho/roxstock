import { storedQueryOptions } from '../data/storedQueryOptions';
import { useQuery } from '@tanstack/react-query';
import { getTargetArrivals } from '../data/targetArrivalApi';
import { useActiveAccount } from './useActiveAccount';

export function useTargetArrivals({poll=true}:{poll?:boolean}={}) {
  const { accountId, accounts, page, pageMode, screen } = useActiveAccount();
  const query = useQuery({ ...storedQueryOptions, staleTime:60_000, queryKey: ['targetArrivals', accountId], queryFn: ({signal}) => getTargetArrivals(accountId!,signal), enabled: !!accountId && !(pageMode && screen === 'home'),
    refetchInterval: poll?60_000:false, refetchIntervalInBackground: false });
  // No placeholderData: a new account must never render the prior account's lots.
  if (pageMode && screen === 'home') return { ...page, data: page.data?.targets ?? undefined, isError: page.isError || page.data?.targets === null, accountId, accounts };
  return { ...query, accountId, accounts };
}
