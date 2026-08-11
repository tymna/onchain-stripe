import { useContractWrite } from './useContractWrite';

// Wraps SubscriptionManager.updatePlan(planId, price, interval) — forward-only
// price/interval change; never touches time already paid for.
export function useUpdatePlan(planId: bigint, price: bigint, interval: bigint) {
    const { write: updatePlan, ...rest } = useContractWrite('updatePlan', [
        planId,
        price,
        interval,
    ]);
    return { updatePlan, ...rest };
}
