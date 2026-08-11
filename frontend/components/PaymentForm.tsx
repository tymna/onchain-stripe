'use client';

// Shared modal body for the USDC pull flows (Subscribe, Renew/Extend): periods
// input → ledger line (total vs balance) → one stepper button that IS the
// current step (Approve USDC first while the allowance is short). The money
// hooks (useSubscribe/useRenew) own all chain logic; the caller maps its own
// phase onto the generic one here and handles success ('done') itself — by the
// time 'done' fires, the modal is closing and this form unmounts.

import { useState } from 'react';
import { useUsdcBalance } from '../hooks/useUsdcBalance';
import { usdc } from '../lib/format';
import { isCanceled } from '../lib/errors';
import { field, primaryBtn } from './ui';

export type PaymentPhase = 'loading' | 'idle' | 'approving' | 'paying';

type PaymentFormProps = {
    phase: PaymentPhase;
    price: bigint | null; // per-period, read ON-CHAIN by the hook (null while loading)
    needsApproval: (periods: bigint) => boolean;
    approve: (periods: bigint) => void;
    pay: (periods: bigint) => void;
    action: string; // idle button word: 'Subscribe' | 'Renew' | 'Extend'
    actionBusy: string; // in-flight: 'Subscribing…' | 'Renewing…' | 'Extending…'
    error?: Error;
};

export function PaymentForm({
    phase,
    price,
    needsApproval,
    approve,
    pay,
    action,
    actionBusy,
    error,
}: PaymentFormProps) {
    // How many billing periods to pay upfront (the contract multiplies price × periods).
    const [periodsStr, setPeriodsStr] = useState('1');
    // Only nag after the user actually typed — on open the red balance figure
    // is signal enough; a warning before any input reads as shouting.
    const [touched, setTouched] = useState(false);
    const periods = Number(periodsStr);
    const validPeriods = Number.isInteger(periods) && periods >= 1;
    const mustApprove = validPeriods && needsApproval(BigInt(periods));

    // What this pays, from the price the hook read ON-CHAIN at open — exactly
    // what the contract charges (price × periods), never a DB estimate.
    const totalRaw = price !== null && validPeriods ? price * BigInt(periods) : null;
    const total = totalRaw !== null ? usdc(totalRaw.toString()) : '—';

    // Compare in base units, against the live on-chain balance. Blocking here
    // (not at the tx) matters because step 1 is a plain USDC approve — it would
    // succeed and buy nothing if the payment after it can't be made.
    const { data: balance } = useUsdcBalance();
    const insufficient = balance !== undefined && totalRaw !== null && totalRaw > balance;

    const busy = phase === 'approving' || phase === 'paying';
    // One button that IS the current step: approve first when the allowance is
    // short, pay once it isn't (approve success advances it automatically).
    const label =
        phase === 'loading'
            ? 'Loading…'
            : phase === 'approving'
              ? 'Approving USDC…'
              : phase === 'paying'
                ? actionBusy
                : mustApprove
                  ? 'Approve USDC'
                  : action;

    const confirm = () => {
        if (!validPeriods) return;
        if (mustApprove) approve(BigInt(periods));
        else pay(BigInt(periods));
    };

    return (
        <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-fog">
                Periods (billing intervals to pay upfront)
                <input
                    value={periodsStr}
                    onChange={(e) => {
                        setPeriodsStr(e.target.value);
                        setTouched(true);
                    }}
                    inputMode="numeric"
                    placeholder="1"
                    className={field}
                />
            </label>
            {/* Ledger line: what this costs on the left, what you have on the right. */}
            <p className="flex items-baseline justify-between text-xs text-faint">
                <span>
                    Total: <span className="font-mono text-paper">{total}</span>
                </span>
                {balance !== undefined && (
                    <span>
                        Balance:{' '}
                        <span
                            className={`font-mono ${insufficient ? 'text-red-400' : 'text-paper'}`}
                        >
                            {usdc(balance.toString())}
                        </span>
                    </span>
                )}
            </p>
            {touched && insufficient && (
                <p className="text-xs text-red-400">Not enough USDC for this total.</p>
            )}
            <button
                onClick={confirm}
                disabled={!validPeriods || busy || phase === 'loading' || insufficient}
                className={primaryBtn}
            >
                {label}
            </button>
            {error && !isCanceled(error) && <p className="text-xs text-red-400">{error.message}</p>}
        </div>
    );
}
