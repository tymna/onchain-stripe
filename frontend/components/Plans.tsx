'use client';

import { useAccount } from 'wagmi';
import { usePlans } from '../hooks/usePlans';
import { useSubscriptions } from '../hooks/useSubscriptions';
import { useNow } from '../hooks/useNow';
import { useSubOverrides } from '../hooks/useSubOverrides';
import { usdc, duration, addr, to0x } from '../lib/format';
import { getSubOverride, mergePendingSubs } from '../lib/subOverrides';
import { Empty } from './Empty';
import { SubscribeButton } from './SubscribeButton';
import { RenewButton } from './RenewButton';
import { listShell, rowHover, stamp } from './ui';

// Subscriber view. Lists every plan across all merchants (the catalog) —
// /plans takes no address, it's global. Price is per-interval. An inactive plan
// still shows (greyed): the contract's rule is disable, don't delete.
//
// One wallet holds ONE subscription per plan (subId = keccak256(subscriber, planId)),
// so a plan can't blindly offer Subscribe. Three states per row:
//   no sub            → Subscribe
//   live sub          → "subscribed" badge (cancel lives in Your subs)
//   lapsed/cancelled  → Renew — the way back; subscribing again reverts on-chain

export function Plans() {
    const { data, isLoading, error } = usePlans();
    const { address } = useAccount();
    // My subs, keyed by planId — unique per plan by construction (deterministic subId).
    const { data: subs } = useSubscriptions(address);
    const now = useNow();
    // Re-render when a cancel/renew/subscribe confirms — the rows below read
    // getSubOverride, and mergePendingSubs appends a just-created sub the DB
    // hasn't indexed yet (else this row would offer Subscribe again).
    useSubOverrides();
    // Filter by the CONNECTED wallet: API rows already are (query param), but a
    // pending row written under a previous wallet must not leak into this one.
    const mySubByPlan = new Map(
        mergePendingSubs(subs ?? [])
            .filter((s) => s.subscriber === address?.toLowerCase())
            .map((s) => [s.planId, s] as const),
    );

    if (isLoading) return <Empty>Loading plans…</Empty>;
    if (error) return <Empty tone="error">Couldn’t load plans: {error.message}</Empty>;

    // Subscriber catalog: only plans you can actually subscribe to. Inactive plans still
    // exist on-chain (disable-don't-delete), but they're noise here — a merchant "my plans"
    // view is where they'd show (greyed) for re-enabling.
    const active = data?.filter((p) => p.active) ?? [];
    if (!active.length) return <Empty>No plans yet.</Empty>;

    return (
        <ul className={listShell}>
            {active.map((p) => {
                const mine = mySubByPlan.get(p.planId);
                // Live-ness is DERIVED, never stored (a lapse fires no event):
                // useNow's tick re-checks it so an expiry flips the row on its own.
                // Session-local override first — a cancel/renew signed just now
                // that the DB mirror won't reflect until the indexer catches up.
                const o = mine ? getSubOverride(mine.subId) : undefined;
                const live =
                    !!mine &&
                    !(o?.cancelled ?? mine.cancelled) &&
                    new Date(o?.expiresAt ?? mine.expiresAt) > now;
                return (
                    <li
                        key={p.planId}
                        className={`flex items-center justify-between gap-4 px-4 py-3.5 ${rowHover}`}
                    >
                        <div>
                            <div className="text-sm font-medium text-paper">{p.name}</div>
                            <div className="mt-0.5 font-mono text-xs text-faint">
                                {addr(p.merchant)}
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right font-mono text-sm text-paper">
                                {usdc(p.price)}
                                <span className="text-faint"> / {duration(p.interval)}</span>
                            </div>
                            {!mine ? (
                                <SubscribeButton plan={p} />
                            ) : live ? (
                                // Ink, not a box (boxes = buttons). Dot is static — the
                                // pulse belongs to ACTIVE in Your subs alone.
                                <span className={`${stamp} text-mint`}>
                                    <span className="size-1 rounded-full bg-mint" />
                                    subscribed
                                </span>
                            ) : (
                                // Indexer stores subId as bare hex; viem needs the 0x prefix.
                                <RenewButton subId={to0x(mine.subId)} planName={p.name} />
                            )}
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}
