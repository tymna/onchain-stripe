'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { parseUnits, parseEventLogs } from 'viem';
import { useCreatePlan } from '../hooks/useCreatePlan';
import { useCanceledToast } from '../hooks/useCanceledToast';
import { isCanceled } from '../lib/errors';
import { subscriptionManagerAbi } from '../lib/contract';
import { upsertPlan } from '../lib/plansCache';
import { ActionButton } from './ActionButton';
import { Modal } from './Modal';
import { field, primaryBtn } from './ui';

// Interval presets → seconds (the contract's unit), so the merchant picks a period
// instead of typing raw seconds. 86_400 = one day.
// Exported so the merchant "edit plan" form reuses the exact same presets — one
// source of truth means create and update can never drift apart.
export const INTERVALS = [
    { label: 'Day', seconds: 86_400 },
    { label: 'Week', seconds: 7 * 86_400 },
    { label: 'Month', seconds: 30 * 86_400 },
    { label: 'Year', seconds: 365 * 86_400 },
];

// USDC has 6 decimals: the merchant types dollars, the contract stores base units.
// parseUnits throws on a malformed string, so guard it — empty/typo → 0 → not submittable.
// Exported so the update form parses prices identically (same 6-decimal habit).
export function toBaseUnits(dollars: string): bigint {
    try {
        return parseUnits(dollars || '0', 6);
    } catch {
        return BigInt(0);
    }
}

function Form({ onDone }: { onDone: () => void }) {
    const [name, setName] = useState('');
    const [price, setPrice] = useState('');
    const [seconds, setSeconds] = useState(INTERVALS[2].seconds); // default: Month
    const [tried, setTried] = useState(false);

    const { createPlan, canSubmit, isPending, isConfirming, isConfirmed, receipt, error } =
        useCreatePlan(name.trim(), toBaseUnits(price), BigInt(seconds));
    const busy = isPending || isConfirming;
    const valid = name.trim().length > 0; // contract allows an empty name; we don't

    // A rejected signature = changed mind: toast it and close the modal; only
    // real failures stay rendered inline below the button.
    useCanceledToast(error, onDone);

    const queryClient = useQueryClient();
    // On confirm, insert the new plan into the cache optimistically so it appears
    // instantly — the DB mirror won't have it until Goldsky indexes PlanCreated.
    // The planId is assigned on-chain (nextPlanId), so we can't know it from the
    // form; decode it (plus the merchant) straight from the confirmed receipt's
    // PlanCreated log. The 30s poll reconciles with the DB once it catches up.
    useEffect(() => {
        if (!isConfirmed || !receipt) return;
        const [created] = parseEventLogs({
            abi: subscriptionManagerAbi,
            eventName: 'PlanCreated',
            logs: receipt.logs,
        });
        if (created) {
            upsertPlan(queryClient, {
                planId: Number(created.args.planId),
                merchant: created.args.merchant.toLowerCase(), // indexer stores lowercase
                name: created.args.name,
                price: created.args.price.toString(), // base units as a string (API shape)
                interval: Number(created.args.interval),
                active: true, // new plans start active
            });
        }
        toast.success('Plan created');
        onDone();
    }, [isConfirmed, receipt, queryClient, onDone]);

    return (
        <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-fog">
                Name
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Pro"
                    className={field}
                />
            </label>
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
                    createPlan();
                }}
                disabled={!canSubmit || busy || !valid}
                className={primaryBtn}
            >
                {busy ? 'Creating…' : 'Create plan'}
            </button>
            {tried && error && !isCanceled(error) && (
                <p className="text-xs text-red-400">{error.message}</p>
            )}
        </div>
    );
}

export function CreatePlan() {
    const [open, setOpen] = useState(false);
    return (
        <>
            <ActionButton label="Create plan" onClick={() => setOpen(true)} />
            <Modal open={open} onClose={() => setOpen(false)} title="Create plan">
                {/* mount the form only while open, so its hook + state reset each time */}
                {open && <Form onDone={() => setOpen(false)} />}
            </Modal>
        </>
    );
}
