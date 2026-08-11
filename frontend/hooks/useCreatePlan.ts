import { useContractWrite } from './useContractWrite';

// Wraps SubscriptionManager.createPlan(name, price, interval) — merchant adds a plan.
// The returned receipt matters here: PlanCreated carries the contract-assigned
// planId, which the caller can't know ahead of time.
export function useCreatePlan(name: string, price: bigint, interval: bigint) {
    const { write: createPlan, ...rest } = useContractWrite('createPlan', [name, price, interval]);
    return { createPlan, ...rest };
}
