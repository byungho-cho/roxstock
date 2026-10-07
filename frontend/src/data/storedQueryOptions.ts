// Stored financial records refresh only after invalidation or an explicit retry.
// refetchOnMount=true permits invalidated inactive entries to refresh on their next visit.
export const storedQueryOptions = {
  staleTime: Infinity, gcTime: 30 * 60_000,
  refetchOnMount: true, refetchOnWindowFocus: false, refetchOnReconnect: false,
  refetchInterval: false,
} as const;
