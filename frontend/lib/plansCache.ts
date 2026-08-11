import type { QueryClient } from '@tanstack/react-query';
import type { Plan } from '../hooks/usePlans';

// Optimistic writes into the ['plans'] query cache.
//
// These run only AFTER the tx is confirmed on-chain, so the change is real — not
// a guess we might have to roll back. We pre-apply it to the cached DB-mirror
// copy so the UI updates instantly, instead of waiting for Goldsky to index the
// event and the next poll to fetch it. usePlans keeps polling
// (REFETCH_INTERVAL_MS); once the indexer catches up, that poll overwrites these
// with authoritative DB rows. Under a healthy indexer (seconds of lag) the poll
// returns a matching value, so the swap is invisible. If the indexer lags past
// one poll interval, the row briefly reverts to its pre-tx value and then
// re-corrects — the accepted cost of an async mirror.
//
// We deliberately do NOT invalidate alongside these: an invalidate refetches the
// still-stale DB and would clobber the optimistic value right back.

// ---- PATCH ---- //

// Merge changes into one existing plan (enable/disable, price/interval edit),
// matched by planId. No-op if the list isn't loaded or the id isn't present.
export function patchPlan(qc: QueryClient, planId: number, changes: Partial<Plan>) {
    qc.setQueryData<Plan[]>(['plans'], (old) =>
        old?.map((p) => (p.planId === planId ? { ...p, ...changes } : p)),
    );
}

// ---- UPSERT ---- //

// Insert a brand-new plan (create), or replace it if a row with that id already
// landed. Keyed on planId so a late poll can never leave a duplicate.
export function upsertPlan(qc: QueryClient, plan: Plan) {
    qc.setQueryData<Plan[]>(['plans'], (old) => {
        if (!old) return [plan];
        return old.some((p) => p.planId === plan.planId)
            ? old.map((p) => (p.planId === plan.planId ? plan : p))
            : [...old, plan];
    });
}
