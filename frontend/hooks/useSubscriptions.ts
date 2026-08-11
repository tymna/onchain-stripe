import { useQuery } from '@tanstack/react-query';
import { fetchJson, REFETCH_INTERVAL_MS } from '../lib/api';
// One definition of the API row shape — subOverrides synthesizes pending rows
// that must stay drop-in compatible with what this hook fetches.
import type { SubRow } from '../lib/subOverrides';

export function useSubscriptions(subscriber?: `0x${string}`) {
    return useQuery({
        queryKey: ['subscriptions', subscriber],
        queryFn: () => fetchJson<SubRow[]>(`/v_subscriptions?subscriber=${subscriber}`),
        enabled: !!subscriber,
        refetchInterval: REFETCH_INTERVAL_MS,
    });
}
