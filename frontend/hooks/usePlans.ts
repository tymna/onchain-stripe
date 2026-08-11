import { useQuery } from '@tanstack/react-query';
import { fetchJson, REFETCH_INTERVAL_MS } from '../lib/api';

export type Plan = {
    planId: number;
    merchant: string;
    name: string;
    price: string;
    interval: number;
    active: boolean;
};

export function usePlans() {
    return useQuery({
        queryKey: ['plans'],
        queryFn: () => fetchJson<Plan[]>(`/v_plans`),
        refetchInterval: REFETCH_INTERVAL_MS,
    });
}
