import { useContractWrite } from './useContractWrite';

// Wraps SubscriptionManager.cancel(subId) — subscription's own subscriber; marks it cancelled.
export function useCancel(subId: `0x${string}`) {
    const { write: cancel, ...rest } = useContractWrite('cancel', [subId]);
    return { cancel, ...rest };
}
