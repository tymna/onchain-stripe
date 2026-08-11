'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { formatUnits } from 'viem';
import { usePlans } from '../hooks/usePlans';
import { useUpdatePlan } from '../hooks/useUpdatePlan';
import { useSetPlanActive } from '../hooks/useSetPlanActive';
import { useCanceledToast } from '../hooks/useCanceledToast';
import { isCanceled } from '../lib/errors';
import { INTERVALS, toBaseUnits } from './CreatePlan';
import { patchPlan } from '../lib/plansCache';
import { usdc, duration } from '../lib/format';
import { Empty } from './Empty';
import { Modal } from './Modal';
import { field, primaryBtn, rowBtn, listShell, rowHover, listToggle, stamp } from './ui';

// Merchant view. Unlike the subscriber catalog (Plans.tsx, global + active-only),
// this lists ONLY the connected merchant's own plans and INCLUDES inactive ones:
// the contract's rule is disable-don't-delete, so a merchant needs to see a
// disabled plan (greyed) to re-enable it — it never disappears.

// Derive the row shape straight from the hook so it can't drift from what the API
// actually sends (no second copy of the type to keep in sync).
type Plan = NonNullable<ReturnType<typeof usePlans>['data']>[number];

// ---- UPDATE FORM ---- //

// Name is fixed (the contract's updatePlan takes only price + interval), so this
// form edits just those two. Prefilled with the plan's current values so the
// merchant tweaks from where it is, not a blank slate.
function UpdateForm({ plan, onDone }: { plan: Plan; onDone: () => void }) {
    // price arrives as base units (string, e.g. "10000000"); formatUnits turns it
    // back into the dollar string the input expects ("10"). interval is already
    // seconds, matching the select's option values, so it seeds directly.
    const [price, setPrice] = useState(() => formatUnits(BigInt(plan.price), 6));
    const [seconds, setSeconds] = useState(plan.interval);
    const [tried, setTried] = useState(false);

    // planId is a number from the API; every contract hook wants bigint → BigInt().
    // Contract rule: price/interval changes are FORWARD-ONLY — they never touch time
    // a subscriber already paid for, the new values apply to future renewals only.
    const { updatePlan, canSubmit, isPending, isConfirming, isConfirmed, error } = useUpdatePlan(
        BigInt(plan.planId),
        toBaseUnits(price),
        BigInt(seconds),
    );
    const busy = isPending || isConfirming;
    const valid = toBaseUnits(price) > BigInt(0); // a zero price is a typo, not a plan

    // Rejected signature = changed mind → toast + close (real failures stay inline).
    useCanceledToast(error, onDone);

    const queryClient = useQueryClient();
    // On confirm, patch the edited price/interval into the cache optimistically so
    // it shows immediately, then close. The DB mirror lags (Goldsky must index
    // PlanUpdated first); the 30s poll reconciles once it catches up. We know the
    // planId already, so no receipt decoding needed — just write the submitted
    // values in API shape (price = base-unit string, interval = seconds).
    useEffect(() => {
        if (isConfirmed) {
            toast.success('Plan updated');
            patchPlan(queryClient, plan.planId, {
                price: toBaseUnits(price).toString(),
                interval: seconds,
            });
            onDone();
        }
    }, [isConfirmed, queryClient, onDone, plan.planId, price, seconds]);

    return (
        <div className="flex flex-col gap-3">
            {/* Name is read-only context — it's the row's identity, not an editable field. */}
            <div className="text-sm font-medium text-paper">{plan.name}</div>
            <label className="flex flex-col gap-1 text-xs text-fog">
                Price (USDC)
                <input
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    inputMode="decimal"
                    placeholder="10"
                    className={field}
                />
            </label>
            <label className="flex flex-col gap-1 text-xs text-fog">
                Billing period
                <select
                    value={seconds}
                    onChange={(e) => setSeconds(Number(e.target.value))}
                    className={field}
                >
                    {INTERVALS.map((i) => (
                        <option key={i.seconds} value={i.seconds}>
                            {i.label}
                        </option>
                    ))}
                </select>
            </label>

            <button
                onClick={() => {
                    setTried(true);
                    updatePlan();
                }}
                disabled={!canSubmit || busy || !valid}
                className={primaryBtn}
            >
                {busy ? 'Saving…' : 'Save changes'}
            </button>
            {tried && error && !isCanceled(error) && (
                <p className="text-xs text-red-400">{error.message}</p>
            )}
        </div>
    );
}

// ---- ROW ---- //

// One row owns one plan's controls. The wagmi hooks (useSetPlanActive here,
// useUpdatePlan inside the modal form) must be called per-component, not inside a
// .map() callback — so each plan is its own component, like SubscriptionRow.
function MerchantPlanRow({ plan }: { plan: Plan }) {
    const [open, setOpen] = useState(false); // Update modal
    const [tried, setTried] = useState(false);

    // Set active is a single-step write (no approve, no modal): flip to the opposite
    // of the current state. Only the plan's own merchant may call it (per-row auth).
    const { setPlanActive, canSubmit, hash, isPending, isConfirming, isConfirmed, error } =
        useSetPlanActive(BigInt(plan.planId), !plan.active);
    const busy = isPending || isConfirming;
    // No modal to close on a row action — the rejection just toasts.
    useCanceledToast(error);

    const queryClient = useQueryClient();
    // Latch on the tx hash: the optimistic patch below flips plan.active, which is
    // a dep of this effect — without the latch it would re-run (isConfirmed stays
    // true), patch the flag back, and ping-pong forever ("Maximum update depth").
    // One patch per confirmed tx; a fresh toggle gets a fresh hash and runs again.
    const patched = useRef<string>(undefined);
    useEffect(() => {
        if (!isConfirmed || !hash || patched.current === hash) return;
        patched.current = hash;
        toast.success(plan.active ? 'Plan disabled' : 'Plan enabled');
        // Flip the active flag in the cache optimistically (the new value is the
        // opposite of the current one — same as what we sent on-chain), so the row
        // greys/ungreys instantly. Goldsky indexes PlanStatusChanged with a lag; the
        // 30s poll brings the authoritative DB value once it catches up.
        patchPlan(queryClient, plan.planId, { active: !plan.active });
    }, [isConfirmed, hash, queryClient, plan.planId, plan.active]);

    return (
        <li className={`flex items-center justify-between gap-4 px-4 py-3.5 ${rowHover}`}>
            {/* Grey an inactive plan so it reads as "off but re-enablable", not deleted.
                The opacity transition makes the enable/disable flip visibly smooth. */}
            <div className={`transition-opacity duration-300 ${plan.active ? '' : 'opacity-50'}`}>
                <div className="flex items-center gap-2 text-sm font-medium text-paper">
                    {plan.name}
                    {!plan.active && <span className={`${stamp} text-fog`}>inactive</span>}
                </div>
                <div className="mt-0.5 font-mono text-sm text-paper">
                    {usdc(plan.price)}
                    <span className="text-faint"> / {duration(plan.interval)}</span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button onClick={() => setOpen(true)} className={rowBtn}>
                    Update
                </button>
                {/* Toggle: label + toast read off the CURRENT state (what the click undoes). */}
                <button
                    onClick={() => {
                        setTried(true);
                        setPlanActive();
                    }}
                    disabled={!canSubmit || busy}
                    className={rowBtn}
                >
                    {busy
                        ? plan.active
                            ? 'Disabling…'
                            : 'Enabling…'
                        : plan.active
                          ? 'Disable'
                          : 'Enable'}
                </button>
            </div>

            <Modal open={open} onClose={() => setOpen(false)} title="Update plan">
                {/* mount the form only while open, so its hook + inputs reset each time */}
                {open && <UpdateForm plan={plan} onDone={() => setOpen(false)} />}
            </Modal>

            {/* Only surface an error the user actually caused: useSetPlanActive simulates
                in the background, so a would-be revert would otherwise show unbidden. */}
            {tried && error && !isCanceled(error) && (
                <p className="w-full text-xs text-red-400">{error.message}</p>
            )}
        </li>
    );
}

// ---- LIST ---- //

export function MerchantPlans({ merchant }: { merchant?: `0x${string}` }) {
    // usePlans is global (no address arg); call it unconditionally, then filter —
    // hooks must run before any early return, so the wallet check comes after.
    const { data, isLoading, error } = usePlans();
    // Disabled plans fold away by default — they exist to be re-enabled some day,
    // not to fill the screen. Hook must also run before the early returns.
    const [showInactive, setShowInactive] = useState(false);

    if (!merchant) return <Empty>Connect a wallet to manage your plans.</Empty>;
    if (isLoading) return <Empty>Loading your plans…</Empty>;
    if (error) return <Empty tone="error">Couldn’t load plans: {error.message}</Empty>;

    // Addresses from the indexer are stored lowercase, so lowercase both sides —
    // a checksummed wallet address would otherwise never match.
    const mine = data?.filter((p) => p.merchant.toLowerCase() === merchant.toLowerCase()) ?? [];
    if (!mine.length) return <Empty>No plans yet — create one to get started.</Empty>;

    const inactive = mine.filter((p) => !p.active);
    const visible = showInactive ? mine : mine.filter((p) => p.active);

    return (
        <ul className={listShell}>
            {visible.map((p) => (
                <MerchantPlanRow key={p.planId} plan={p} />
            ))}
            {inactive.length > 0 && (
                <li>
                    <button onClick={() => setShowInactive(!showInactive)} className={listToggle}>
                        {showInactive
                            ? `hide ${inactive.length} inactive`
                            : `show ${inactive.length} inactive`}
                    </button>
                </li>
            )}
        </ul>
    );
}
