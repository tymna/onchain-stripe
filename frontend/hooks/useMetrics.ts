import { useQuery } from '@tanstack/react-query';
import { fetchJson, REFETCH_INTERVAL_MS } from '../lib/api';

type Metrics = { mrr: string; active: number; churn: number };

export function useMetrics(merchant?: `0x${string}`) {
    return useQuery({
        queryKey: ['metrics', merchant],
        queryFn: () => fetchJson<Metrics>(`/metrics?merchant=${merchant}`),
        enabled: !!merchant,
        refetchInterval: REFETCH_INTERVAL_MS,
    });
}
