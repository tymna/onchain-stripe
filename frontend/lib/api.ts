const BASE = process.env.NEXT_PUBLIC_API_URL;

export async function fetchJson<T>(path: string): Promise<T> {
    // Fail loud, not with a fetch to "undefined/…" — a missing env var would
    // otherwise surface as a baffling network error in every component.
    if (!BASE) throw new Error('NEXT_PUBLIC_API_URL is not set');
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
}

// How often the read queries poll for fresh data. The dashboard mirrors on-chain
// activity that also changes from other users, so it can't lean on button-
// triggered refetches alone.
//
// 30_000 ms = 30s. (The _ is just a digit separator TS ignores: 30_000 === 30000.)
// Why 30s: a revenue dashboard isn't a trading screen — second-level freshness is
// pointless, but >1 min feels stale right after you act. 30s also stays light on
// the free-tier DB. Tune it here. (TanStack pauses polling in background tabs.)
export const REFETCH_INTERVAL_MS = 30_000;
