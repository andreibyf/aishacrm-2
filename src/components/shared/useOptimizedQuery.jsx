import { useQuery } from '@tanstack/react-query';
import { useApiOptimizer } from './ApiOptimizer';

/**
 * Enhanced useQuery hook with automatic retry, caching, and batching
 */
export function useOptimizedQuery({
  queryKey,
  queryFn,
  entity,
  method = 'list',
  params = {},
  enabled = true,
  staleTime = 5 * 60 * 1000, // 5 minutes
  cacheTime = 10 * 60 * 1000, // 10 minutes
  retry = 3,
  retryDelay = (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  refetchOnWindowFocus = false,
  ...restOptions
}) {
  const { optimizedRequest } = useApiOptimizer();

  return useQuery({
    queryKey,
    queryFn: () => optimizedRequest(entity, method, params, queryFn, {
      enableBatching: true,
      enableCache: true,
      cacheTime: staleTime,
      retry: true,
    }),
    enabled,
    staleTime,
    cacheTime,
    retry,
    retryDelay,
    refetchOnWindowFocus,
    ...restOptions,
  });
}