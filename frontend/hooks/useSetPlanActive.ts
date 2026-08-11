import { useContractWrite } from './useContractWrite';

// Wraps SubscriptionManager.setPlanActive(planId, active) — plan's own merchant;
// disable blocks new subscribe + renew (disable-don't-delete).
export function useSetPlanActive(planId: bigint, active: boolean) {
    const { write: setPlanActive, ...rest } = useContractWrite('setPlanActive', [planId, active]);
    return { setPlanActive, ...rest };
}
