// Bridges the indexer-lag window. The DB mirror only learns about a Cancelled/
// Renewed event once Goldsky indexes it (seen minutes to DAYS behind on Base
// Sepolia) and the 30s poll picks it up — until then the API keeps answering
// the OLD row, repainting stale state right after the user watched the tx
// confirm. So: remember per-sub patches from txs confirmed in THIS browser
// session; views merge them over the API rows. The chain stays the source of
// truth — a renew stores the expiry read back from the contract, never a
// client-side guess — so once the indexer catches up, DB and override agree.

type SubOverride = {
    cancelled?: boolean;
    expiresAt?: string; // ISO string, same shape the API sends
};

// Keys normalized (no 0x, lowercase): the API sends bare-hex subIds, components
// pass 0x-prefixed ones to viem — both forms must hit the same entry.
const key = (subId: string) => subId.replace(/^0x/, '').toLowerCase();

const overrides = new Map<string, SubOverride>();

// Reactivity shim: React can't see writes to a plain Map, and the 30s poll may
// return byte-identical (stale) data — React Query then skips the re-render and
// a fresh override would sit invisible. Components subscribe through
// hooks/useSubOverrides (useSyncExternalStore) and re-render on every write.
// `version` is the subscribed value: a counter whose only job is to change.
type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

export const subscribeSubOverrides = (listener: Listener) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const getSubOverridesVersion = () => version;

// Merge, don't replace — a cancel patch and a later renew patch may both apply
// to the same sub within one session.
export const setSubOverride = (subId: string, patch: SubOverride) => {
    overrides.set(key(subId), { ...overrides.get(key(subId)), ...patch });
    version += 1;
    listeners.forEach((listener) => listener());
};

export const getSubOverride = (subId: string): SubOverride | undefined => overrides.get(key(subId));

// ---- PENDING SUBSCRIPTIONS ---- //
// Overrides above PATCH rows the API already returns. A fresh subscribe creates
// a row the DB hasn't heard of at all — until Goldsky indexes the Subscribed
// event, the API list simply lacks it, and there's nothing to patch. So: keep
// whole synthesized rows (API shape, expiry read back from the contract) and
// APPEND them to every API response; once the DB returns the same subId, the
// DB row wins and the pending copy is dropped.

// Exactly the API row shape (useSubscriptions) — merge output must be a drop-in.
export type SubRow = {
    subId: string; // bare hex, no 0x — the shape the indexer stores
    subscriber: string; // lowercase
    planId: number;
    expiresAt: string; // ISO string
    cancelled: boolean;
};

const pending = new Map<string, SubRow>();

export const addPendingSub = (sub: SubRow) => {
    pending.set(key(sub.subId), { ...sub, subId: key(sub.subId) });
    version += 1;
    listeners.forEach((listener) => listener());
};

// Append pending rows the API doesn't know yet; prune the ones it now confirms
// (prune only mutates the map — no version bump, safe to call during render).
export const mergePendingSubs = <T extends SubRow>(rows: T[]): T[] => {
    const confirmed = new Set(rows.map((r) => key(r.subId)));
    for (const k of [...pending.keys()]) {
        if (confirmed.has(k)) pending.delete(k);
    }
    if (pending.size === 0) return rows;
    return [...rows, ...([...pending.values()] as T[])];
};
