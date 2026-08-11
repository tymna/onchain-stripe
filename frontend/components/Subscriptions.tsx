'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { useSubscriptions } from '../hooks/useSubscriptions';
import { usePlans, type Plan } from '../hooks/usePlans';
import { useCancel } from '../hooks/useCancel';
import { useCanceledToast } from '../hooks/useCanceledToast';
import { isCanceled } from '../lib/errors';
import { useNow } from '../hooks/useNow';
import { useSubOverrides } from '../hooks/useSubOverrides';
import { date, to0x } from '../lib/format';
import { setSubOverride, getSubOverride, mergePendingSubs } from '../lib/subOverrides';
import { Empty } from './Empty';
import { RenewButton } from './RenewButton';
import { listShell, rowHover, rowBtn, listToggle, stamp } from './ui';

// Subscriber view. Lists the connected wallet's subscriptions. Active-ness is
// DERIVED here, never stored: a sub is Active only if it isn't cancelled and
// hasn't expired — otherwise Cancelled or Lapsed. Matches the contract, where a
// lapse fires no event, so there's no stored flag worth trusting.

// The row shape, derived straight from the hook's return so it can't drift from
// what the API actually sends (no second copy of the type to keep in sync).
type Subscription = NonNullable<ReturnType<typeof useSubscriptions>['data']>[number];

type Status = 'Active' | 'Cancelled' | 'Lapsed';

function statusOf(cancelled: boolean, expiresAt: string, now: Date): Status {
    if (cancelled) return 'Cancelled';
    return new Date(expiresAt) > now ? 'Active' : 'Lapsed';
}

// No boxes: a box means "press me" (Cancel/Renew); a status is just ink on the
// statement line — color carries the state, the word confirms it.
const badge: Record<Status, string> = {
    Active: 'text-mint',
    Cancelled: 'text-fog',
    Lapsed: 'text-amber-300',
};

// Active earns the one moving part: a mint pulse dot (money is flowing; nothing else pulses).
function StatusBadge({ status }: { status: Status }) {
    return (
        <span className={`${stamp} ${badge[status]}`}>
            {status === 'Active' && <span className="size-1 animate-pulse rounded-full bg-mint" />}
            {status}
        </span>
    );
}

// One row owns one cancel: React needs useCancel(subId) called per component,
// not inside a .map() callback, so each row is its own component.
function SubscriptionRow({ sub, now, plan }: { sub: Subscription; now: Date; plan?: Plan }) {
    // Merge session-local overrides over the API row: the DB mirror trails the
    // chain by the indexer's lag, so without this a cancel or renew you just
    // signed would repaint stale on the next poll until Goldsky catches up.
    const override = getSubOverride(sub.subId);
    const cancelled = override?.cancelled ?? sub.cancelled;
    const expiresAt = override?.expiresAt ?? sub.expiresAt;
    const status = statusOf(cancelled, expiresAt, now);
    const planName = plan?.name;
    // Disable-don't-delete: an inactive plan blocks renew on-chain, so don't even
    // offer the modal — show a pill instead. The flag comes from the DB mirror
    // (may lag a beat); the modal's on-chain read + pre-send simulate stay the
    // hard guards if a plan flips between poll and click.
    const planDisabled = plan?.active === false;
    // 'paid til' vs 'ended': a cancelled sub keeps its paid-through date (renew resumes
    // from it), so while that date is still ahead, show the time isn't lost.
    const when =
        status === 'Active'
            ? 'expires'
            : status === 'Lapsed'
              ? 'expired'
              : new Date(expiresAt) > now
                ? 'paid til'
                : 'ended';

    const queryClient = useQueryClient();
    const subId = to0x(sub.subId); // indexer stores bare hex; viem needs 0x-prefixed bytes32
    const { cancel, canSubmit, isPending, isConfirming, isConfirmed, error } = useCancel(subId);
    const busy = isPending || isConfirming;
    // Only surface an error the user actually caused. useCancel simulates in the
    // background, so a lapsed sub's simulate revert would otherwise show unbidden.
    const [tried, setTried] = useState(false);
    // No modal to close on a row action — the rejection just toasts.
    useCanceledToast(error);

    // On confirm: remember the cancel locally FIRST (the DB mirror won't show it
    // until the indexer catches up), then refresh the views. The override keeps
    // this row Cancelled across every poll in between; metrics stay DB-computed
    // and lag the same way until Goldsky indexes the event.
    useEffect(() => {
        if (isConfirmed) {
            setSubOverride(sub.subId, { cancelled: true });
            toast.success('Subscription cancelled');
            queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
            queryClient.invalidateQueries({ queryKey: ['metrics'] });
        }
    }, [isConfirmed, queryClient, sub.subId]);

    return (
        <li className={`px-4 py-3.5 ${rowHover}`}>
            <div className="flex items-center justify-between gap-4">
                <div>
                    <div className="flex items-baseline gap-2.5">
                        <span className="text-sm font-medium text-paper">
                            {planName ?? `Plan #${sub.planId}`}
                        </span>
                        {/* A note about the PLAN, so it lives with the plan's name — not in
                            the action cluster where it read as one more button. A disabled
                            plan blocks renew on-chain whatever the sub's status: on an off
                            sub it explains the missing Renew; on an Active sub it's the
                            heads-up this will lapse with no way back until the merchant
                            re-enables. title = hover explanation. */}
                        {planDisabled && (
                            <span
                                title="The merchant disabled this plan — renewals are paused until it’s re-enabled."
                                className={`${stamp} cursor-help text-faint`}
                            >
                                plan disabled
                            </span>
                        )}
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-faint">
                        {when} {date(expiresAt)}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Renew serves two cases with one button: reactivation (Lapsed/
                        Cancelled) and early extension (Active — the contract dates it
                        max(oldExpiry, now) + interval, so paying early loses nothing).
                        Hidden only when the plan is disabled: renew would revert.
                        Reuse the already 0x-prefixed subId const above; never the raw sub.subId. */}
                    {!planDisabled && (
                        <RenewButton
                            subId={subId}
                            planName={planName ?? `Plan #${sub.planId}`}
                            action={status === 'Active' ? 'Extend' : 'Renew'}
                        />
                    )}
                    {status === 'Active' && (
                        <button
                            onClick={() => {
                                setTried(true);
                                cancel();
                            }}
                            disabled={!canSubmit || busy}
                            className={rowBtn}
                        >
                            {busy ? 'Cancelling…' : 'Cancel'}
                        </button>
                    )}
                    <StatusBadge status={status} />
                </div>
            </div>
            {tried && error && !isCanceled(error) && (
                <p className="mt-1 text-xs text-red-400">{error.message}</p>
            )}
        </li>
    );
}

export function Subscriptions({ subscriber }: { subscriber?: `0x${string}` }) {
    const { data, isLoading, error } = useSubscriptions(subscriber);
    const { data: plans } = usePlans();
    const now = useNow();
    // Re-render when a cancel/renew confirms — rows and the fold filters below
    // read getSubOverride, and the poll alone may skip the re-render (stale data
    // comes back identical, so React Query doesn't notify).
    useSubOverrides();
    // Inactive rows (cancelled/lapsed) fold away by default — history, not workload.
    // Hook must run before the early returns below (hook order can't change).
    const [showInactive, setShowInactive] = useState(false);

    // /subscriptions returns only planId; the name AND active flag live in /plans.
    // Join them client-side so a row shows "secondewqe" instead of "Plan #3" and
    // knows whether its plan still accepts renewals.
    const planByPlanId = new Map(plans?.map((p) => [p.planId, p] as const));

    // Append subs created THIS session that the DB hasn't indexed yet — before
    // the empty check, so a first-ever subscribe shows its row immediately
    // instead of "No subscriptions yet" until the indexer catches up. Filtered
    // by the connected wallet: a pending row written under a previous wallet
    // must not leak into this one after a switch.
    const rows = mergePendingSubs(data ?? []).filter(
        (s) => s.subscriber === subscriber?.toLowerCase(),
    );

    if (!subscriber) return <Empty>Connect a wallet to view your subscriptions.</Empty>;
    if (isLoading) return <Empty>Loading subscriptions…</Empty>;
    if (error) return <Empty tone="error">Couldn’t load subscriptions: {error.message}</Empty>;
    if (!rows.length) return <Empty>No subscriptions yet.</Empty>;

    // Same derived active-ness as the row badge (incl. the session-local
    // overrides — else a just-cancelled row would still count as Active here
    // while its own badge says Cancelled): anything not Active is history.
    const effStatus = (s: Subscription) => {
        const o = getSubOverride(s.subId);
        return statusOf(o?.cancelled ?? s.cancelled, o?.expiresAt ?? s.expiresAt, now);
    };
    // Cancelled/lapsed rows fold away immediately — including one cancelled a
    // second ago (the toast + the fold counter ticking up confirm the action).
    const hidden = rows.filter((s) => effStatus(s) !== 'Active');
    const visible = showInactive ? rows : rows.filter((s) => effStatus(s) === 'Active');

    return (
        <ul className={listShell}>
            {visible.map((s) => (
                <SubscriptionRow
                    key={s.subId}
                    sub={s}
                    now={now}
                    plan={planByPlanId.get(s.planId)}
                />
            ))}
            {hidden.length > 0 && (
                <li>
                    <button onClick={() => setShowInactive(!showInactive)} className={listToggle}>
                        {showInactive
                            ? `hide ${hidden.length} inactive`
                            : `show ${hidden.length} inactive`}
                    </button>
                </li>
            )}
        </ul>
    );
}
