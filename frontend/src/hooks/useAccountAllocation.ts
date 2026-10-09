import {useQuery} from '@tanstack/react-query';
import {getAccountDashboard} from '../data/roxstockApi';
import {cashAllocation} from '../utils/cashAllocation';
import {liveApiEnabled} from '../data/liveData';
export function useAccountAllocation(accountId?:string,cash?:string|null) {
 const query=useQuery({queryKey:['analysis-dashboard',accountId],queryFn:()=>getAccountDashboard(accountId!),enabled:liveApiEnabled&&!!accountId,refetchInterval:30000});
 return {...cashAllocation(query.data?.stockValue,cash===undefined?query.data?.cashBalance:cash,!!query.data?.pricingComplete&&!query.isError),query};
}
