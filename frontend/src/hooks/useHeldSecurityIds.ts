import {useQuery} from '@tanstack/react-query';
import {useActiveAccount} from './useActiveAccount';
import {getAccountHoldings} from '../data/roxstockApi';
/** Current positive positions only; watchlist and fully sold trades are not holdings. */
export function useHeldSecurityIds(){
 const {accountId}=useActiveAccount();
 const query=useQuery({queryKey:['analysisHoldings',accountId],queryFn:()=>getAccountHoldings(accountId!),enabled:!!accountId,staleTime:30000});
 return new Set((Array.isArray(query.data)?query.data:[]).filter(row=>Number(row.quantity)>0).map(row=>row.securityId));
}
