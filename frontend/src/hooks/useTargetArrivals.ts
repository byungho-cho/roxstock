import { storedQueryOptions } from '../data/storedQueryOptions';
import { useQuery } from '@tanstack/react-query';
import { getTargetArrivals } from '../data/targetArrivalApi';
import { useActiveAccount } from './useActiveAccount';

export function useTargetArrivals({poll=true}:{poll?:boolean}={}) {
  const { accountId, accounts } = useActiveAccount();
  const query = useQuery({ ...storedQueryOptions, staleTime:60_000, queryKey: ['targetArrivals', accountId], queryFn: ({signal}) => getTargetArrivals(accountId!,signal), enabled: !!accountId,
    refetchInterval: poll?60_000:false, refetchIntervalInBackground: false });
  // No placeholderData: a new account must never render the prior account's lots.
  return { ...query, accountId, accounts };
}
